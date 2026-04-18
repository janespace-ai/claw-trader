import { beforeEach, describe, expect, test } from 'vitest';
import { useSettingsStore } from './settingsStore';

describe('settingsStore', () => {
  beforeEach(async () => {
    // Fresh in-memory "DB" each test — overwrite the fake with a new one.
    const mem = new Map<string, unknown>();
    (window as any).claw.db.settings = {
      async get<T = unknown>(key: string): Promise<T | undefined> {
        return mem.get(key) as T | undefined;
      },
      async set<T = unknown>(key: string, value: T): Promise<void> {
        mem.set(key, value);
      },
    };
    useSettingsStore.setState({
      remoteBaseURL: 'http://localhost:8081',
      remoteConnected: null,
      language: 'en',
      theme: 'auto',
    });
  });

  test('setRemoteBaseURL updates state and persists', async () => {
    await useSettingsStore.getState().setRemoteBaseURL('http://foo:9000');
    expect(useSettingsStore.getState().remoteBaseURL).toBe('http://foo:9000');

    const persisted = await (window as any).claw.db.settings.get('remote.baseURL');
    expect(persisted).toBe('http://foo:9000');
  });

  test('load() pulls persisted remote URL', async () => {
    await (window as any).claw.db.settings.set('remote.baseURL', 'http://bar:7000');

    await useSettingsStore.getState().load();

    expect(useSettingsStore.getState().remoteBaseURL).toBe('http://bar:7000');
  });

  test('load() falls back to default when nothing persisted', async () => {
    await useSettingsStore.getState().load();
    expect(useSettingsStore.getState().remoteBaseURL).toBe('http://localhost:8081');
  });
});
