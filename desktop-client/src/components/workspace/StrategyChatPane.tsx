import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useStrategySessionStore,
  type WorkspaceStrategy,
  type ChatMessage,
} from '@/stores/strategySessionStore';
import { DiffPreviewCard } from './DiffPreviewCard';
import type { DiffPreviewMetadata } from '@/services/chat/strategistRunner';

interface Props {
  /** Optional ref so the parent screen (e.g. left rail's "AI 帮我改币种"
   *  button) can focus the input + pre-fill it with a prompt. */
  inputRef?: React.MutableRefObject<HTMLTextAreaElement | null>;
  /** Called when the user submits a message.  The pane appends the
   *  message to the local store via appendMessage; the parent decides
   *  what to do next (typically: call LLM, parse output, generate
   *  diff-preview cards).  In Group 7 this becomes the strategist
   *  state-aware prompt entry point. */
  onUserMessage?: (text: string) => void;
  /** Called when user clicks [应用] on a diff-preview card.  The
   *  parent screen patches strategy.draft_* via the store and updates
   *  the message's metadata.resolved to 'applied'. */
  onApplyDiff?: (msg: ChatMessage, meta: DiffPreviewMetadata) => void;
  /** Called when user clicks [拒绝] on a diff-preview card.  Just
   *  marks the metadata.resolved = 'rejected' so the buttons disappear. */
  onRejectDiff?: (msg: ChatMessage, meta: DiffPreviewMetadata) => void;
  /** True while a strategist turn is streaming — disables the input
   *  to prevent double-sends. */
  streaming?: boolean;
}

/**
 * Right pane of the unified strategy workspace.  3 sections:
 *   - Header: avatar + strategy name + saved/draft badge + dirty dot,
 *             plus a state checklist (币列表 / 策略代码 / 回测结果).
 *   - Thread: scrollable message list with bubbles.  Inline diff
 *             preview cards live in here as message variants (Group 7
 *             will inject them via metadata).
 *   - Input:  textarea + send button.
 *
 * Mirrors Pencil frame `kYB4N`.
 */
export function StrategyChatPane({
  inputRef,
  onUserMessage,
  onApplyDiff,
  onRejectDiff,
  streaming = false,
}: Props) {
  const { t } = useTranslation();
  const strategy = useStrategySessionStore((s) => s.strategy);
  const messages = useStrategySessionStore((s) => s.messages);
  const hasChanges = useStrategySessionStore((s) => s.hasWorkspaceChanges());
  const isCommitted = useStrategySessionStore((s) => s.isCommitted());

  const [input, setInput] = useState('');
  const internalRef = useRef<HTMLTextAreaElement | null>(null);
  const ref = inputRef ?? internalRef;

  const threadRef = useRef<HTMLDivElement | null>(null);
  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    onUserMessage?.(text);
  };

  const checklist = useChecklist(strategy);

  // Determine badge tone
  let badgeText = t('workspace.chat.badge.draft', { defaultValue: '草稿' });
  let badgeBg = 'bg-surface-tertiary';
  let badgeFg = 'text-accent-yellow';
  if (isCommitted && !hasChanges) {
    badgeText = t('workspace.chat.badge.saved', { defaultValue: '已保存' });
    badgeBg = 'bg-[color:var(--accent-green-dim)]';
    badgeFg = 'text-accent-green';
  } else if (isCommitted && hasChanges) {
    badgeText = t('workspace.chat.badge.saved_dirty', { defaultValue: '已保存 ●' });
    badgeBg = 'bg-[color:var(--accent-green-dim)]';
    badgeFg = 'text-accent-green';
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3.5 py-3 border-b border-border-subtle space-y-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-accent-primary text-fg-inverse grid place-items-center text-xs font-bold">
            ✦
          </div>
          <div className="flex-1 min-w-0">
            <div
              className="font-heading text-[13px] font-semibold text-fg-primary truncate"
              title={strategy?.name}
            >
              {strategy?.name ?? t('workspace.untitled', { defaultValue: '未命名' })}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={
                  'inline-flex items-center px-1.5 h-[18px] rounded-full text-[10px] font-semibold ' +
                  badgeBg +
                  ' ' +
                  badgeFg
                }
              >
                {badgeText}
              </span>
            </div>
          </div>
        </div>

        {/* Checklist */}
        <div className="flex items-center gap-3.5">
          {checklist.map((item) => (
            <div key={item.key} className="flex items-center gap-1.5">
              <span
                className={
                  'inline-block w-3.5 h-3.5 rounded-full text-center leading-[14px] ' +
                  (item.done
                    ? 'bg-accent-green text-fg-inverse text-[9px] font-bold'
                    : 'border border-border-strong text-transparent')
                }
                aria-hidden
              >
                {item.done ? '✓' : '·'}
              </span>
              <span
                className={
                  'text-[11px] font-medium ' +
                  (item.done ? 'text-fg-primary' : 'text-fg-muted')
                }
              >
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Thread */}
      <div ref={threadRef} className="flex-1 overflow-y-auto px-3.5 py-3.5 space-y-3.5">
        {messages.length === 0 ? (
          <div className="text-[12px] text-fg-muted leading-relaxed">
            {t('workspace.chat.empty', {
              defaultValue:
                '想做啥策略？我可以帮你筛币、写代码、跑回测——你说一句就行。',
            })}
          </div>
        ) : (
          messages.map((m) => {
            const meta = m.metadata as DiffPreviewMetadata | { kind?: string } | null;
            if (meta && (meta as DiffPreviewMetadata).kind === 'diff-preview') {
              return (
                <DiffPreviewMessage
                  key={`${m.strategy_id}-${m.msg_idx}`}
                  msg={m}
                  meta={meta as DiffPreviewMetadata}
                  onApply={onApplyDiff}
                  onReject={onRejectDiff}
                />
              );
            }
            return (
              <ChatBubble
                key={`${m.strategy_id}-${m.msg_idx}`}
                role={m.role}
                content={m.content}
              />
            );
          })
        )}
      </div>

      {/* Input */}
      <div className="px-3 py-2.5 border-t border-border-subtle">
        <div className="flex items-end gap-2 bg-surface-tertiary rounded-lg p-2 border border-border-subtle focus-within:border-accent-primary transition-colors">
          <textarea
            ref={ref}
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={streaming}
            placeholder={
              streaming
                ? t('workspace.chat.streaming', { defaultValue: '思考中…' })
                : t('workspace.chat.input.placeholder', {
                    defaultValue: '描述你的想法… (Enter 发送, Shift+Enter 换行)',
                  })
            }
            className="flex-1 bg-transparent outline-none resize-none text-[12px] text-fg-primary placeholder:text-fg-muted disabled:opacity-50"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || streaming}
            className={
              'w-7 h-7 rounded-md grid place-items-center text-sm transition-opacity ' +
              'bg-accent-primary text-fg-inverse disabled:opacity-40 disabled:cursor-not-allowed'
            }
            aria-label={t('action.send', { defaultValue: 'Send' })}
          >
            {streaming ? '⟳' : '↑'}
          </button>
        </div>
      </div>
    </div>
  );
}

