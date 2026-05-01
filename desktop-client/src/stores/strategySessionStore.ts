// strategySessionStore — single source of truth for the unified-strategy-
// workspace tab.  Replaces the deleted workspaceDraftStore + screenerRunStore
// + autoRunStore + per-tab parts of conversationStore.
//
// Mental model:
//   · One ACTIVE Strategy at a time (the workspace session).
//   · Strategy fields split into two zones:
//       workspace: chat_messages, draft_code, draft_symbols      (mutate freely)
//       saved:     saved_code, saved_symbols, saved_at           (touched only via saveStrategy())
//   · State machine derives from those:
//       S0  empty workspace
//       S1a have draft_code, no draft_symbols
//       S1b have draft_symbols, no draft_code
//       S2  both halves complete + auto-backtest in flight (one-shot)
//       S3  result available, awaiting user "save" or "tweak" decision
//       S5  param sweep in flight
//
// Persistence:
//   · server-side strategy row (claw.strategies)        ← REST endpoints
//   · client-side chat_messages (strategy_chats SQLite) ← window.claw.db.strategyChats
//
// Note: the contract-client's Strategy type doesn't yet include the
// workspace fields (Group 2.8 will regenerate api.d.ts).  We define a
// local extended type here and cast — the runtime payload from the Go
// server already contains these fields.

import { create } from 'zustand';
import { cremote } from '@/services/remote/contract-client';
import type { components } from '@/types/api';

type ApiStrategy = components['schemas']['Strategy'];

/** Strategy enriched with the migration-006 fields the contract types
 *  haven't been regenerated for yet.  Drop this when api.d.ts catches up. */
export interface WorkspaceStrategy extends ApiStrategy {
  draft_code?: string | null;
  draft_symbols?: string[] | null;
  saved_code?: string | null;
  saved_symbols?: string[] | null;
  saved_at?: number | null;
  last_backtest?: {
    task_id: string;
    summary: Record<string, unknown>;
    ran_at: number;
  } | null;
  is_archived_draft?: boolean;
}

export interface ChatMessage {
  strategy_id: string;
  msg_idx: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: number;
  metadata?: Record<string, unknown> | null;
}

/** State machine code derived from current strategy + ephemeral flags. */
export type WorkspaceState = 'S0' | 'S1a' | 'S1b' | 'S2' | 'S3' | 'S5';

interface StrategySessionState {
  /** Active strategy id (null = nothing loaded yet, will create on first message). */
  strategyId: string | null;
  /** Server-side strategy row (loaded via loadStrategy / createStrategy). */
  strategy: WorkspaceStrategy | null;
  /** Per-strategy chat history (client SQLite). */
  messages: ChatMessage[];

  /** Ephemeral flags the state machine cares about. */
  autoBacktestDoneForCurrentPair: boolean;
  paramSweepInFlight: boolean;
  lastAutoBacktestAt: number; // unix ms; rate-limit guard

  /** Loading flags so UI can show spinners. */
  loading: boolean;
  saving: boolean;
  error: string | null;
}

interface StrategySessionActions {
  /** Load an existing strategy into the workspace (chat history + fields). */
  loadStrategy: (id: string) => Promise<void>;

  /** Create a new strategy on the server, set it as active, return the id.
   *  Used by the first-message flow: write user message, then immediately
   *  create the strategy row before sending the LLM request. */
  createStrategy: (initialName?: string) => Promise<string>;

  /** Append a chat message (server has no chat — we persist client-side). */
  appendMessage: (
    role: ChatMessage['role'],
    content: string,
    metadata?: Record<string, unknown>,
  ) => Promise<void>;

  /** Patch draft_code / draft_symbols / last_backtest.  Server roundtrip. */
  patchDraft: (patch: {
    draftCode?: string;
    draftSymbols?: string[];
    lastBacktest?: WorkspaceStrategy['last_backtest'];
  }) => Promise<void>;

  /** Snapshot draft → saved on the server.  Optional name on first save. */
  saveStrategy: (name?: string) => Promise<void>;

