import { create } from 'zustand';
import type { StrategySummary } from '@/services/prompt/personas/parsers';

/**
 * Holds the "strategy currently being designed in the workspace".
 *
 * Every time the AI Strategist emits a parseable summary + code pair,
 * setDraft() is called; the caller is responsible for triggering the
 * SQLite / remote save (via strategyStore + cremote.createStrategyVersion).
 *
 * Separate from `strategyStore` because this draft may not yet be
 * persisted, and `workspaceStore` tracks mode/focus independently.
 */
interface WorkspaceDraftState {
  strategyId: string | null;
  version: number | null;
  name: string;
  code: string | null;
  summary: StrategySummary | null;
  /** Editable param values (numeric overrides). Default: summary.params. */
  params: Record<string, number | string>;

  // --- actions ---
  setDraft: (input: {
    strategyId?: string;
    version?: number;
    summary: StrategySummary;
    code: string;
  }) => void;
  updateParam: (key: string, value: number | string) => void;
  clear: () => void;
}

export const useWorkspaceDraftStore = create<WorkspaceDraftState>((set) => ({
  strategyId: null,
  version: null,
  name: '',
  code: null,
  summary: null,
  params: {},

  setDraft({ strategyId, version, summary, code }) {
    const params: Record<string, number | string> = {};
    if (summary.params) {
      for (const [k, v] of Object.entries(summary.params)) {
        if (typeof v === 'number' || typeof v === 'string') params[k] = v;
      }
    }
    set({
      strategyId: strategyId ?? null,
      version: version ?? null,
      name: summary.name,
      code,
      summary,
      params,
    });
  },
  updateParam(key, value) {
    set((prev) => ({ params: { ...prev.params, [key]: value } }));
  },
  clear() {
    set({
      strategyId: null,
      version: null,
      name: '',
      code: null,
      summary: null,
      params: {},
    });
  },
}));
