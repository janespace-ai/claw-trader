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
  return {
    setBaseURL: vi.fn(async (_url: string) => {}),
    health: vi.fn(async () => ({ ok: true })),
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