  /** Mark current draft as archived + open a fresh empty session.  No prompt. */
  archiveCurrentDraftAndOpenNew: () => Promise<void>;

  /** Reset session (used e.g. on app boot before any strategy is loaded). */
  reset: () => void;

  // ---- selectors / derived ----
  hasWorkspaceChanges: () => boolean;
  isCommitted: () => boolean;
  currentState: () => WorkspaceState;

  /** Called by the workspace screen when draft both halves first become
   *  complete and auto_backtest_done is false.  Triggers a backtest
   *  exactly once; subsequent calls are debounced via `lastAutoBacktestAt`. */
  maybeFireAutoBacktest: (
    runBacktest: (code: string, symbols: string[]) => Promise<void>,
  ) => Promise<void>;

  /** For tests: explicitly mark auto-backtest as already fired. */
  _markAutoBacktestDone: () => void;
}

const AUTO_BACKTEST_RATE_LIMIT_MS = 60_000;

const initialState: StrategySessionState = {
  strategyId: null,
  strategy: null,
  messages: [],
  autoBacktestDoneForCurrentPair: false,
  paramSweepInFlight: false,
  lastAutoBacktestAt: 0,
  loading: false,
  saving: false,
  error: null,
};

export const useStrategySessionStore = create<StrategySessionState & StrategySessionActions>(
  (set, get) => ({
    ...initialState,

    async loadStrategy(id) {
      set({ loading: true, error: null });
      try {
        const strategy = (await cremote.getStrategy({ id })) as WorkspaceStrategy;
        const db = (typeof window !== 'undefined' ? window.claw?.db : undefined) as
          | { strategyChats?: { list: (id: string) => Promise<ChatMessage[]> } }
          | undefined;
        const messages = db?.strategyChats
          ? await db.strategyChats.list(id)
          : [];
        set({
          strategyId: id,
          strategy,
          messages,
          autoBacktestDoneForCurrentPair: !!strategy.last_backtest,
          paramSweepInFlight: false,
          loading: false,
        });
      } catch (err) {
        set({ loading: false, error: describe(err) });
      }
    },

    async createStrategy(initialName) {
      const name = initialName ?? '未命名';
      // Backend still requires `code` + `code_type` from the legacy
      // CreateStrategy path.  Until Group 2 endpoint relaxes this, send
      // a placeholder ("# new strategy") that the user immediately
      // overwrites via the first AI diff-apply.
      const created = await cremote.createStrategy({
        name,
        code_type: 'strategy',
        code: '# new strategy — workspace will fill this in via AI chat\n',
        params_schema: {},
      });
      // Hydrate by re-fetching so we have the migration-006 fields.
      const strategy = (await cremote.getStrategy({ id: created.id })) as WorkspaceStrategy;
      set({
        strategyId: created.id,
        strategy,
        messages: [],
        autoBacktestDoneForCurrentPair: false,
        paramSweepInFlight: false,
        lastAutoBacktestAt: 0,
        error: null,
      });
      return created.id;
    },

    async appendMessage(role, content, metadata) {
      const sid = get().strategyId;
      if (!sid) {
        throw new Error('appendMessage called without an active strategy');
      }
      const db = (typeof window !== 'undefined' ? window.claw?.db : undefined) as
        | {
            strategyChats?: {
              insert: (args: {
                strategyId: string;
                role: string;
                content: string;
                metadata?: unknown;
              }) => Promise<{ msg_idx: number }>;
            };
          }
        | undefined;
      let msgIdx = get().messages.length;
      if (db?.strategyChats) {
        const r = await db.strategyChats.insert({
          strategyId: sid,
          role,
          content,
          metadata,
        });
        msgIdx = r.msg_idx;
      }
      const msg: ChatMessage = {
        strategy_id: sid,
        msg_idx: msgIdx,
        role,
        content,
        created_at: Date.now(),
        metadata: metadata ?? null,
      };
      set((s) => ({ messages: [...s.messages, msg] }));
    },

    async patchDraft({ draftCode, draftSymbols, lastBacktest }) {
      const sid = get().strategyId;
      if (!sid) return;
      const updated = (await cremote.patchStrategyDraft({
        id: sid,
        draft_code: draftCode,
        draft_symbols: draftSymbols,
        last_backtest: lastBacktest ?? undefined,
      })) as WorkspaceStrategy;

      // If draft changed after auto-backtest already fired, reset the
      // auto flag so the user-pressed "重新跑回测" is the new path
      // (we DON'T auto-fire again — Q2 decision).
      const prev = get().strategy;
      const draftChanged =
        (draftCode !== undefined && updated.draft_code !== prev?.draft_code) ||
        (draftSymbols !== undefined &&
          JSON.stringify(updated.draft_symbols) !== JSON.stringify(prev?.draft_symbols));
      set({
        strategy: updated,
        autoBacktestDoneForCurrentPair: draftChanged
          ? true
          : get().autoBacktestDoneForCurrentPair,
      });
    },

    async saveStrategy(name) {
      const sid = get().strategyId;
      if (!sid) return;
      set({ saving: true, error: null });
      try {
        const saved = (await cremote.saveStrategy({ id: sid, name })) as WorkspaceStrategy;
        set({ strategy: saved, saving: false });
      } catch (err) {
        set({ saving: false, error: describe(err) });
        throw err;
      }
    },

    async archiveCurrentDraftAndOpenNew() {
      const sid = get().strategyId;
      const dirty = get().hasWorkspaceChanges();
      if (sid && dirty) {
        try {
          await cremote.archiveStrategyDraft({ id: sid });
        } catch {
          // Non-fatal: even if the archive endpoint fails we still want
          // to open a clean session so the user isn't stuck.
        }
      }
      set({ ...initialState });
    },

    reset() {
      set({ ...initialState });
    },

    hasWorkspaceChanges() {
      const s = get().strategy;
      if (!s) return false;
      return (
        (s.draft_code ?? null) !== (s.saved_code ?? null) ||
        JSON.stringify(s.draft_symbols ?? []) !== JSON.stringify(s.saved_symbols ?? [])
      );
    },

    isCommitted() {
      return !!get().strategy?.saved_at;
    },

    currentState() {
      const s = get().strategy;
      if (!s) return 'S0';
      const hasCode = !!s.draft_code && s.draft_code.trim().length > 0;
      const hasSyms = !!s.draft_symbols && s.draft_symbols.length > 0;
      if (get().paramSweepInFlight) return 'S5';
      if (!hasCode && !hasSyms) return 'S0';
      if (hasCode && !hasSyms) return 'S1a';
      if (!hasCode && hasSyms) return 'S1b';
      // Both halves complete:
      if (!s.last_backtest && !get().autoBacktestDoneForCurrentPair) return 'S2';
      return 'S3';
    },

    async maybeFireAutoBacktest(runBacktest) {
      const s = get().strategy;
      if (!s) return;
      const hasCode = !!s.draft_code && s.draft_code.trim().length > 0;
      const hasSyms = !!s.draft_symbols && s.draft_symbols.length > 0;
      if (!hasCode || !hasSyms) return;
      if (get().autoBacktestDoneForCurrentPair) return;
      const since = Date.now() - get().lastAutoBacktestAt;
      if (since < AUTO_BACKTEST_RATE_LIMIT_MS) return;
      set({ lastAutoBacktestAt: Date.now() });
      try {
        await runBacktest(s.draft_code as string, s.draft_symbols as string[]);
      } finally {
        set({ autoBacktestDoneForCurrentPair: true });
      }
    },

    _markAutoBacktestDone() {
      set({ autoBacktestDoneForCurrentPair: true });
    },
  }),
);

function describe(err: unknown): string {
  if (err == null) return '';
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (typeof err === 'object') {
    const b = err as { code?: unknown; message?: unknown };
    const c = typeof b.code === 'string' ? b.code : '';
    const m = typeof b.message === 'string' ? b.message : '';
    if (c && m) return `${c}: ${m}`;
    return m || c || JSON.stringify(err);
  }
  return String(err);
}
