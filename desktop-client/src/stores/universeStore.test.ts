import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUniverseStore } from './universeStore';

vi.mock('@/services/remote/contract-client', () => ({
  cremote: {
    listSymbols: vi.fn(),
  },
}));

import { cremote } from '@/services/remote/contract-client';

const fixture = (n: number) =>
  Array.from({ length: n }).map((_, i) => ({
    symbol: `SYM${i}_USDT`,
    market: 'futures' as const,
    status: 'active' as const,
    rank: n - i,
  }));

beforeEach(() => {
  vi.clearAllMocks();
  // Reset the store to a known state before each test.
  useUniverseStore.setState({
    symbols: [],
    loading: false,
    error: null,
    lastLoadedAt: 0,
  });
  if (typeof localStorage !== 'undefined') localStorage.clear();
});

afterEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear();
});

describe('universeStore', () => {
  it('loadUniverse fetches from cremote and sorts by rank ascending', async () => {
    const items = fixture(3); // ranks 3, 2, 1
    (cremote.listSymbols as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      items,
      next_cursor: null,
    });
    await useUniverseStore.getState().loadUniverse();
    const sorted = useUniverseStore.getState().symbols.map((s) => s.rank);
    expect(sorted).toEqual([1, 2, 3]);
    expect(useUniverseStore.getState().loading).toBe(false);
    expect(useUniverseStore.getState().lastLoadedAt).toBeGreaterThan(0);
  });

  it('loadUniverse honors the 60s TTL when not forced', async () => {
    (cremote.listSymbols as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: fixture(2),
      next_cursor: null,
    });
    await useUniverseStore.getState().loadUniverse();
    const callCount1 = (cremote.listSymbols as unknown as ReturnType<typeof vi.fn>).mock
      .calls.length;
    // Immediate second call: should hit the in-memory TTL guard.
    await useUniverseStore.getState().loadUniverse();
    const callCount2 = (cremote.listSymbols as unknown as ReturnType<typeof vi.fn>).mock
      .calls.length;
    expect(callCount2).toBe(callCount1);
  });

  it('loadUniverse re-fetches when force=true', async () => {
    (cremote.listSymbols as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: fixture(2),
      next_cursor: null,
    });
    await useUniverseStore.getState().loadUniverse();
    await useUniverseStore.getState().loadUniverse({ force: true });
    expect(
      (cremote.listSymbols as unknown as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBe(2);
  });

  it('loadUniverse records error message on failure', async () => {
    (cremote.listSymbols as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('boom'),
    );
    await useUniverseStore.getState().loadUniverse();
    expect(useUniverseStore.getState().error).toBe('boom');
    expect(useUniverseStore.getState().loading).toBe(false);
  });
});
