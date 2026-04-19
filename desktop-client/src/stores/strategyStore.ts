import { create } from 'zustand';
import type { Strategy } from '@/types/domain';
import { cremote } from '@/services/remote/contract-client';
import type { components } from '@/types/api';

type StrategyVersion = components['schemas']['StrategyVersion'];

interface StrategyState {
  current: Strategy | null;
  list: Strategy[];
  /** Strategy whose version history is shown in the right-rail persona. */
  selectedId: string | null;
  /** Cached version list per strategy id. */
  versions: Record<string, StrategyVersion[]>;

  load: (filter?: { type?: string; status?: string; favoriteOnly?: boolean }) => Promise<void>;
  setCurrent: (s: Strategy | null) => void;
  select: (id: string | null) => void;
  createFromCode: (input: {
    name: string;
    type: 'strategy' | 'screener';
    code: string;
    description?: string;
    parent_id?: string;
  }) => Promise<string>;
  duplicate: (id: string) => Promise<string>;
  toggleFavorite: (id: string, value: boolean) => Promise<void>;
  setStatus: (id: string, status: 'active' | 'inactive') => Promise<void>;
  chain: (id: string) => Promise<Strategy[]>;

  listVersions: (strategyId: string) => Promise<StrategyVersion[]>;
  createVersion: (
    strategyId: string,
    code: string,
    summary?: string,
    parent_version?: number,
  ) => Promise<StrategyVersion>;
  revertTo: (strategyId: string, version: number) => Promise<StrategyVersion>;
}

export const useStrategyStore = create<StrategyState>((set, get) => ({
  current: null,
  list: [],
  selectedId: null,
  versions: {},

  async load(filter) {
    const list = (await window.claw.db.strategies.list(filter)) as Strategy[];
    set({ list });
  },

  setCurrent(s) {
    set({ current: s });
  },

  select(id) {
    set({ selectedId: id });
  },

  async duplicate(id) {
    const src = (await window.claw.db.strategies.get(id)) as Strategy;
    if (!src) throw new Error(`strategy ${id} not found`);
    const newId = await get().createFromCode({
      name: `${src.name} (copy)`,
      type: src.type,
      code: src.code,
      description: src.description ?? undefined,
      parent_id: src.id,
    });
    return newId;
  },

  async createFromCode(input) {
    const id = (await window.claw.db.strategies.create({
      ...input,
      status: 'active',
      is_favorite: false,
      version: 1,
    })) as string;
    await get().load();
    const created = (await window.claw.db.strategies.get(id)) as Strategy;
    set({ current: created });
    return id;
  },

  async toggleFavorite(id, value) {
    await window.claw.db.strategies.toggleFavorite(id, value);
    await get().load();
  },

  async setStatus(id, status) {
    await window.claw.db.strategies.updateStatus(id, status);
    await get().load();
  },

  async chain(id) {
    return (await window.claw.db.strategies.chain(id)) as Strategy[];
  },

  async listVersions(strategyId) {
    const res = await cremote.listStrategyVersions({ strategy_id: strategyId });
    const versions = res.items ?? [];
    set((prev) => ({ versions: { ...prev.versions, [strategyId]: versions } }));
    return versions;
  },

  async createVersion(strategyId, code, summary, parent_version) {
    const v = await cremote.createStrategyVersion({
      strategy_id: strategyId,
      body: { code, summary, parent_version },
    });
    // Optimistically append to cache.
    set((prev) => {
      const prior = prev.versions[strategyId] ?? [];
      return { versions: { ...prev.versions, [strategyId]: [v, ...prior] } };
    });
    return v;
  },

  async revertTo(strategyId, version) {
    const src = await cremote.getStrategyVersion({ strategy_id: strategyId, version });
    return get().createVersion(
      strategyId,
      src.code,
      `Revert to v${version}`,
      version,
    );
  },
}));
