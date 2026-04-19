import type { IpcMain } from 'electron';

/** Remote backtest-engine API client. Runs in main process so renderer
 *  doesn't have to deal with CORS / cookies / connection retries.
 *
 *  The baseURL is seeded by registerRemoteHandlers() from the resolved
 *  AppConfig (see electron/config.ts) so there is no hardcoded URL left
 *  in this file. The renderer can still override it at any time by
 *  invoking `remote:setBaseURL` from Settings. */

let baseURL = '';

async function fetchJSON(url: string, init?: RequestInit) {
  const resp = await fetch(url, init);
  const ct = resp.headers.get('content-type') ?? '';
  const body = ct.includes('json') ? await resp.json() : await resp.text();
  if (!resp.ok) {
    const msg = typeof body === 'string' ? body : (body?.error ?? JSON.stringify(body));
    const err = new Error(`${resp.status} ${msg}`);
    (err as any).status = resp.status;
    (err as any).body = body;
    throw err;
  }
  return body;
}

export function registerRemoteHandlers(ipcMain: IpcMain, initialBaseURL: string): void {
  baseURL = initialBaseURL.replace(/\/+$/, '');

  ipcMain.handle('remote:setBaseURL', (_e, url: string) => {
    if (typeof url === 'string' && url) baseURL = url.replace(/\/+$/, '');
  });

  ipcMain.handle('remote:health', async () => {
    try {
      const body = await fetchJSON(`${baseURL}/healthz`);
      return { ok: true, data: body };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  });

  ipcMain.handle('remote:backtest:start', (_e, payload) =>
    fetchJSON(`${baseURL}/api/backtest/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );

  ipcMain.handle('remote:backtest:status', (_e, taskId: string) =>
    fetchJSON(`${baseURL}/api/backtest/status/${encodeURIComponent(taskId)}`),
  );

  ipcMain.handle('remote:backtest:result', (_e, taskId: string) =>
    fetchJSON(`${baseURL}/api/backtest/result/${encodeURIComponent(taskId)}`),
  );

  ipcMain.handle('remote:backtest:history', (_e, strategyId?: string, limit?: number) => {
    const params = new URLSearchParams();
    if (strategyId) params.set('strategy_id', strategyId);
    if (limit) params.set('limit', String(limit));
    const q = params.toString();
    return fetchJSON(`${baseURL}/api/backtest/history${q ? '?' + q : ''}`);
  });

  ipcMain.handle('remote:screener:start', (_e, payload) =>
    fetchJSON(`${baseURL}/api/screener/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );

  ipcMain.handle('remote:screener:result', (_e, taskId: string) =>
    fetchJSON(`${baseURL}/api/screener/result/${encodeURIComponent(taskId)}`),
  );

  ipcMain.handle('remote:strategies:create', (_e, payload) =>
    fetchJSON(`${baseURL}/api/strategies`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );

  // Generic passthrough used by the contract client (`cremote`). Lets
  // the renderer call any `/api/*` path without adding a per-endpoint
  // IPC channel. MSW interception only happens inside the renderer, so
  // when this channel is used the request goes to the real backend;
  // the renderer decides whether to route through here or intercept.
  ipcMain.handle(
    'remote:request',
    async (
      _e,
      path: string,
      opts: { method?: string; body?: unknown; query?: Record<string, unknown> } = {},
    ) => {
      const method = (opts.method ?? 'GET').toUpperCase();
      let qs = '';
      if (opts.query) {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(opts.query)) {
          if (v === undefined || v === null) continue;
          if (Array.isArray(v)) v.forEach((el) => params.append(k, String(el)));
          else params.set(k, String(v));
        }
        const s = params.toString();
        if (s) qs = '?' + s;
      }
      const init: RequestInit = { method };
      if (opts.body !== undefined) {
        init.headers = { 'content-type': 'application/json' };
        init.body = JSON.stringify(opts.body);
      }
      return fetchJSON(`${baseURL}${path}${qs}`, init);
    },
  );
}
