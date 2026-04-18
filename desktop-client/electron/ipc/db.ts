import type { IpcMain } from 'electron';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

let db: Database.Database | null = null;

/** Initialize the SQLite database and apply the schema. Idempotent. */
export function initDB(dbPath: string): void {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS strategies (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      type         TEXT NOT NULL CHECK(type IN ('strategy','screener')),
      code         TEXT NOT NULL,
      description  TEXT,
      status       TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
      is_favorite  INTEGER NOT NULL DEFAULT 0,
      tags         TEXT,
      version      INTEGER NOT NULL DEFAULT 1,
      parent_id    TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS strategies_type_idx ON strategies(type);
    CREATE INDEX IF NOT EXISTS strategies_parent_idx ON strategies(parent_id);

    CREATE TABLE IF NOT EXISTS conversations (
      id           TEXT PRIMARY KEY,
      title        TEXT,
      messages     TEXT NOT NULL DEFAULT '[]',
      strategy_id  TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS backtest_results (
      id                 TEXT PRIMARY KEY,
      strategy_id        TEXT NOT NULL,
      type               TEXT NOT NULL CHECK(type IN ('preview','full')),
      symbols            TEXT NOT NULL,
      config             TEXT NOT NULL,
      summary_metrics    TEXT,
      per_symbol_metrics TEXT,
      equity_curve       TEXT,
      trades             TEXT,
      remote_task_id     TEXT,
      created_at         TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS backtest_results_strategy_idx ON backtest_results(strategy_id);

    CREATE TABLE IF NOT EXISTS coin_lists (
      id          TEXT PRIMARY KEY,
      name        TEXT,
      symbols     TEXT NOT NULL,
      screener_id TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

/** Close the DB handle. Called on app quit. */
export function closeDB(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function requireDB(): Database.Database {
  if (!db) throw new Error('db not initialized');
  return db;
}

/** Register every IPC channel backed by the SQLite store. */
export function registerDBHandlers(ipcMain: IpcMain): void {
  // ---- strategies ----
  ipcMain.handle('db:strategies:create', (_e, s: any) => {
    const d = requireDB();
    const id = s.id ?? randomUUID();
    d.prepare(
      `INSERT INTO strategies (id, name, type, code, description, status, is_favorite, tags, version, parent_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      s.name,
      s.type,
      s.code,
      s.description ?? null,
      s.status ?? 'active',
      s.is_favorite ? 1 : 0,
      s.tags ? JSON.stringify(s.tags) : null,
      s.version ?? 1,
      s.parent_id ?? null,
    );
    return id;
  });

  ipcMain.handle('db:strategies:list', (_e, filter: any = {}) => {
    const d = requireDB();
    const where: string[] = [];
    const params: any[] = [];
    if (filter?.type) {
      where.push('type = ?');
      params.push(filter.type);
    }
    if (filter?.status) {
      where.push('status = ?');
      params.push(filter.status);
    }
    if (filter?.favoriteOnly) {
      where.push('is_favorite = 1');
    }
    if (filter?.search) {
      where.push('(name LIKE ? OR description LIKE ?)');
      const q = `%${filter.search}%`;
      params.push(q, q);
    }
    const sql = `SELECT * FROM strategies ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY updated_at DESC LIMIT ?`;
    params.push(filter?.limit ?? 100);
    const rows = d.prepare(sql).all(...params);
    return rows.map(inflateStrategy);
  });

  ipcMain.handle('db:strategies:get', (_e, id: string) => {
    const row = requireDB().prepare('SELECT * FROM strategies WHERE id = ?').get(id);
    return row ? inflateStrategy(row) : null;
  });

  ipcMain.handle('db:strategies:updateStatus', (_e, id: string, status: string) => {
    requireDB()
      .prepare(`UPDATE strategies SET status = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(status, id);
  });

  ipcMain.handle('db:strategies:toggleFavorite', (_e, id: string, value: boolean) => {
    requireDB()
      .prepare(`UPDATE strategies SET is_favorite = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(value ? 1 : 0, id);
  });

  ipcMain.handle('db:strategies:chain', (_e, id: string) => {
    const d = requireDB();
    const chain: any[] = [];
    let cursor: any = d.prepare('SELECT * FROM strategies WHERE id = ?').get(id);
    while (cursor) {
      chain.push(inflateStrategy(cursor));
      if (!cursor.parent_id) break;
      cursor = d.prepare('SELECT * FROM strategies WHERE id = ?').get(cursor.parent_id);
    }
    return chain;
  });

  // ---- conversations ----
  ipcMain.handle('db:conversations:create', (_e, c: any) => {
    const d = requireDB();
    const id = c.id ?? randomUUID();
    d.prepare(
      `INSERT INTO conversations (id, title, messages, strategy_id) VALUES (?, ?, ?, ?)`,
    ).run(id, c.title ?? null, JSON.stringify(c.messages ?? []), c.strategy_id ?? null);
    return id;
  });

  ipcMain.handle('db:conversations:appendMessage', (_e, id: string, msg: any) => {
    const d = requireDB();
    const row: any = d.prepare('SELECT messages FROM conversations WHERE id = ?').get(id);
    if (!row) throw new Error('conversation not found');
    const msgs = JSON.parse(row.messages);
    msgs.push(msg);
    d.prepare(`UPDATE conversations SET messages = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(JSON.stringify(msgs), id);
  });

  ipcMain.handle('db:conversations:list', (_e, limit = 50) => {
    const rows = requireDB()
      .prepare(`SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ?`)
      .all(limit);
    return rows.map(inflateConversation);
  });

  ipcMain.handle('db:conversations:get', (_e, id: string) => {
    const row = requireDB().prepare('SELECT * FROM conversations WHERE id = ?').get(id);
    return row ? inflateConversation(row) : null;
  });

  // ---- backtest_results ----
  ipcMain.handle('db:backtestResults:create', (_e, r: any) => {
    const d = requireDB();
    const id = r.id ?? randomUUID();
    d.prepare(
      `INSERT INTO backtest_results (id, strategy_id, type, symbols, config, summary_metrics,
                                     per_symbol_metrics, equity_curve, trades, remote_task_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id, r.strategy_id, r.type,
      JSON.stringify(r.symbols ?? []),
      JSON.stringify(r.config ?? {}),
      r.summary_metrics ? JSON.stringify(r.summary_metrics) : null,
      r.per_symbol_metrics ? JSON.stringify(r.per_symbol_metrics) : null,
      r.equity_curve ? JSON.stringify(r.equity_curve) : null,
      r.trades ? JSON.stringify(r.trades) : null,
      r.remote_task_id ?? null,
    );
    return id;
  });

  ipcMain.handle('db:backtestResults:list', (_e, filter: any = {}) => {
    const d = requireDB();
    const rows = filter?.strategy_id
      ? d.prepare(`SELECT * FROM backtest_results WHERE strategy_id = ? ORDER BY created_at DESC LIMIT ?`)
          .all(filter.strategy_id, filter.limit ?? 50)
      : d.prepare(`SELECT * FROM backtest_results ORDER BY created_at DESC LIMIT ?`)
          .all(filter?.limit ?? 50);
    return rows.map(inflateBacktestResult);
  });

  ipcMain.handle('db:backtestResults:get', (_e, id: string) => {
    const row = requireDB().prepare('SELECT * FROM backtest_results WHERE id = ?').get(id);
    return row ? inflateBacktestResult(row) : null;
  });

  // ---- coin_lists ----
  ipcMain.handle('db:coinLists:save', (_e, list: any) => {
    const d = requireDB();
    const id = list.id ?? randomUUID();
    const exists = d.prepare('SELECT id FROM coin_lists WHERE id = ?').get(id);
    if (exists) {
      d.prepare(
        `UPDATE coin_lists SET name = ?, symbols = ?, screener_id = ?,
         updated_at = datetime('now') WHERE id = ?`,
      ).run(list.name ?? null, JSON.stringify(list.symbols ?? []), list.screener_id ?? null, id);
    } else {
      d.prepare(
        `INSERT INTO coin_lists (id, name, symbols, screener_id) VALUES (?, ?, ?, ?)`,
      ).run(id, list.name ?? null, JSON.stringify(list.symbols ?? []), list.screener_id ?? null);
    }
    return id;
  });

  ipcMain.handle('db:coinLists:list', () => {
    const rows = requireDB().prepare('SELECT * FROM coin_lists ORDER BY updated_at DESC').all();
    return rows.map(inflateCoinList);
  });

  ipcMain.handle('db:coinLists:get', (_e, id: string) => {
    const row = requireDB().prepare('SELECT * FROM coin_lists WHERE id = ?').get(id);
    return row ? inflateCoinList(row) : null;
  });

  // ---- settings ----
  ipcMain.handle('db:settings:get', (_e, key: string) => {
    const row: any = requireDB().prepare('SELECT value FROM settings WHERE key = ?').get(key);
    if (!row) return null;
    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  });

  ipcMain.handle('db:settings:set', (_e, key: string, value: unknown) => {
    const payload = typeof value === 'string' ? value : JSON.stringify(value);
    requireDB()
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, payload);
  });
}

// -- row inflation helpers (parse JSON columns back to objects) --

function inflateStrategy(row: any) {
  return {
    ...row,
    tags: row.tags ? JSON.parse(row.tags) : [],
    is_favorite: !!row.is_favorite,
  };
}

function inflateConversation(row: any) {
  return {
    ...row,
    messages: row.messages ? JSON.parse(row.messages) : [],
  };
}

function inflateBacktestResult(row: any) {
  return {
    ...row,
    symbols: row.symbols ? JSON.parse(row.symbols) : [],
    config: row.config ? JSON.parse(row.config) : {},
    summary_metrics: row.summary_metrics ? JSON.parse(row.summary_metrics) : null,
    per_symbol_metrics: row.per_symbol_metrics ? JSON.parse(row.per_symbol_metrics) : null,
    equity_curve: row.equity_curve ? JSON.parse(row.equity_curve) : null,
    trades: row.trades ? JSON.parse(row.trades) : null,
  };
}

function inflateCoinList(row: any) {
  return {
    ...row,
    symbols: row.symbols ? JSON.parse(row.symbols) : [],
  };
}
