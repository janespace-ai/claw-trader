import { create } from 'zustand';
import type { Strategy } from '@/types/domain';

interface StrategyState {
  current: Strategy | null;
  list: Strategy[];

  load: (filter?: { type?: string; status?: string; favoriteOnly?: boolean }) => Promise<void>;
  setCurrent: (s: Strategy | null) => void;
  createFromCode: (input: {
    name: string;
    type: 'strategy' | 'screener';
    code: string;
    description?: string;
    parent_id?: string;
  }) => Promise<string>;
  toggleFavorite: (id: string, value: boolean) => Promise<void>;
  setStatus: (id: string, status: 'active' | 'inactive') => Promise<void>;
  chain: (id: string) => Promise<Strategy[]>;
}

export const useStrategyStore = create<StrategyState>((set, get) => ({
  current: null,
  list: [],

  async load(filter) {
    const list = (await window.claw.db.strategies.list(filter)) as Strategy[];
    set({ list });
  },

  setCurrent(s) {
    set({ current: s });
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
}));
