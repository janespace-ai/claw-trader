import { useRef, useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useConversationStore } from '@/stores/conversationStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAppStore } from '@/stores/appStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useWorkspaceDraftStore } from '@/stores/workspaceDraftStore';
import { useCoinListStore } from '@/stores/coinListStore';
import { useAutoRunStore } from '@/stores/autoRunStore';
import { startChatStream } from '@/services/llm/client';
import { systemPromptFor } from '@/services/prompt';
import { strategistSystemPrompt } from '@/services/prompt/personas/strategist';
import { parseStrategistOutput } from '@/services/prompt/personas/parsers';
import { resolveReplyLang } from '@/services/i18n';
import { cremote } from '@/services/remote/contract-client';
import {
  extractPythonCode,
  looksLikeScreener,
  runScreenerFromCode,
} from '@/services/chat/screenerRunner';
import type { ChatMessage, Conversation } from '@/types/domain';
import { MessageList } from './MessageList';
import { ConversationHistory } from './ConversationHistory';

export function AIPanel() {
  const { t } = useTranslation();
  const messages = useConversationStore((s) => s.messages);
  const partial = useConversationStore((s) => s.partial);
  const streaming = useConversationStore((s) => s.streaming);
  const append = useConversationStore((s) => s.append);
  const setPartial = useConversationStore((s) => s.setPartial);
  const setStreaming = useConversationStore((s) => s.setStreaming);
  const stopStream = useConversationStore((s) => s.stopStream);

  const { defaultProvider, providers, aiLanguagePolicy } = useSettingsStore();
  const currentTab = useAppStore((s) => s.currentTab);
  const route = useAppStore((s) => s.route);
  const workspaceMode = useWorkspaceStore((s) => s.mode);
  const workspaceFocusedSymbol = useWorkspaceStore((s) => s.focusedSymbol);
  const workspaceCurrentStrategyId = useWorkspaceStore((s) => s.currentStrategyId);
  const setDraft = useWorkspaceDraftStore((s) => s.setDraft);
  const draftStrategyId = useWorkspaceDraftStore((s) => s.strategyId);
  const draftName = useWorkspaceDraftStore((s) => s.name);
  const setSymbols = useCoinListStore((s) => s.set);
  const setAutoRunStatus = useAutoRunStore((s) => s.setStatus);

  /** True when the app is currently in the Strategy Design workspace —
   *  the Strategist persona's auto-save flow should engage. */
  const inStrategistMode =
    route.kind === 'workspace' && workspaceMode === 'design';

  const [input, setInput] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Kick the backend screener from within the chat flow. Non-blocking:
  // the chat stays responsive while results trickle in.
  const maybeAutoRunScreener = useCallback(
    async (finalAssistantText: string) => {
      if (currentTab !== 'screener') return;
      const code = extractPythonCode(finalAssistantText);
      if (!code || !looksLikeScreener(code)) return;

      const messageIndex = useConversationStore.getState().messages.length - 1;
      setAutoRunStatus({ phase: 'running', taskId: '' }, messageIndex);

      await runScreenerFromCode(code, {
        onUpdate: (state) => {
          setAutoRunStatus(state, messageIndex);
          if (state.phase === 'done') {
            setSymbols(state.symbols);
          }
        },
      });
    },
    [currentTab, setAutoRunStatus, setSymbols],
  );

  const loadConversation = (c: Conversation) => {
    useConversationStore.setState({
      id: c.id,
      messages: c.messages,
      partial: '',
      streaming: false,
      activeHandle: null,
    });
  };
  const newConversation = () => {
    useConversationStore.getState().newConversation();
  };

  /**
   * Strategist-persona auto-save. Invoked from onDone after streaming
   * completes. Parses the assistant message for a structured summary
   * + code; if both are present, creates a new strategy (when there
   * isn't one yet) + appends a version.
   *
   * Failures are swallowed — the user's chat experience continues. Errors
   * surface in the chat bubble as visible content; the auto-save is a
   * background nicety.
   */
  const maybeAutoSaveStrategistOutput = useCallback(
    async (finalText: string) => {
      const parsed = parseStrategistOutput(finalText);
      if (!parsed.summary || !parsed.code) return;

      try {
        let strategyId = draftStrategyId ?? workspaceCurrentStrategyId ?? null;
        if (!strategyId) {
          // Create strategy + implicit v1 on backend. The backend
          // currently doesn't auto-create v1 yet (that's the
          // backtest-engine-strategy-versions change) — in the
          // meantime we still record the strategy row.
          const created = await cremote.createStrategy({
            name: parsed.summary.name || draftName || 'Untitled',
            code_type: 'strategy',
            code: parsed.code,
            params_schema: parsed.summary.params as Record<string, unknown> | undefined,
          });
          strategyId = created.id;
        } else {
          // Append a new version. Real backend will 404 today; we still
          // attempt it so integration errors surface in the console.
          // MSW returns a fixture.
          try {
            await cremote.createStrategyVersion({
              strategy_id: strategyId,
              body: {
                code: parsed.code,
                summary: parsed.summary.name,
                params_schema: parsed.summary.params as Record<string, unknown> | undefined,
              },
            });
          } catch {
            // Silently absorb 404s pre-backend-rollout.
          }
        }

        setDraft({
          strategyId: strategyId ?? undefined,
          summary: parsed.summary,
          code: parsed.code,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[strategist] auto-save failed', err);
      }
    },
    [draftStrategyId, workspaceCurrentStrategyId, draftName, setDraft],
  );

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const cfg = providers[defaultProvider];
    if (!cfg?.apiKey) {
      append({ role: 'assistant', content: `⚠️ ${t('error.api_key_invalid')}`, ts: Date.now() });
      return;
    }

    const userMsg: ChatMessage = { role: 'user', content: text, ts: Date.now() };
    append(userMsg);
    setInput('');

    const replyLang = resolveReplyLang(aiLanguagePolicy, text);

    // Intent routing: pick system prompt based on active Tab.
    //   screener tab   → screener-generating prompt
    //   strategies tab → strategy-generating prompt
    //   backtest tab   → optimization-oriented prompt
    const promptMode =
      currentTab === 'screener'
        ? 'screener'
        : currentTab === 'backtest'
          ? 'optimization'
          : 'strategy';

    // §16.19 — instruct the model to emit the strategy summary card's
    // human-readable fields in the active reply language.
    const langLine =
      replyLang === 'zh'
        ? '重要：用简体中文回复。策略/选币摘要（策略类型、条件描述、参数说明）也用中文。Python 代码本身保持英文。'
        : 'IMPORTANT: Reply in English. Strategy/screener summaries (strategy type, condition descriptions, parameter notes) should also be in English. Python code stays in English regardless.';

    // Strategist persona (Strategy Design workspace) uses a richer
    // prompt that requests a structured summary JSON + python code. For
    // other tabs we fall back to the generic promptMode-based prompt.
    const strategistPromptText = inStrategistMode
      ? strategistSystemPrompt({
          focusedSymbol: workspaceFocusedSymbol ?? 'BTC_USDT',
          interval: '1h',
          replyLang,
        })
      : null;

    const system: ChatMessage = {
      role: 'system',
      content: strategistPromptText ?? systemPromptFor(promptMode) + '\n\n' + langLine,
    };

    setStreaming(true);
    setPartial('');

    try {
      const handle = await startChatStream({
        provider: defaultProvider,
        model: cfg.model,
        apiKey: cfg.apiKey,
        baseURL: cfg.baseURL,
        messages: [system, ...messages, userMsg],
      });
      setStreaming(true, handle);

      let full = '';
      handle.onChunk((chunk) => {
        full += chunk;
        setPartial(full);
      });
      handle.onDone(async (complete) => {
        const finalText = complete || full;
        append({ role: 'assistant', content: finalText, ts: Date.now() });
        setPartial('');
        setStreaming(false, null);

        // Strategist persona: auto-parse + auto-save as a new strategy
        // version. Silent failures are fine (parser returns null on
        // invalid JSON; network failures just leave the draft stale).
        if (inStrategistMode) {
          await maybeAutoSaveStrategistOutput(finalText);
        }

        // Auto-run hook: if we're on the screener tab and the assistant
        // just emitted Python that looks like a screener, fire the
        // backend directly and populate the left panel. No button needed.
        void maybeAutoRunScreener(finalText);
      });
      handle.onError((err) => {
        append({ role: 'assistant', content: `⚠️ ${err}`, ts: Date.now() });
        setPartial('');
        setStreaming(false, null);
      });
    } catch (err: any) {
      append({ role: 'assistant', content: `⚠️ ${err?.message ?? String(err)}`, ts: Date.now() });
      setStreaming(false, null);
    }
  }, [input, streaming, providers, defaultProvider, aiLanguagePolicy, messages, append, setStreaming, setPartial, t, currentTab, maybeAutoRunScreener]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && document.activeElement === inputRef.current) {
        e.preventDefault();
        void send();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [send]);

  return (
    <div className="relative flex flex-col h-full">
      {/* AIPanel is always embedded inside an `AIPersonaShell` which
          already renders the persona title + model subtitle at the top
          of the right rail. Instead of duplicating that chrome, this
          panel only surfaces its conversation actions (history + new)
          as a compact top-right button bar. Matches Pencil `AIHeader`
          (Hbhty) right-side controls — 36×36 tap boxes with 18px icons
          rather than the previous bare text-sm glyphs. */}
      <div className="flex items-center justify-end gap-1.5 px-3 py-2 border-b border-border-subtle">
        <button
          onClick={() => setHistoryOpen((v) => !v)}
          className="w-9 h-9 rounded-md bg-surface-tertiary text-fg-secondary hover:text-fg-primary grid place-items-center text-lg transition-colors"
          aria-label={t('action.history', { defaultValue: 'History' })}
          title={t('action.history', { defaultValue: 'History' })}
        >
          <span aria-hidden>⟲</span>
        </button>
        <button
          onClick={newConversation}
          className="w-9 h-9 rounded-md bg-surface-tertiary text-fg-secondary hover:text-fg-primary grid place-items-center text-xl leading-none transition-colors"
          aria-label={t('action.new_conversation')}
          title={t('action.new_conversation')}
        >
          <span aria-hidden>+</span>
        </button>
      </div>

      <ConversationHistory
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onLoad={loadConversation}
      />

      <MessageList messages={messages} partial={partial} streaming={streaming} />

      <div className="px-3 py-2 border-t border-border-subtle">
        <div className="flex items-end gap-2 bg-surface-tertiary rounded-lg p-2">
          <textarea
            ref={inputRef}
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('ai.placeholder')}
            className="flex-1 bg-transparent outline-none resize-none text-sm text-fg-primary placeholder:text-fg-muted"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          {streaming ? (
            <button
              onClick={stopStream}
              className="w-7 h-7 rounded-md bg-surface-primary text-fg-primary grid place-items-center text-xs"
              aria-label={t('action.stop')}
            >
              ■
            </button>
          ) : (
            <button
              onClick={send}
              disabled={!input.trim()}
              className="w-7 h-7 rounded-md bg-accent-primary text-fg-inverse grid place-items-center text-sm disabled:opacity-40"
              aria-label={t('action.send')}
            >
              ↑
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
