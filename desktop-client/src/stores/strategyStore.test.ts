import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStrategyStore } from './strategyStore';

const dbCalls: Array<{ op: string; args: unknown[] }> = [];
const remoteCalls: Array<{ op: string; args: unknown[] }> = [];

type Str = { id: string; name: string; code: string; type: 'strategy' | 'screener'; version: number; status: 'active' | 'inactive'; is_favorite: boolean; description?: string | null; updated_at?: string };

const store: Record<string, Str> = {};

beforeEach(() => {
  dbCalls.length = 0;
  remoteCalls.length = 0;
  for (const k of Object.keys(store)) delete store[k];
  store['S1'] = {
    id: 'S1', name: 'Base', type: 'strategy', code: 'original', version: 1,
    status: 'active', is_favorite: false, description: 'd',
  };
  (globalThis as unknown as { window: unknown }).window = (globalThis as unknown as { window: unknown }).window ?? {};
  (globalThis as unknown as { window: { claw?: unknown } }).window.claw = {
    db: {
      strategies: {
        list: async () => {
          dbCalls.push({ op: 'list', args: [] });
          return Object.values(store);
        },
        get: async (id: string) => {
          dbCalls.push({ op: 'get', args: [id] });
          return store[id] ?? null;
        },
        create: async (input: Str) => {
          dbCalls.push({ op: 'create', args: [input] });
          const id = 'NEW-' + (Object.keys(store).length + 1);
          store[id] = { ...input, id };
          return id;
        },
        toggleFavorite: async (id: string, v: boolean) => {
          dbCalls.push({ op: 'toggleFavorite', args: [id, v] });
          store[id].is_favorite = v;
        },
        updateStatus: async (id: string, s: 'active' | 'inactive') => {
          dbCalls.push({ op: 'updateStatus', args: [id, s] });
          store[id].status = s;
        },
        chain: async () => [],
      },
    },
  };
  useStrategyStore.setState({ current: null, list: [], selectedId: null, versions: {} });
});

vi.mock('@/services/remote/contract-client', () => ({
  cremote: {
    async listStrategyVersions(params: { strategy_id: string }) {
      remoteCalls.push({ op: 'listStrategyVersions', args: [params] });
      return {
        items: [
          { strategy_id: params.strategy_id, version: 2, code: 'v2', summary: 'second', created_at: 200 },
          { strategy_id: params.strategy_id, version: 1, code: 'v1', summary: 'first', created_at: 100 },
        ],
        next_cursor: null,
      };
    },
    async createStrategyVersion(params: { strategy_id: string; body: { code: string; summary?: string; parent_version?: number } }) {
      remoteCalls.push({ op: 'createStrategyVersion', args: [params] });
      return {
        strategy_id: params.strategy_id,
        version: 3,
        code: params.body.code,
        summary: params.body.summary,
        parent_version: params.body.parent_version,
        created_at: 300,
      };
    },
    async getStrategyVersion(params: { strategy_id: string; version: number }) {
      remoteCalls.push({ op: 'getStrategyVersion', args: [params] });
      return {
        strategy_id: params.strategy_id,
        version: params.version,
        code: `code-for-v${params.version}`,
        created_at: 100,
      };
    },
  },
  toErrorBody: () => ({ code: 'INTERNAL_ERROR', message: 'mock' }),
}));

describe('strategyStore versioning', () => {
  it('listVersions caches per strategy id', async () => {
    await useStrategyStore.getState().listVersions('S1');
    const cache = useStrategyStore.getState().versions['S1'];
    expect(cache.length).toBe(2);
    expect(cache[0].version).toBe(2);
  });

  it('createVersion prepends to the cached list', async () => {
    await useStrategyStore.getState().listVersions('S1');
    await useStrategyStore.getState().createVersion('S1', 'new code', 'summary');
    const cache = useStrategyStore.getState().versions['S1'];
    expect(cache[0].version).toBe(3);
    expect(cache[0].code).toBe('new code');
  });

  it('revertTo fetches old version + creates new with parent_version', async () => {
    await useStrategyStore.getState().revertTo('S1', 1);
    const create = remoteCalls.find((c) => c.op === 'createStrategyVersion');
    expect(create).toBeDefined();
    const body = (create!.args[0] as { body: { code: string; parent_version?: number; summary?: string } }).body;
    expect(body.code).toBe('code-for-v1');
    expect(body.parent_version).toBe(1);
    expect(body.summary).toMatch(/Revert to v1/);
  });

  it('duplicate creates a new strategy via db.create', async () => {
    await useStrategyStore.getState().load();
    const newId = await useStrategyStore.getState().duplicate('S1');
    expect(newId).toMatch(/^NEW-/);
    const create = dbCalls.find((c) => c.op === 'create');
    expect(create).toBeDefined();
    const input = create!.args[0] as { name: string; parent_id: string };
    expect(input.name).toContain('(copy)');
    expect(input.parent_id).toBe('S1');
  });

  it('select mutates selectedId', () => {
    useStrategyStore.getState().select('S1');
    expect(useStrategyStore.getState().selectedId).toBe('S1');
  });
});
