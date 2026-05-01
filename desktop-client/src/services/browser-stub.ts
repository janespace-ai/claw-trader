/**
 * Browser-dev stub for the window.claw bridge that is normally injected
 * by Electron's preload script. Only loaded when running plain Vite (e.g.
 * Preview MCP screenshot runs). All "IPC" calls become localStorage-backed
 * no-ops or return seeded fixtures so the UI can render end-to-end.
 *
 * Triggered by: import this module from main.tsx before App mounts, and
 * it only installs itself if window.claw is undefined.
 */

const LS_PREFIX = 'claw-stub:';

function lsGet<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(LS_PREFIX + key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet<T>(key: string, value: T): void {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function uid(): string {
  return (crypto as any).randomUUID?.() ?? Math.random().toString(36).slice(2);
}

// ---- Seeded fixtures so the UI shows something interesting --------------

const SEED_STRATEGIES = [
  {
    id: 'stub-1',
    name: 'SMA Crossover v3',
    type: 'strategy',
    code: '# SMA(10/30) crossover + 4h EMA(50) trend filter\nfrom claw.strategy import Strategy\n\nclass MyStrategy(Strategy):\n    params = {\'fast\': [5, 10, 20], \'slow\': [20, 30, 50]}\n    def setup(self):\n        self.fast = self.indicator(\'SMA\', period=self.param(\'fast\', 10))\n        self.slow = self.indicator(\'SMA\', period=self.param(\'slow\', 30))\n    def on_bar(self, bar):\n        if self.fast.iloc[-1] > self.slow.iloc[-1]:\n            self.buy(size=1, leverage=3)\n        else:\n            self.sell(size=1, leverage=3)\n',
    description: 'SMA(10/30) crossover + 4h EMA(50) trend filter. Long/short with 3× leverage.',
    status: 'active',
    is_favorite: true,
    tags: ['trend', '1h'],
    version: 3,
    parent_id: null,
    created_at: '2026-04-17 10:00:00',
    updated_at: '2026-04-18 04:30:00',
  },
  {
    id: 'stub-2',
    name: 'Bollinger Breakout',
    type: 'strategy',
    code: '# Placeholder\nfrom claw.strategy import Strategy\nclass BB(Strategy):\n    def on_bar(self, bar): pass\n',
    description: 'BB(20, 2) breakout with volume confirmation. Long-only.',
    status: 'active',
    is_favorite: true,
    tags: ['breakout', '4h'],
    version: 1,
    parent_id: null,
    created_at: '2026-04-16 09:00:00',
    updated_at: '2026-04-17 22:00:00',
  },
  {
    id: 'stub-3',
    name: 'RSI Mean Reversion',
    type: 'strategy',
    code: '# Placeholder\nfrom claw.strategy import Strategy\nclass RSI(Strategy):\n    def on_bar(self, bar): pass\n',
    description: 'RSI(14) < 30 long, > 70 short. 5 selected symbols.',
    status: 'active',
    is_favorite: false,
    tags: ['meanrev', '1h'],
    version: 2,
    parent_id: null,
    created_at: '2026-04-15 14:00:00',
    updated_at: '2026-04-16 12:00:00',
  },
  {
    id: 'stub-4',
    name: 'High-Volume Screener',
    type: 'screener',
    code: '# Placeholder\nfrom claw.screener import Screener\nclass HV(Screener):\n    def filter(self, s, k, m): return m[\'volume_24h_quote\'] > 1e8\n',
    description: 'Volume > $100M on USDT 24h.',
    status: 'active',
    is_favorite: false,
    tags: [],
    version: 1,
    parent_id: null,
    created_at: '2026-04-14 11:00:00',
    updated_at: '2026-04-14 11:00:00',
  },
];

// Build a fake backtest result ~180 days with realistic-ish numbers.
function seedBacktestResult() {
  const days = 180;
  const startEquity = 10_000;
  const out: { ts: string; equity: number }[] = [];
  const now = new Date('2026-04-18T00:00:00Z').getTime();
  let equity = startEquity;
  for (let i = 0; i < days * 24; i++) {
    const drift = 0.0002 + Math.sin(i / 40) * 0.0004;
    const noise = (Math.random() - 0.48) * 0.004;
    equity = equity * (1 + drift + noise);
    if (i % 6 === 0) {
      out.push({ ts: new Date(now - (days * 24 - i) * 3600_000).toISOString(), equity });
    }
  }

  const trades = [];
  for (let i = 0; i < 80; i++) {
    const side = Math.random() > 0.4 ? 'long' : 'short';
    const entry = new Date(now - ((days - 1) * 24 - i * 48) * 3600_000);
    const exit = new Date(entry.getTime() + (3 + Math.random() * 40) * 3600_000);
    const pnl_pct = (Math.random() - 0.42) * 6;
    const price = 60000 + Math.random() * 12000;
    trades.push({
      symbol: ['BTC_USDT', 'ETH_USDT', 'SOL_USDT', 'LINK_USDT'][i % 4],
      side,
      entry_time: entry.toISOString(),
      exit_time: exit.toISOString(),
      entry_price: price,
      exit_price: price * (1 + pnl_pct / 100),
      size: 0.5,
      leverage: 3,
      pnl: pnl_pct * 30,
      return_pct: pnl_pct,
      commission: 2,
      duration_hours: (exit.getTime() - entry.getTime()) / 3_600_000,
    });
  }

  const symbols = ['BTC_USDT', 'ETH_USDT', 'SOL_USDT', 'LINK_USDT', 'AVAX_USDT', 'DOT_USDT'];
  const per_symbol: Record<string, any> = {};
  for (const s of symbols) {
    const r = (Math.random() - 0.3) * 20;
    per_symbol[s] = {
      all: {
        total_return: r,
        sharpe_ratio: 0.5 + Math.random() * 1.8,
        max_drawdown: -(5 + Math.random() * 15),
        win_rate: 40 + Math.random() * 25,
        profit_factor: 1 + Math.random() * 2,
        total_trades: 20 + Math.floor(Math.random() * 40),
        annualized_return: r * 2.2,
      },
      long: { total_return: r * 0.7, win_rate: 60, total_trades: 30 },
      short: { total_return: r * 0.3, win_rate: 42, total_trades: 20 },
    };
  }

  return {
    id: 'stub-bt-1',
    strategy_id: 'stub-1',
    type: 'full',
    symbols,
    config: {
      symbols,
      interval: '1h',
      from: '2025-10-18T00:00:00Z',
      to: '2026-04-18T00:00:00Z',
      initial_capital: 10000,
      commission: 0.0006,
      slippage: 0.0001,
      fill_mode: 'close',
    },
    summary_metrics: {
      all: {
        total_return: 45.2,
        annualized_return: 78.3,
        max_drawdown: -12.3,
        max_drawdown_duration: 18,
        profit_factor: 2.14,
        expectancy: 0.82,
        equity_final: 14520,
        equity_peak: 14890,
        volatility_ann: 28.4,
        downside_deviation: 18.5,
        var_95: -1.8,
        cvar_95: -2.6,
        max_consecutive_wins: 7,
        max_consecutive_losses: 4,
        sharpe_ratio: 1.82,
        sortino_ratio: 2.41,
        calmar_ratio: 6.37,
        omega_ratio: 1.55,
        win_rate: 58,
        risk_reward_ratio: 1.85,
        recovery_factor: 3.67,
        total_trades: 487,
        avg_trade_return: 0.093,
        avg_win: 2.48,
        avg_loss: -1.34,
        avg_trade_duration: 22,
        max_trade_duration: 94,
        long_trades: 285,
        short_trades: 202,
        best_trade: 8.4,
        worst_trade: -4.2,
      },
      long: {
        total_return: 38.2, sharpe_ratio: 2.05, max_drawdown: -8.1, win_rate: 63,
        total_trades: 285, profit_factor: 2.6, avg_win: 2.5, avg_loss: -1.2,
      },
      short: {
        total_return: 7.0, sharpe_ratio: 0.76, max_drawdown: -11.2, win_rate: 41,
        total_trades: 202, profit_factor: 1.32, avg_win: 1.8, avg_loss: -1.5,
      },
    },
    per_symbol_metrics: per_symbol,
    equity_curve: out,
    trades,
    remote_task_id: 'stub-task',
    created_at: new Date().toISOString(),
  };
}

// ---- Stub bridge -------------------------------------------------------

export function installBrowserStub(): void {
  if ((window as any).claw) return; // already provided by Electron preload

  const stub: any = {
    db: {
      strategies: {
        create: async (s: any) => {
          const id = s.id ?? uid();
          const list = lsGet<any[]>('strategies', SEED_STRATEGIES.slice());
          list.unshift({
            ...s, id, created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(), tags: s.tags ?? [],
            is_favorite: !!s.is_favorite, status: s.status ?? 'active',
            version: s.version ?? 1,
          });
          lsSet('strategies', list);
          return id;
        },
        list: async (filter: any = {}) => {
          const list = lsGet<any[]>('strategies', SEED_STRATEGIES.slice());
          return list.filter((s) => {
            if (filter?.type && s.type !== filter.type) return false;
            if (filter?.status && s.status !== filter.status) return false;
            if (filter?.favoriteOnly && !s.is_favorite) return false;
            return true;
          });
        },
        get: async (id: string) => {
          const list = lsGet<any[]>('strategies', SEED_STRATEGIES.slice());
          return list.find((s) => s.id === id) ?? null;
        },
        updateStatus: async (id: string, status: string) => {
          const list = lsGet<any[]>('strategies', SEED_STRATEGIES.slice());
          const i = list.findIndex((s) => s.id === id);
          if (i >= 0) {
            list[i].status = status;
            lsSet('strategies', list);
          }
        },
        toggleFavorite: async (id: string, value: boolean) => {
          const list = lsGet<any[]>('strategies', SEED_STRATEGIES.slice());
          const i = list.findIndex((s) => s.id === id);
          if (i >= 0) {
            list[i].is_favorite = value;
            lsSet('strategies', list);
          }
        },
        chain: async (id: string) => {
          const list = lsGet<any[]>('strategies', SEED_STRATEGIES.slice());
          return list.filter((s) => s.id === id);
        },
      },
      conversations: {
        create: async (c: any) => {
          const id = c.id ?? uid();
          const list = lsGet<any[]>('conversations', []);
          list.unshift({ ...c, id, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), messages: c.messages ?? [] });
          lsSet('conversations', list);
          return id;
        },
        appendMessage: async (id: string, msg: any) => {
          const list = lsGet<any[]>('conversations', []);
          const i = list.findIndex((c) => c.id === id);
          if (i >= 0) {
            list[i].messages.push(msg);
            list[i].updated_at = new Date().toISOString();
            lsSet('conversations', list);
          }
        },
        list: async () => lsGet<any[]>('conversations', []),
        get: async (id: string) => {
          const list = lsGet<any[]>('conversations', []);
          return list.find((c) => c.id === id) ?? null;
        },
      },
      backtestResults: {
        create: async (r: any) => {
          const id = r.id ?? uid();
          const list = lsGet<any[]>('backtest_results', [seedBacktestResult()]);
          list.unshift({ ...r, id });
          lsSet('backtest_results', list);
          return id;
        },
        list: async (filter: any = {}) => {
          const list = lsGet<any[]>('backtest_results', [seedBacktestResult()]);
          return filter?.strategy_id
            ? list.filter((r) => r.strategy_id === filter.strategy_id)
            : list;
        },
        get: async (id: string) => {
          const list = lsGet<any[]>('backtest_results', [seedBacktestResult()]);
          return list.find((r) => r.id === id) ?? null;
        },
      },
      settings: {
        get: async (key: string) => lsGet<any>(`setting:${key}`, null),
        set: async (key: string, value: any) => lsSet(`setting:${key}`, value),
      },
    },

    llm: {
      stream: async (params: any) => {
        // Simulated stream: deliver canned chunks so the chat UI animates.
        const streamId = uid();
        setTimeout(() => {
          const canned = [
            `Here's a basic SMA crossover strategy for you:`,
            ``,
            '```python',
            'from claw.strategy import Strategy',
            '',
            'class MyStrategy(Strategy):',
            '    params = {\'fast\': [5, 10, 20], \'slow\': [20, 30, 50]}',
            '',
            '    def setup(self):',
            '        # Pre-compute indicators on the primary bar',
            '        self.fast = self.indicator(\'SMA\', period=self.param(\'fast\', 10))',
            '        self.slow = self.indicator(\'SMA\', period=self.param(\'slow\', 30))',
            '',
            '    def on_bar(self, bar):',
            '        if self.fast.iloc[-1] > self.slow.iloc[-1]:',
            '            self.buy(size=1, leverage=3)',
            '        elif self.fast.iloc[-1] < self.slow.iloc[-1]:',
            '            self.sell(size=1, leverage=3)',
            '```',
            '',
            `This fires longs when SMA(10) crosses above SMA(30) and shorts on the reverse. ` +
            `The \`params\` block enables grid search — try it with **Run preview** first.`,
          ].join('\n');
          void params; // silence unused param warning in stub
          let i = 0;
          const tick = () => {
            if (i >= canned.length) {
              window.dispatchEvent(new CustomEvent('stub-llm-done', { detail: { streamId, full: canned } }));
              return;
            }
            const chunk = canned.slice(i, i + 8);
            i += 8;
            window.dispatchEvent(new CustomEvent('stub-llm-chunk', { detail: { streamId, text: chunk } }));
            setTimeout(tick, 50);
          };
          tick();
        }, 200);
        return { streamId };
      },
      stop: async () => undefined,
      onChunk: (cb: (streamId: string, text: string) => void) => {
        const fn = (e: any) => cb(e.detail.streamId, e.detail.text);
        window.addEventListener('stub-llm-chunk', fn as EventListener);
        return () => window.removeEventListener('stub-llm-chunk', fn as EventListener);
      },
      onDone: (cb: (streamId: string, full: string) => void) => {
        const fn = (e: any) => cb(e.detail.streamId, e.detail.full);
        window.addEventListener('stub-llm-done', fn as EventListener);
        return () => window.removeEventListener('stub-llm-done', fn as EventListener);
      },
      onError: () => () => undefined,
    },

    remote: {
      setBaseURL: async () => undefined,
      health: async () => ({ ok: true, data: { status: 'ok' } }),
      backtest: {
        start: async () => ({ task_id: 'stub-task', status: 'pending', mode: 'single' }),
        status: async () => ({ status: 'done' }),
        result: async () => ({ status: 'done', result: seedBacktestResult() }),
        history: async () => [],
      },
      screener: {
        start: async () => ({ task_id: 'stub-screener', status: 'pending' }),
        result: async () => ({ status: 'done', result: {
          total_symbols: 300,
          passed: 6,
          results: [
            { symbol: 'BTC_USDT', passed: true, score: 0.95, rank: 1 },
            { symbol: 'ETH_USDT', passed: true, score: 0.87, rank: 2 },
            { symbol: 'SOL_USDT', passed: true, score: 0.82, rank: 3 },
            { symbol: 'LINK_USDT', passed: true, score: 0.76, rank: 9 },
            { symbol: 'AVAX_USDT', passed: true, score: 0.72, rank: 14 },
            { symbol: 'DOT_USDT', passed: true, score: 0.68, rank: 17 },
          ],
        } }),
      },
      strategies: {
        create: async (s: any) => ({ id: uid(), name: s?.name ?? 'stub' }),
      },
    },
  };

  (window as any).claw = stub;

  // Seed an obviously-fake API key for the default provider so the chat UI
  // flows through the stub stream instead of short-circuiting on the
  // "API key invalid" check. Only applied on first boot.
  if (!localStorage.getItem(LS_PREFIX + 'setting:llm.providers')) {
    const fake = {
      openai:    { apiKey: 'stub-key', model: 'gpt-4o' },
      deepseek:  { apiKey: 'stub-key', model: 'deepseek-chat' },
      kimi:      { apiKey: 'stub-key', model: 'moonshot-v1-128k' },
      anthropic: { apiKey: 'stub-key', model: 'claude-sonnet-4-20250514' },
      google:    { apiKey: 'stub-key', model: 'gemini-2.0-flash' },
    };
    lsSet('setting:llm.providers', fake);
    lsSet('setting:llm.defaultProvider', 'anthropic');
  }

  // Helpful dev flag
  (window as any).__CLAW_STUB__ = true;
  // eslint-disable-next-line no-console
  console.info('[claw] browser-dev stub installed (no Electron preload detected)');
}
