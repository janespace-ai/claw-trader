import { beforeEach, describe, expect, test } from 'vitest';
import { useSettingsStore } from './settingsStore';

/**
 * Fakes for the renderer-visible bridges exposed by preload. Each test
 * installs a fresh set on `window.claw` so the store's fallback chain
 * (SQLite → main-process config → build-time env → hardcoded default)
 * can be exercised independently.
 */
function installWindowClaw({
  settings,
  configURL,
  hasConfigAPI = true,
}: {
  settings: Map<string, unknown>;
  /** Value returned from `window.claw.config.get().remoteBaseURL`. */
  configURL?: string;
  /** When false, simulate browser-only mode (no config API exposed). */
  hasConfigAPI?: boolean;
} = { settings: new Map() }) {
  const settingsBridge = {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      return settings.get(key) as T | undefined;
    },
    async set<T = unknown>(key: string, value: T): Promise<void> {
      settings.set(key, value);
    },
  };
  const remoteBridge = {
    setBaseURL: async (_url: string) => {},
    health: async () => ({ ok: true }),
  };
  const configBridge = hasConfigAPI
    ? {
        get: async () => ({
          remoteBaseURL: configURL ?? '',
          source: 'config-file' as const,
          configPath: '/tmp/fake/claw-config.json',
        }),
      }
    : undefined;
  (window as any).claw = {
    db: { settings: settingsBridge },
    remote: remoteBridge,
    config: configBridge,
  };
  return settings;
}

describe('settingsStore — remote URL resolution', () => {
  beforeEach(() => {
    // Fresh defaults for every test. Vite's import.meta.env is set in
    // the test runner; we rely on VITE_REMOTE_BASE_URL NOT being set
    // during tests so env never wins unless a test monkey-patches it.
    useSettingsStore.setState({
      remoteBaseURL: 'http://localhost:8081',
      remoteConnected: null,
      language: 'en',
      theme: 'auto',
    });
    delete (import.meta.env as Record<string, unknown>).VITE_REMOTE_BASE_URL;
  });

  test('setRemoteBaseURL updates state and persists', async () => {
    const db = installWindowClaw({ settings: new Map() });
    await useSettingsStore.getState().setRemoteBaseURL('http://foo:9000');
    expect(useSettingsStore.getState().remoteBaseURL).toBe('http://foo:9000');
    expect(db.get('remote.baseURL')).toBe('http://foo:9000');
  });

  test('load() prefers persisted SQLite value over everything else', async () => {
    const db = new Map<string, unknown>();
    db.set('remote.baseURL', 'http://sqlite-wins:7000');
    installWindowClaw({
      settings: db,
      configURL: 'http://config-file:5555', // would win if SQLite were empty
    });
    (import.meta.env as Record<string, unknown>).VITE_REMOTE_BASE_URL = 'http://env:4444';

    await useSettingsStore.getState().load();

    expect(useSettingsStore.getState().remoteBaseURL).toBe('http://sqlite-wins:7000');
  });

  test('load() uses main-process config when SQLite is empty', async () => {
    installWindowClaw({
      settings: new Map(),
      configURL: 'http://config-file:5555',
    });
    (import.meta.env as Record<string, unknown>).VITE_REMOTE_BASE_URL = 'http://env:4444';

    await useSettingsStore.getState().load();

    expect(useSettingsStore.getState().remoteBaseURL).toBe('http://config-file:5555');
  });

  test('load() uses build-time env when SQLite and main-process config are empty', async () => {
    installWindowClaw({
      settings: new Map(),
      configURL: '', // main process says "fallback"
    });
    (import.meta.env as Record<string, unknown>).VITE_REMOTE_BASE_URL = 'http://env:4444';

    await useSettingsStore.getState().load();

    expect(useSettingsStore.getState().remoteBaseURL).toBe('http://env:4444');
  });

  test('load() falls back to hardcoded default when nothing is configured', async () => {
    installWindowClaw({ settings: new Map(), configURL: '' });
    await useSettingsStore.getState().load();
    expect(useSettingsStore.getState().remoteBaseURL).toBe('http://localhost:8081');
  });

  test('load() tolerates browser-only mode without the config API', async () => {
    installWindowClaw({ settings: new Map(), hasConfigAPI: false });
    (import.meta.env as Record<string, unknown>).VITE_REMOTE_BASE_URL = 'http://env:4444';

    await useSettingsStore.getState().load();

    // With no config API, env should win over the hardcoded fallback.
    expect(useSettingsStore.getState().remoteBaseURL).toBe('http://env:4444');
  });
});
