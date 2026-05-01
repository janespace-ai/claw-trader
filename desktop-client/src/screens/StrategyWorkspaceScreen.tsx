import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WorkspaceShell } from '@/components/primitives';
import { SymbolListPane } from '@/components/workspace/SymbolListPane';
import { WorkspaceCenterPane } from '@/components/workspace/WorkspaceCenterPane';
import { StrategyChatPane } from '@/components/workspace/StrategyChatPane';
import { SaveStrategyDialog } from '@/components/workspace/SaveStrategyDialog';
import {
  useStrategySessionStore,
  type ChatMessage,
} from '@/stores/strategySessionStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { cremote, toErrorBody } from '@/services/remote/contract-client';
import { runStrategistTurn, type DiffPreviewMetadata } from '@/services/chat/strategistRunner';
import { shouldProposeName } from '@/services/chat/strategistOutputParser';
import type { ChatMessage as LLMMessage } from '@/types/domain';

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

  const currentState = useStrategySessionStore((s) => s.currentState());

  const { defaultProvider, providers, aiLanguagePolicy } = useSettingsStore();

  const [focusedSymbol, setFocusedSymbol] = useState<string | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);

  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  void aiLanguagePolicy; // (Group 7 future: thread reply lang into prompt; v1 lets the model auto-detect)

  // When draft_symbols changes and there's no focused symbol, default
  // to the first one so the chart pane has something to render.
  useEffect(() => {
    const syms = strategy?.draft_symbols ?? [];
    if (focusedSymbol && !syms.includes(focusedSymbol)) {
      setFocusedSymbol(syms[0] ?? null);
    } else if (!focusedSymbol && syms.length > 0) {
      setFocusedSymbol(syms[0]);
    }
  }, [strategy?.draft_symbols, focusedSymbol]);

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
      } else if (meta.mutation.kind === 'symbols') {
        await patchDraft({ draftSymbols: meta.mutation.symbols });
      } else if (meta.mutation.kind === 'filter') {
        // Group 8 will wire `symbols-filter` to the actual screener
        // dispatch.  For now, just acknowledge.
        await appendMessage(
          'assistant',
          t('workspace.chat.filter_pending', {
            defaultValue: '(symbols-filter 调度将在 Group 8 接入)',
          }),
        );
      }
      // Mark this diff message as resolved=applied.
      markDiffResolved(msg, 'applied');
    } catch (err) {
      await appendMessage('assistant', `⚠️ ${describeErr(err)}`);
    }
  };

  const handleRejectDiff = (msg: ChatMessage, meta: DiffPreviewMetadata) => {
    if (meta.resolved) return;
    markDiffResolved(msg, 'rejected');
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
      // Persist the task id on the strategy via patchDraft so re-opens
      // remember which backtest fired (Group 6 will resolve the result
      // once it lands; for now we just write the task id).
      await patchDraft({
        lastBacktest: {
          task_id: task.task_id,
          summary: { status: 'pending' },
          ran_at: Math.floor(Date.now() / 1000),
        },
      });
    } catch (err) {
      setRunError(describeErr(err));
    } finally {
      setRunning(false);
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
          <SymbolListPane
            focusedSymbol={focusedSymbol ?? undefined}
            onFocusSymbol={setFocusedSymbol}
            onAskAI={handleAskAI}
          />
        }
        main={
          <div className="flex flex-col h-full">
            <div className="flex-1 min-h-0">
              <WorkspaceCenterPane focusedSymbol={focusedSymbol} />
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
  return meta.mutation.filter.description;
}
