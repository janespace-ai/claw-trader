// universeStore — read-only browser of the full market universe
// (~200 symbols).  Powers the workspace-three-zone-layout left rail.
//
// Decoupled from any strategy: rows here are NEVER derived from
// strategy.draft_symbols.  See spec workspace-universe-rail.
//
// Caching: in-memory + 60s localStorage TTL under `claw:universe-cache`.
// On boot we hydrate from cache (instant first paint), then refetch in
// the background.

import { create } from 'zustand';
import { cremote } from '@/services/remote/contract-client';
import type { components } from '@/types/api';

export type UniverseSymbol = components['schemas']['Symbol'];

const CACHE_KEY = 'claw:universe-cache';
const CACHE_TTL_MS = 60_000;
const PAGE_LIMIT = 250; // a little headroom over "top 200"

interface CacheEnvelope {
  loadedAt: number;
  symbols: UniverseSymbol[];
}

interface UniverseState {
  symbols: UniverseSymbol[];
  loading: boolean;
  error: string | null;
  /** unix ms of last successful load — 0 means never loaded */
  lastLoadedAt: number;

  /** Fetch the universe from /api/symbols.  Honors the cache TTL: if
   *  the in-memory copy is fresh enough, returns immediately. */
  loadUniverse: (opts?: { force?: boolean }) => Promise<void>;
  /** Test/dev hook to seed without touching the network. */
  _seed: (symbols: UniverseSymbol[]) => void;
}

function readCache(): CacheEnvelope | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const env = JSON.parse(raw) as CacheEnvelope;
    if (typeof env?.loadedAt !== 'number' || !Array.isArray(env?.symbols)) {
      return null;
    }
    return env;
  } catch {
    return null;
  }
}

function writeCache(symbols: UniverseSymbol[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const env: CacheEnvelope = { loadedAt: Date.now(), symbols };
    localStorage.setItem(CACHE_KEY, JSON.stringify(env));
  } catch {
    // best-effort; quota exceeded etc.
  }
}

const cached = readCache();

export const useUniverseStore = create<UniverseState>((set, get) => ({
  symbols: cached?.symbols ?? [],
  loading: false,
  error: null,
  lastLoadedAt: cached?.loadedAt ?? 0,

  async loadUniverse(opts) {
    const force = opts?.force === true;
    const since = Date.now() - get().lastLoadedAt;
    if (!force && get().symbols.length > 0 && since < CACHE_TTL_MS) {
      return; // fresh enough
    }
    if (get().loading) return; // already in flight
    set({ loading: true, error: null });
    try {
      const page = await cremote.listSymbols({ limit: PAGE_LIMIT });
      const symbols = (page?.items ?? []) as UniverseSymbol[];
      // Sort by rank ascending (nulls last) so the universe naturally
      // shows BTC/ETH/etc at the top.
      symbols.sort((a, b) => {
        const ar = a.rank ?? Number.MAX_SAFE_INTEGER;
        const br = b.rank ?? Number.MAX_SAFE_INTEGER;
        return ar - br;
      });
      set({ symbols, loading: false, lastLoadedAt: Date.now() });
      writeCache(symbols);
    } catch (err) {
      set({
        loading: false,
        error:
          err instanceof Error
            ? err.message
            : typeof err === 'string'
              ? err
              : 'failed to load universe',
      });
    }
  },

  _seed(symbols) {
    set({ symbols, lastLoadedAt: Date.now(), error: null });
  },
}));
