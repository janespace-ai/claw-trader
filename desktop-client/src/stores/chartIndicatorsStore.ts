// chartIndicatorsStore — user's selected technical indicators for the
// workspace K-line.  Persisted in localStorage so the same set
// applies across every workspace session.
//
// Two arrays:
//  - overlays:  paint on the price scale (e.g. MA, BOLL, SAR, EMA, SMA)
//  - subcharts: stack vertically below the main chart (e.g. VOL, MACD,
//               RSI, KDJ, CCI)
//
// Subchart count is capped at 6 (UX guard — more than that is unreadable
// on a typical workspace window).

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const SUBCHART_CAP = 6;

// The catalog of indicators (overlays + subcharts) is now owned by
// `src/chart/indicators/registry.ts` — see `getOverlayIndicators()`
// and `getSubchartIndicators()`.  This store retains ONLY the
// persisted user selection state.

interface ChartIndicatorsState {
  overlays: string[];
  subcharts: string[];

  toggleOverlay: (name: string) => void;
  toggleSubchart: (name: string) => { ok: boolean; reason?: 'cap' };
  removeOverlay: (name: string) => void;
  removeSubchart: (name: string) => void;
  reset: () => void;
}

export const useChartIndicatorsStore = create<ChartIndicatorsState>()(
  persist(
    (set, get) => ({
      // D2 default: minimal — one overlay (MA) + one subchart (Volume).
      overlays: ['MA'],
      subcharts: ['VOL'],

      toggleOverlay(name) {
        const cur = get().overlays;
        if (cur.includes(name)) {
          set({ overlays: cur.filter((n) => n !== name) });
        } else {
          set({ overlays: [...cur, name] });
        }
      },
      toggleSubchart(name) {
        const cur = get().subcharts;
        if (cur.includes(name)) {
          set({ subcharts: cur.filter((n) => n !== name) });
          return { ok: true };
        }
        if (cur.length >= SUBCHART_CAP) {
          return { ok: false, reason: 'cap' };
        }
        set({ subcharts: [...cur, name] });
        return { ok: true };
      },
      removeOverlay(name) {
        set({ overlays: get().overlays.filter((n) => n !== name) });
      },
      removeSubchart(name) {
        set({ subcharts: get().subcharts.filter((n) => n !== name) });
      },
      reset() {
        set({ overlays: ['MA'], subcharts: ['VOL'] });
      },
    }),
    { name: 'claw:chart-indicators' },
  ),
);

export const SUBCHART_INDICATOR_CAP = SUBCHART_CAP;