function useChecklist(
  strategy: WorkspaceStrategy | null,
): Array<{ key: string; label: string; done: boolean }> {
  const { t } = useTranslation();
  const hasSyms = !!strategy?.draft_symbols && strategy.draft_symbols.length > 0;
  const hasCode = !!strategy?.draft_code && strategy.draft_code.trim().length > 0;
  const hasResult = !!strategy?.last_backtest;
  return [
    {
      key: 'symbols',
      label: t('workspace.chat.checklist.symbols', { defaultValue: '币列表' }),
      done: hasSyms,
    },
    {
      key: 'code',
      label: t('workspace.chat.checklist.code', { defaultValue: '策略代码' }),
      done: hasCode,
    },
    {
      key: 'result',
      label: t('workspace.chat.checklist.result', { defaultValue: '回测结果' }),
      done: hasResult,
    },
  ];
}

function DiffPreviewMessage({
  msg,
  meta,
  onApply,
  onReject,
}: {
  msg: ChatMessage;
  meta: DiffPreviewMetadata;
  onApply?: (msg: ChatMessage, meta: DiffPreviewMetadata) => void;
  onReject?: (msg: ChatMessage, meta: DiffPreviewMetadata) => void;
}) {
  // Build before/after strings for the DiffPreviewCard.
  let before = '';
  let after = '';
  let kind: 'code' | 'symbols' = 'code';
  if (meta.mutation.kind === 'code') {
    kind = 'code';
    before = meta.before.code ?? '';
    after = meta.mutation.code;
  } else if (meta.mutation.kind === 'symbols') {
    kind = 'symbols';
    before = JSON.stringify(meta.before.symbols ?? [], null, 2);
    after = JSON.stringify(meta.mutation.symbols, null, 2);
  } else {
    // 'filter' kind — don't render a diff card; render a status line.
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-[color:var(--accent-primary-dim)] text-[11px] text-accent-primary">
        <span aria-hidden>⚙</span>
        <span>{meta.mutation.filter.description}</span>
      </div>
    );
  }
  return (
    <DiffPreviewCard
      kind={kind}
      reason={msg.content || (kind === 'code' ? '代码改动' : '币列表更新')}
      before={before}
      after={after}
      resolved={meta.resolved ?? undefined}
      onApply={() => onApply?.(msg, meta)}
      onReject={() => onReject?.(msg, meta)}
    />
  );
}

function ChatBubble({
  role,
  content,
}: {
  role: 'user' | 'assistant' | 'system';
  content: string;
}) {
  if (role === 'system') return null; // System messages aren't shown to user
  const isUser = role === 'user';
  return (
    <div className={'flex ' + (isUser ? 'justify-end' : 'justify-start gap-2 items-start')}>
      {!isUser && (
        <div className="w-6 h-6 rounded-full bg-[color:var(--accent-primary-dim)] text-accent-primary grid place-items-center text-[10px] flex-shrink-0">
          ✦
        </div>
      )}
      <div
        className={
          'max-w-[85%] px-3 py-2 rounded-xl text-[12px] leading-relaxed ' +
          (isUser
            ? 'bg-[color:var(--accent-primary-dim)] text-fg-primary'
            : 'text-fg-primary')
        }
      >
        {content}
      </div>
    </div>
  );
}
