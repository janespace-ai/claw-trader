import { useRef, useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useConversationStore } from '@/stores/conversationStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAppStore } from '@/stores/appStore';
import { useCoinListStore } from '@/stores/coinListStore';
import { useAutoRunStore } from '@/stores/autoRunStore';
import { startChatStream } from '@/services/llm/client';
import { systemPromptFor } from '@/services/prompt';
import { resolveReplyLang } from '@/services/i18n';
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
  const setSymbols = useCoinListStore((s) => s.set);
  const setAutoRunStatus = useAutoRunStore((s) => s.setStatus);

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

    const system: ChatMessage = {
      role: 'system',
      content: systemPromptFor(promptMode) + '\n\n' + langLine,
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
      handle.onDone((complete) => {
        const finalText = complete || full;
        append({ role: 'assistant', content: finalText, ts: Date.now() });
        setPartial('');
        setStreaming(false, null);
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
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-accent-primary-dim grid place-items-center">
            <span className="text-accent-primary text-xs">✦</span>
          </div>
          <div className="leading-tight">
            <div className="font-heading font-semibold text-sm">{t('ai.strategist')}</div>
            <div className="text-[10px] text-fg-muted">{providers[defaultProvider]?.model ?? ''}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setHistoryOpen((v) => !v)}
            className="text-fg-secondary hover:text-fg-primary text-sm"
            aria-label="history"
            title="History"
          >
            ⟲
          </button>
          <button
            onClick={newConversation}
            className="text-fg-secondary hover:text-fg-primary text-sm"
            aria-label="new"
            title="New conversation"
          >
            +
          </button>
        </div>
      </div>

      <ConversationHistory
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onLoad={loadConversation}
      />

      <MessageList messages={messages} partial={partial} />

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
