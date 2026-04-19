import { create } from 'zustand';
import { cremote, toErrorBody } from '@/services/remote/contract-client';
import type { components } from '@/types/api';

type TradeExplainResult = components['schemas']['TradeExplainResult'];

interface Entry {
  status: 'idle' | 'loading' | 'complete' | 'failed';
  result: TradeExplainResult | null;
  error: string | null;
}

interface TradeAnalysisState {
  byTradeId: Record<string, Entry>;
  loadForTrade: (params: { backtest_task_id: string; symbol: string; trade_id: string }) => Promise<void>;
  clear: () => void;
}

function empty(): Entry {
  return { status: 'idle', result: null, error: null };
}

export const useTradeAnalysisStore = create<TradeAnalysisState>((set, get) => ({
  byTradeId: {},

  async loadForTrade({ backtest_task_id, symbol, trade_id }) {
    const cur = get().byTradeId[trade_id];
    if (cur && (cur.status === 'loading' || cur.status === 'complete')) return;
    set((prev) => ({
      byTradeId: { ...prev.byTradeId, [trade_id]: { ...empty(), status: 'loading' } },
    }));
    try {
      const res = await cremote.explainTrade({ backtest_task_id, symbol, trade_id });
      set((prev) => ({
        byTradeId: {
          ...prev.byTradeId,
          [trade_id]: { status: 'complete', result: res, error: null },
        },
      }));
    } catch (err) {
      const body = toErrorBody(err);
      set((prev) => ({
        byTradeId: {
          ...prev.byTradeId,
          [trade_id]: { status: 'failed', result: null, error: `${body.code}: ${body.message}` },
        },
      }));
    }
  },

  clear() {
    set({ byTradeId: {} });
  },
}));
