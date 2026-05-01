import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WorkspaceShell } from '@/components/primitives';
import { SymbolListPane } from '@/components/workspace/SymbolListPane';
import { WorkspaceCenterPane } from '@/components/workspace/WorkspaceCenterPane';
import { StrategyChatPane } from '@/components/workspace/StrategyChatPane';
import { SaveStrategyDialog } from '@/components/workspace/SaveStrategyDialog';
import { useStrategySessionStore } from '@/stores/strategySessionStore';
import { cremote, toErrorBody } from '@/services/remote/contract-client';

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

  const [focusedSymbol, setFocusedSymbol] = useState<string | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);

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
    // First message creates the strategy if there isn't one yet.
    let activeId = strategyId;
    if (!activeId) {
      try {
        activeId = await createStrategy();
      } catch (err) {
        setRunError(`${describeErr(err)}`);
        return;
      }
    }
    await appendMessage('user', text);

    // Group 7 wires the AI here.  For Group 4 we only persist the
    // user's message — the AI roundtrip becomes Group 7's job (state-
    // aware strategist prompt + diff-preview generation).  This stub
    // lets us smoke-test the full chat persistence cycle in the
    // meantime.
    await appendMessage('assistant', t('workspace.chat.stub_response', {
      defaultValue:
        '(AI 还没接上 — Group 7 of unified-strategy-workspace will hook the strategist persona here.)',
    }));
    void activeId;
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
