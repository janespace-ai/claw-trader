import { contextBridge, ipcRenderer } from 'electron';
import type { AppConfig } from './config';

type Channel = string;

function invoke<T = unknown>(channel: Channel, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>;
}

function on(channel: Channel, listener: (...args: unknown[]) => void) {
  const wrap = (_: unknown, ...args: unknown[]) => listener(...args);
  ipcRenderer.on(channel, wrap);
  return () => ipcRenderer.removeListener(channel, wrap);
}

// Full surface exposed to the renderer. Grouped by namespace for clarity.
const bridge = {
  config: {
    /** Resolved startup config (remote URL + where it came from). The
     *  Settings store queries this once during load() to seed its
     *  initial value in priority order:
     *    SQLite user setting > this > hardcoded fallback. */
    get: () => invoke<AppConfig>('config:get'),
  },
  db: {
    strategies: {
      create: (s: unknown) => invoke('db:strategies:create', s),
      list: (filter?: unknown) => invoke('db:strategies:list', filter),
      get: (id: string) => invoke('db:strategies:get', id),
      updateStatus: (id: string, status: 'active' | 'inactive') =>
        invoke('db:strategies:updateStatus', id, status),
      toggleFavorite: (id: string, value: boolean) =>
        invoke('db:strategies:toggleFavorite', id, value),
      chain: (id: string) => invoke('db:strategies:chain', id),
    },
    conversations: {
      create: (c: unknown) => invoke('db:conversations:create', c),
      appendMessage: (id: string, msg: unknown) =>
        invoke('db:conversations:appendMessage', id, msg),
      list: (limit?: number) => invoke('db:conversations:list', limit),
      get: (id: string) => invoke('db:conversations:get', id),
    },
    backtestResults: {
      create: (r: unknown) => invoke('db:backtestResults:create', r),
      list: (filter?: unknown) => invoke('db:backtestResults:list', filter),
      get: (id: string) => invoke('db:backtestResults:get', id),
    },
    settings: {
      get: <T = string>(key: string) => invoke<T>('db:settings:get', key),
      set: (key: string, value: unknown) => invoke('db:settings:set', key, value),
    },
  },
  llm: {
    stream: (params: unknown) => invoke<{ streamId: string }>('llm:stream', params),
    stop: (streamId: string) => invoke('llm:stop', streamId),
    onChunk: (cb: (streamId: string, text: string) => void) =>
      on('llm:chunk', (streamId, text) => cb(streamId as string, text as string)),
    onDone: (cb: (streamId: string, full: string) => void) =>
      on('llm:done', (streamId, full) => cb(streamId as string, full as string)),
    onError: (cb: (streamId: string, err: string) => void) =>
      on('llm:error', (streamId, err) => cb(streamId as string, err as string)),
  },
  remote: {
    setBaseURL: (url: string) => invoke('remote:setBaseURL', url),
    health: () => invoke('remote:health'),
    /** Generic passthrough: cremote (contract client) routes all its
     *  calls through here. Legacy helpers below are kept for the
     *  screens that still use `remote.*` directly during migration. */
    fetch: (
      path: string,
      opts?: { method?: string; body?: unknown; query?: Record<string, unknown> },
    ) => invoke('remote:request', path, opts ?? {}),
    backtest: {
      start: (payload: unknown) => invoke('remote:backtest:start', payload),
      status: (taskId: string) => invoke('remote:backtest:status', taskId),
      result: (taskId: string) => invoke('remote:backtest:result', taskId),
      history: (strategyId?: string, limit?: number) =>
        invoke('remote:backtest:history', strategyId, limit),
    },
    screener: {
      start: (payload: unknown) => invoke('remote:screener:start', payload),
      result: (taskId: string) => invoke('remote:screener:result', taskId),
    },
    strategies: {
      create: (payload: unknown) => invoke('remote:strategies:create', payload),
    },
  },
};

contextBridge.exposeInMainWorld('claw', bridge);

export type ClawBridge = typeof bridge;
