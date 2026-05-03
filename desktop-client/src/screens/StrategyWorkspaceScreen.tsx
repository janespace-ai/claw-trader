import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WorkspaceShell } from '@/components/primitives';
import { SymbolListPane } from '@/components/workspace/SymbolListPane';
import { WorkspaceCenterPane } from '@/components/workspace/WorkspaceCenterPane';
import { SymbolKlinePane } from '@/components/workspace/SymbolKlinePane';
import { WorkspaceTabsPane } from '@/components/workspace/WorkspaceTabsPane';
import { StrategyChatPane } from '@/components/workspace/StrategyChatPane';
import { SaveStrategyDialog } from '@/components/workspace/SaveStrategyDialog';
import {
  useStrategySessionStore,
  type ChatMessage,
} from '@/stores/strategySessionStore';
import { useAppStore } from '@/stores/appStore';
import { useUniverseStore } from '@/stores/universeStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { cremote, toErrorBody } from '@/services/remote/contract-client';
import { runStrategistTurn, type DiffPreviewMetadata } from '@/services/chat/strategistRunner';
import {
  shouldProposeName,
  parseNaturalLanguageParamSweep,
  validateSweepAgainstSchema,
  type ParamSweepRequest,
  type ScreenerFilter,
} from '@/services/chat/strategistOutputParser';
import { recordEvent, readFlagSync } from '@/services/featureFlags';
import type { ChatMessage as LLMMessage } from '@/types/domain';
import type { components } from '@/types/api';

type BacktestResultExtended = components['schemas']['BacktestResultExtended'];

/**
 * The "创建/编辑策略" tab — the unified-strategy-workspace front door.
 *
 * Three-pane layout (Pencil master frame `OUv6E`):
 *   ┌──────────────┬─────────────────────┬─────────────────────┐
 *   │ SymbolList   │  Tabs + Chart/Code  │  AI Chat           │
 *   │ (240w)       │  + Action bar       │  (340w)            │
 *   └──────────────┴─────────────────────┴─────────────────────┘
 *
 * State machine code (S0/S1a/S1b/S2/S3/S5) drives the action bar
 * gating + AI prompt selection (Group 7 wires the prompt; for now this
 * file just exposes the dirty + completeness state to the chat layer).
 */
