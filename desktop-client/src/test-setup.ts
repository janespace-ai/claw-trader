// Vitest setup for desktop-client.
//
// Supplies a minimal fake `window.claw` that satisfies the subset of
// IPC surface the unit tests touch. Individual tests can override
// further via `vi.stubGlobal` or direct assignment.

import { vi } from 'vitest';

// A tiny in-memory settings store that keys off string keys, matching
// the production IPC contract.
function makeFakeDB() {
  const mem = new Map<string, unknown>();
  return {
    settings: {
      async get<T = unknown>(key: string): Promise<T | undefined> {
        return mem.get(key) as T | undefined;
      },
      async set<T = unknown>(key: string, value: T): Promise<void> {
        mem.set(key, value);
      },
    },
    conversations: {},
    strategies: {},
  };
}

function makeFakeRemote() {
  // `fetch` is the generic passthrough used by cremote. Tests that
  // want specific shapes should override via `(window as any).claw.
  // remote.fetch = vi.fn(...)` or use MSW's `server.use(...)`.
  // Default: go through global fetch (MSW intercepts it in tests).
  return {
    setBaseURL: vi.fn(async (_url: string) => {}),
    health: vi.fn(async () => ({ ok: true })),
    fetch: vi.fn(
      async (
        path: string,
        opts: {
          method?: string;
          body?: unknown;
          query?: Record<string, unknown>;
        } = {},
      ) => {
        const method = (opts.method ?? 'GET').toUpperCase();
        const qs = opts.query
          ? '?' +
            new URLSearchParams(
              Object.entries(opts.query).reduce<Record<string, string>>(
                (acc, [k, v]) => {
                  if (v !== undefined && v !== null) acc[k] = String(v);
                  return acc;
                },
                {},
              ),
            ).toString()
          : '';
        const init: RequestInit = { method };
        if (opts.body !== undefined) {
          init.headers = { 'content-type': 'application/json' };
          init.body = JSON.stringify(opts.body);
        }
        // Prefix with an arbitrary base so Node's fetch accepts the
        // URL. MSW matches by pathname so the exact host is irrelevant.
        const resp = await fetch(`http://localhost${path}${qs}`, init);
        const ct = resp.headers.get('content-type') ?? '';
        const body = ct.includes('json') ? await resp.json() : await resp.text();
        if (!resp.ok) {
          const err = new Error(`${resp.status} ${resp.statusText}`);
          (err as any).status = resp.status;
          (err as any).body = body;
          throw err;
        }
        return body;
      },
    ),
    backtest: {
      start: vi.fn(),
      status: vi.fn(),
      result: vi.fn(),
      history: vi.fn(),
    },
    screener: {
      start: vi.fn(),
      result: vi.fn(),
    },
  };
}

(globalThis as any).window = (globalThis as any).window ?? {};
(globalThis as any).window.claw = {
  db: makeFakeDB(),
  remote: makeFakeRemote(),
};

// --- MSW Node server for contract-shaped fixtures ---------------------------
//
// Tests can `fetch('/api/...')` and get a canonical response from the
// committed examples. Individual tests can add per-test handlers via
// `server.use(...)` (imported from './mocks/node').
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './mocks/node';

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'bypass' });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});
