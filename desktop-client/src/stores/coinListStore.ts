import { create } from 'zustand';

interface CoinListState {
  symbols: string[];
  savedListId: string | null;

  set: (symbols: string[]) => void;
  add: (symbol: string) => void;
  remove: (symbol: string) => void;
  clear: () => void;
  saveAs: (name: string, screenerId?: string) => Promise<string>;
  load: (id: string) => Promise<void>;
}

export const useCoinListStore = create<CoinListState>((set, get) => ({
  symbols: [],
  savedListId: null,

  set(symbols) {
    set({ symbols });
  },
  add(symbol) {
    const cur = get().symbols;
    if (cur.includes(symbol)) return;
    set({ symbols: [...cur, symbol] });
  },
  remove(symbol) {
    set({ symbols: get().symbols.filter((s) => s !== symbol) });
  },
  clear() {
    set({ symbols: [], savedListId: null });
  },

  async saveAs(name, screenerId) {
    const id = (await window.claw.db.coinLists.save({
      name,
      symbols: get().symbols,
      screener_id: screenerId,
    })) as string;
    set({ savedListId: id });
    return id;
  },

  async load(id) {
    const row: any = await window.claw.db.coinLists.get(id);
    if (!row) return;
    set({ symbols: row.symbols, savedListId: id });
  },
}));