export function StrategyWorkspaceScreen() {
  const { t } = useTranslation();
  const strategy = useStrategySessionStore((s) => s.strategy);
  const strategyId = useStrategySessionStore((s) => s.strategyId);
  const messages = useStrategySessionStore((s) => s.messages);
  const hasChanges = useStrategySessionStore((s) => s.hasWorkspaceChanges());
  const isCommitted = useStrategySessionStore((s) => s.isCommitted());
  const saving = useStrategySessionStore((s) => s.saving);
  const saveStrategy = useStrategySessionStore((s) => s.saveStrategy);
  const appendMessage = useStrategySessionStore((s) => s.appendMessage);
  const createStrategy = useStrategySessionStore((s) => s.createStrategy);
  const patchDraft = useStrategySessionStore((s) => s.patchDraft);
  const setLastFilteredSymbols = useStrategySessionStore(
    (s) => s.setLastFilteredSymbols,
  );
  const setBottomTab = useStrategySessionStore((s) => s.setBottomTab);
  const bottomTab = useStrategySessionStore((s) => s.bottomTab);

  const currentState = useStrategySessionStore((s) => s.currentState());

  const { defaultProvider, providers, aiLanguagePolicy } = useSettingsStore();

  // Workspace-three-zone-layout: focusedSymbol now lives in appStore
  // so it's mutex-shared between SymbolListPane (left) and
  // FilteredSymbolsTab (center bottom).
  const focusedSymbol = useAppStore((s) => s.focusedSymbol);
  const setFocusedSymbol = useAppStore((s) => s.setFocusedSymbol);
  const loadUniverse = useUniverseStore((s) => s.loadUniverse);
  const threeZoneLayout = readFlagSync('workspaceThreeZone');

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [resolvedResult, setResolvedResult] = useState<BacktestResultExtended | null>(null);
  const [resultLoading, setResultLoading] = useState(false);

  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const lastPolledTaskIdRef = useRef<string | null>(null);
  void aiLanguagePolicy; // (Group 7 future: thread reply lang into prompt; v1 lets the model auto-detect)

  // Workspace-three-zone-layout: load the universe (left rail) once
  // on mount.  Cached for 60s in localStorage by the store.
  useEffect(() => {
    void loadUniverse();
    recordEvent('workspace_load', {
      layout: threeZoneLayout ? 'three_zone' : 'legacy',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Default focusedSymbol if nothing is set yet.  loadStrategy already
  // initializes it; this is a fallback for sessions that mount before
  // any strategy is loaded.
  useEffect(() => {
    if (!focusedSymbol) {
      const first = strategy?.draft_symbols?.[0] ?? 'BTC_USDT';
      setFocusedSymbol(first);
    }
  }, [focusedSymbol, strategy?.draft_symbols, setFocusedSymbol]);

  // Both halves complete?  Action bar enabled.
  const draftCode = strategy?.draft_code ?? null;
  const draftSymbols = strategy?.draft_symbols ?? [];
  const canRun = !!draftCode && draftCode.trim().length > 0 && draftSymbols.length > 0;
  const canSave = canRun;

  const handleAskAI = () => {
    chatInputRef.current?.focus();
  };

  const handleUserMessage = async (text: string) => {
    if (streaming) return;

    // First message creates the strategy if there isn't one yet.
    if (!strategyId) {
      try {
        await createStrategy();
      } catch (err) {
        setRunError(describeErr(err));
        return;
      }
    }
    await appendMessage('user', text);

    // Group 8 short-circuit: detect natural-language param-sweep ASK
    // before paying for an LLM roundtrip.  Pattern: "试 RSI 14, 21, 28".
    const nlSweep = parseNaturalLanguageParamSweep(text);
    if (nlSweep) {
      await dispatchParamSweep(nlSweep);
      return;
    }

    const cfg = providers[defaultProvider];
    if (!cfg?.apiKey) {
      await appendMessage(
        'assistant',
        t('workspace.chat.no_api_key', {
          defaultValue: '⚠️ 还没配置 AI Provider — 在「设置」里填 API Key 再来试。',
        }),
      );
      return;
    }

    // Build LLM history from the local store (excluding the diff-preview
    // metadata-only assistant messages, which are UI artifacts not real
    // model turns).
    const storeState = useStrategySessionStore.getState();
    const llmHistory: LLMMessage[] = storeState.messages
      .filter((m) => !isDiffPreview(m))
      .map((m) => ({
        role: m.role,
        content: m.content,
        ts: m.created_at,
      }));

    setStreaming(true);
    try {
      const ctx = {
        state: storeState.currentState(),
        strategyName: storeState.strategy?.name ?? null,
        isCommitted: storeState.isCommitted(),
        draftCode: storeState.strategy?.draft_code ?? null,
        draftSymbols: storeState.strategy?.draft_symbols ?? null,
        notes: shouldProposeName(storeState.messages.length, !!storeState.strategy?.name)
          ? 'NAMING_HINT: please propose a short strategy name in your prose response (the user can accept or override).'
          : undefined,
      };
      await runStrategistTurn({
        provider: defaultProvider,
        model: cfg.model,
        apiKey: cfg.apiKey,
        baseURL: cfg.baseURL,
        context: ctx,
        history: llmHistory,
        userMessage: text,
        onComplete: async (result) => {
          if (result.prose) {
            await appendMessage('assistant', result.prose);
          }
          if (result.diffPreviewMeta) {
            // Persist a SECOND assistant message whose content is the
            // mutation reason (we use the prose snippet as a proxy) and
            // whose metadata carries the diff payload for the chat pane.
            await appendMessage(
              'assistant',
              proposeReason(result.diffPreviewMeta),
              result.diffPreviewMeta as unknown as Record<string, unknown>,
            );
          }
          if (result.warnings.length > 0) {
            // eslint-disable-next-line no-console
            console.warn('[strategist] parse warnings', result.warnings);
          }
        },
        onError: async (err) => {
          await appendMessage('assistant', `⚠️ ${err}`);
        },
      });
    } catch (err) {
      await appendMessage('assistant', `⚠️ ${describeErr(err)}`);
    } finally {
      setStreaming(false);
    }
  };

  const handleApplyDiff = async (msg: ChatMessage, meta: DiffPreviewMetadata) => {
    if (meta.resolved) return;
    try {
      if (meta.mutation.kind === 'code') {
        await patchDraft({ draftCode: meta.mutation.code });
        // Workspace-three-zone-layout: surface the new code to the user
        // by switching to the "代码" tab.
        setBottomTab('code');
        recordEvent('tab_auto_switch', {
          to: 'code',
          from: bottomTab,
          trigger: 'code_apply',
        });
      } else if (meta.mutation.kind === 'symbols') {
        await patchDraft({ draftSymbols: meta.mutation.symbols });
      } else if (meta.mutation.kind === 'filter') {
        markDiffResolved(msg, 'applied');
        await dispatchSymbolsFilter(meta.mutation.filter);
        return; // dispatchSymbolsFilter handles its own status messages
      } else if (meta.mutation.kind === 'param-sweep') {
        markDiffResolved(msg, 'applied');
        await dispatchParamSweep(meta.mutation.sweep);
        return;
      }
      // Mark this diff message as resolved=applied.
      markDiffResolved(msg, 'applied');
    } catch (err) {
      await appendMessage('assistant', `⚠️ ${describeErr(err)}`);
    }
  };

  /** Run a screener Python program against the live universe and inject
   *  the resulting passing-symbols array into draft_symbols.  Polls the
   *  /api/screener/result endpoint up to ~90s. */
  const dispatchSymbolsFilter = async (filter: ScreenerFilter) => {
    await appendMessage(
      'assistant',
      t('workspace.chat.filter_running', {
        defaultValue: '⚙ 正在运行筛选：{{desc}}…',
        desc: filter.description,
      }),
    );
    try {
      // The backend screener runs a Python program — we synthesize a
      // tiny one based on the filter rule_kind.  This keeps the chat
      // protocol declarative while reusing the existing screener
      // infrastructure (sandbox-service path) end-to-end.
      const code = synthesizeScreenerCode(filter);
      const start = await cremote.startScreener({
        code,
        config: { market: 'futures', lookback_days: 1 },
      });
      // Poll up to 90s
      const deadline = Date.now() + 90_000;
      let done: { passed: string[]; total: number } | null = null;
      while (Date.now() < deadline) {
        const r = await cremote.getScreenerResult({ task_id: start.task_id });
        if (r.status === 'done') {
          const results =
            (r.result as { results?: Array<{ symbol: string; passed: boolean }> } | undefined)
              ?.results ?? [];
          done = {
            passed: results.filter((x) => x.passed).map((x) => x.symbol),
            total: results.length,
          };
          break;
        }
        if (r.status === 'failed') {
          throw new Error(r.error?.message ?? 'screener failed');
        }
        await sleep(1500);
      }
      if (!done) throw new Error('screener timed out');
      // Workspace-three-zone-layout: write filter results into
      // `lastFilteredSymbols` (NOT `draft_symbols`) so the user can
      // cherry-pick from the "选出的币" tab.  Also strong-switch the
      // bottom tab so the result is immediately visible.
      setLastFilteredSymbols({
        symbols: done.passed,
        runAt: Date.now(),
        criteria: filter.description,
      });
      setBottomTab('filtered');
      recordEvent('tab_auto_switch', {
        to: 'filtered',
        from: bottomTab,
        trigger: 'filter_done',
      });
      await appendMessage(
        'assistant',
        t('workspace.chat.filter_done', {
          defaultValue: '✓ 筛出 {{n}} 个币（共 {{total}}），详情见中下「选出的币」页签 →',
          n: done.passed.length,
          total: done.total,
        }),
      );
    } catch (err) {
      await appendMessage(
        'assistant',
        `⚠️ ${t('workspace.chat.filter_failed', {
          defaultValue: '筛选失败：',
        })} ${describeErr(err)}`,
      );
    }
  };

  /** Dispatch a parameter sweep via mode='optimization' backtest.  Validates
   *  axes against strategy.params_schema first; if any axis is unknown,
   *  surfaces a chat error instead of dispatching. */
  const dispatchParamSweep = async (sweep: ParamSweepRequest) => {
    const schema = (strategy?.params_schema ?? null) as Record<string, unknown> | null;
    const v = validateSweepAgainstSchema(sweep, schema);
    if (!v.ok) {
      await appendMessage(
        'assistant',
        t('workspace.chat.sweep_unknown_axis', {
          defaultValue:
            '⚠️ 参数 {{axes}} 不在策略的 params_schema 里，先在代码里加上 self.params。',
          axes: v.unknownAxes.join(', '),
        }),
      );
      return;
    }
    if (!draftCode || draftSymbols.length === 0 || !strategyId) {
      await appendMessage(
        'assistant',
        t('workspace.chat.sweep_incomplete', {
          defaultValue: '⚠️ 调参之前先把代码和币列表都备齐。',
        }),
      );
      return;
    }
    await appendMessage(
      'assistant',
      t('workspace.chat.sweep_running', {
        defaultValue: '⚙ 调参运行中：{{desc}}…',
        desc: sweep.description ?? Object.keys(sweep.axes).join(' × '),
      }),
    );
    try {
      const task = await cremote.startBacktest({
        code: draftCode,
        config: {
          symbols: draftSymbols,
          interval: '1h',
          from: Math.floor(Date.now() / 1000) - 30 * 24 * 3600,
          to: Math.floor(Date.now() / 1000),
          mode: 'optimization' as 'preview' | 'deep',
          param_grid: sweep.axes,
        } as components['schemas']['BacktestConfig'],
        strategy_id: strategyId,
      });
      await appendMessage(
        'assistant',
        t('workspace.chat.sweep_dispatched', {
          defaultValue: '✓ 已派发 (task {{id}})。结果会出现在「结果」tab。',
          id: task.task_id.slice(0, 8),
        }),
      );
      void pollBacktestResult(task.task_id);
    } catch (err) {
      await appendMessage(
        'assistant',
        `⚠️ ${describeErr(err)}`,
      );
    }
  };

  const handleRejectDiff = (msg: ChatMessage, meta: DiffPreviewMetadata) => {
    if (meta.resolved) return;
    markDiffResolved(msg, 'rejected');
    recordEvent('diff_rejected', { mutation_kind: meta.mutation.kind });
  };

  /** Mutate a chat message's metadata in the store.  We don't have an
   *  "update message" API (chat is append-only at the persistence
   *  layer per Group 14 spec), so we shallow-replace the in-memory
   *  copy.  The persisted SQLite row stays as originally written —
   *  which is fine, the resolved bit is a UI-only "I already pressed
   *  this" hint. */
  const markDiffResolved = (msg: ChatMessage, resolution: 'applied' | 'rejected') => {
    useStrategySessionStore.setState((s) => ({
      messages: s.messages.map((m) =>
        m.strategy_id === msg.strategy_id && m.msg_idx === msg.msg_idx
          ? {
              ...m,
              metadata: {
                ...((m.metadata ?? {}) as Record<string, unknown>),
                resolved: resolution,
              },
            }
          : m,
      ),
    }));
  };

  const handleRunBacktest = async () => {
    if (!canRun || !strategyId || !draftCode) return;
    setRunError(null);
    setRunning(true);
    setResolvedResult(null);
    try {
      const task = await cremote.startBacktest({
        code: draftCode,
        config: {
          symbols: draftSymbols,
          interval: '1h',
          from: Math.floor(Date.now() / 1000) - 30 * 24 * 3600,
          to: Math.floor(Date.now() / 1000),
        },
        strategy_id: strategyId,
      });
      await patchDraft({
        lastBacktest: {
          task_id: task.task_id,
          summary: { status: 'pending' },
          ran_at: Math.floor(Date.now() / 1000),
        },
      });
      // Kick off polling — non-blocking; UI flips when poll completes.
      void pollBacktestResult(task.task_id);
    } catch (err) {
      setRunError(describeErr(err));
    } finally {
      setRunning(false);
    }
  };

  /** Poll for backtest task completion and write the resolved
   *  BacktestResultExtended payload into both local state (for
   *  immediate UI render) and strategy.last_backtest (so re-opens of
   *  the strategy show the result without re-running).  Polls every
   *  1500ms for up to ~3 minutes. */
  const pollBacktestResult = async (taskId: string) => {
    setResultLoading(true);
    lastPolledTaskIdRef.current = taskId;
    const start = Date.now();
    const TIMEOUT_MS = 3 * 60_000;
    const INTERVAL_MS = 1500;
    try {
      while (Date.now() - start < TIMEOUT_MS) {
        // If user moved on to a different backtest, abort this poll.
        if (lastPolledTaskIdRef.current !== taskId) return;
        const tr = await cremote.getBacktestResult({ task_id: taskId });
        if (tr.status === 'done') {
          const result = (tr.result ?? null) as BacktestResultExtended | null;
          setResolvedResult(result);
          // Update last_backtest with the resolved summary so re-opens
          // see this run without re-running.
          if (result) {
            const totalReturn = result.summary?.metrics?.total_return ?? null;
            await patchDraft({
              lastBacktest: {
                task_id: taskId,
                summary: {
                  pnl_pct: typeof totalReturn === 'number' ? totalReturn * 100 : null,
                  ...result.summary?.metrics,
                },
                ran_at: tr.finished_at ?? Math.floor(Date.now() / 1000),
              },
            });
          }
          // Workspace-three-zone-layout: strong-switch to "回测" tab so
          // the user immediately sees the result without hunting.
          setBottomTab('result');
          recordEvent('tab_auto_switch', {
            to: 'result',
            from: bottomTab,
            trigger: 'backtest_done',
          });
          return;
        }
        if (tr.status === 'failed') {
          setRunError(tr.error?.message ?? 'backtest failed');
          return;
        }
        await sleep(INTERVAL_MS);
      }
      setRunError('backtest timed out');
    } catch (err) {
      setRunError(describeErr(err));
    } finally {
      setResultLoading(false);
    }
  };

  const handleSaveClick = () => {
    if (!canSave || !strategyId) return;
    if (!isCommitted) {
      // First save → open the name dialog.
      setSaveDialogOpen(true);
    } else {
      // Re-save → overwrite silently.
      void doSave(strategy?.name ?? '');
    }
  };

  const doSave = async (name: string) => {
    setSaveError(null);
    try {
      await saveStrategy(name);
      setSaveDialogOpen(false);
    } catch (err) {
      setSaveError(describeErr(err));
    }
  };

  const handleCancelSave = () => {
    setSaveDialogOpen(false);
    setSaveError(null);
  };

  const codeLines = draftCode ? draftCode.split('\n').filter((l) => l.trim()).length : 0;
  const lastPnl = (() => {
    const v = strategy?.last_backtest?.summary?.pnl_pct;
    return typeof v === 'number' ? v : null;
  })();

  return (
    <>
      <WorkspaceShell
        leftRailWidth={240}
        rightRailWidth={340}
        leftRail={
          <SymbolListPane />
        }
        main={
          <div className="flex flex-col h-full">
            <div className="flex-1 min-h-0">
              {threeZoneLayout ? (
                /* Workspace-three-zone-layout: vertical split.  Top
                   K-line is fixed-height and persistent regardless
                   of which BOTTOM tab is active. */
                <div className="flex flex-col h-full">
                  <SymbolKlinePane />
                  <div className="flex-1 min-h-0 border-t border-border-subtle">
                    <WorkspaceTabsPane
                      result={resolvedResult}
                      resultLoading={resultLoading}
                      resultStale={
                        hasChanges && !!strategy?.last_backtest && !resultLoading
                      }
                      onRerunBacktest={handleRunBacktest}
                      onFocusSymbolFromResult={setFocusedSymbol}
                    />
                  </div>
                </div>
              ) : (
                <WorkspaceCenterPane
                  focusedSymbol={focusedSymbol}
                  result={resolvedResult}
                  resultLoading={resultLoading}
                  resultStale={hasChanges && !!strategy?.last_backtest && !resultLoading}
                  onRerunBacktest={handleRunBacktest}
                  onFocusSymbolFromResult={setFocusedSymbol}
                />
              )}
            </div>
            <ActionBar
              hasChanges={hasChanges}
              isCommitted={isCommitted}
              messageCount={messages.length}
              canRun={canRun}
              canSave={canSave}
              running={running}
              saving={saving}
              runError={runError}
              onRun={handleRunBacktest}
              onSave={handleSaveClick}
            />
          </div>
        }
        rightRail={
          <StrategyChatPane
            inputRef={chatInputRef}
            onUserMessage={handleUserMessage}
            onApplyDiff={handleApplyDiff}
            onRejectDiff={handleRejectDiff}
            streaming={streaming}
          />
        }
      />

      {saveDialogOpen && (
        <SaveStrategyDialog
          initialName={strategy?.name ?? ''}
          summary={{
            code_lines: codeLines,
            symbol_count: draftSymbols.length,
            last_pnl_pct: lastPnl,
          }}
          saving={saving}
          errorMsg={saveError}
          onCancel={handleCancelSave}
          onConfirm={(name) => void doSave(name)}
        />
      )}
    </>
  );
}

interface ActionBarProps {
  hasChanges: boolean;
  isCommitted: boolean;
  messageCount: number;
  canRun: boolean;
  canSave: boolean;
  running: boolean;
  saving: boolean;
  runError: string | null;
  onRun: () => void;
  onSave: () => void;
}

function ActionBar({
  hasChanges,
  isCommitted,
  messageCount,
  canRun,
  canSave,
  running,
  saving,
  runError,
  onRun,
  onSave,
}: ActionBarProps) {
  const { t } = useTranslation();
  // Status string: dirty / clean / pristine
  let statusMsg = '';
  if (isCommitted && hasChanges) {
    statusMsg = t('workspace.action_bar.status.dirty', {
      defaultValue: '草稿有改动 · 上次保存于 last_save',
    });
  } else if (isCommitted) {
    statusMsg = t('workspace.action_bar.status.saved', {
      defaultValue: '已保存',
    });
  } else if (messageCount === 0) {
    statusMsg = t('workspace.action_bar.status.empty', {
      defaultValue: '聊一句开始',
    });
  } else {
    statusMsg = t('workspace.action_bar.status.draft', {
      defaultValue: '草稿 · 完成两半后会自动跑回测',
    });
  }

  return (
    <div className="flex items-center gap-3 px-5 h-16 border-t border-border-subtle bg-surface-secondary flex-shrink-0">
      <div className="flex-1 flex items-center gap-2 min-w-0">
        {hasChanges && isCommitted && (
          <span className="w-1.5 h-1.5 rounded-full bg-accent-yellow flex-shrink-0" />
        )}
        <span className="text-[11px] text-fg-muted truncate">{statusMsg}</span>
        {runError && (
          <span className="text-[11px] text-accent-red font-medium ml-2">
            {runError}
          </span>
        )}
      </div>
      <button
        onClick={onRun}
        disabled={!canRun || running}
        className={
          'h-9 px-4 inline-flex items-center gap-1.5 rounded-md text-[13px] font-semibold ' +
          'bg-surface-tertiary text-fg-primary border border-border-strong ' +
          'hover:bg-surface-tertiary/80 disabled:opacity-50 disabled:cursor-not-allowed'
        }
      >
        <span aria-hidden>▶</span>
        {running
          ? t('workspace.action_bar.running', { defaultValue: '回测中…' })
          : t('workspace.action_bar.run', { defaultValue: '运行回测' })}
      </button>
      <button
        onClick={onSave}
        disabled={!canSave || saving}
        className={
          'h-9 px-5 inline-flex items-center gap-1.5 rounded-md text-[13px] font-semibold ' +
          'bg-accent-primary text-fg-inverse hover:opacity-90 ' +
          'disabled:opacity-50 disabled:cursor-not-allowed transition-opacity'
        }
      >
        <span aria-hidden>💾</span>
        {saving
          ? t('workspace.save.saving', { defaultValue: '保存中…' })
          : t('workspace.action_bar.save', { defaultValue: '保存策略' })}
      </button>
    </div>
  );
}

function describeErr(err: unknown): string {
  const body = toErrorBody(err);
  return `${body.code}: ${body.message}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Translate a high-level ScreenerFilter into a runnable Screener Python
 * snippet for the sandbox.  Today only `top_quote_vol` is supported (rank
 * by 24h quote volume between [start, end] inclusive).  Future rule_kinds
 * are an additive change here.
 *
 * The synthesised code targets the claw.screener.Screener base class.
 */
function synthesizeScreenerCode(filter: ScreenerFilter): string {
  const safeNum = (k: string, fallback: number) => {
    const v = (filter.params as Record<string, unknown>)[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return fallback;
  };

  if (filter.rule_kind === 'top_quote_vol') {
    const start = Math.max(1, Math.floor(safeNum('start', 1)));
    const end = Math.max(start, Math.floor(safeNum('end', 30)));
    return [
      'from claw.screener import Screener',
      '',
      'class TopVolScreener(Screener):',
      '    """Auto-generated by AI strategist — top quote-volume rank filter."""',
      '    def filter(self, symbol, klines, metadata):',
      '        rank = metadata.get("rank")',
      '        if rank is None: return False',
      `        return ${start} <= rank <= ${end}`,
      '',
    ].join('\n');
  }

  // Fallback — keep all symbols.  Better than failing.
  return [
    'from claw.screener import Screener',
    '',
    'class PassThroughScreener(Screener):',
    '    def filter(self, symbol, klines, metadata):',
    '        return True',
    '',
  ].join('\n');
}

function isDiffPreview(m: ChatMessage): boolean {
  const meta = m.metadata as { kind?: string } | null;
  return !!meta && meta.kind === 'diff-preview';
}

function proposeReason(meta: DiffPreviewMetadata): string {
  if (meta.mutation.kind === 'code') {
    return '建议改动代码';
  }
  if (meta.mutation.kind === 'symbols') {
    return `建议更新币列表 (${meta.mutation.symbols.length} 个)`;
  }
  if (meta.mutation.kind === 'filter') {
    return meta.mutation.filter.description;
  }
  return meta.mutation.sweep.description ?? '调参建议';
}
