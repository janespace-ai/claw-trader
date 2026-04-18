import { useRef, useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useConversationStore } from '@/stores/conversationStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { startChatStream } from '@/services/llm/client';
import { systemPromptFor } from '@/services/prompt';
import { resolveReplyLang } from '@/services/i18n';
import type { ChatMessage } from '@/types/domain';
import { MessageList } from './MessageList';

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

  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

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
    const system: ChatMessage = {
      role: 'system',
      content:
        systemPromptFor('strategy') +
        `\n\nIMPORTANT: Reply in ${replyLang === 'zh' ? 'Simplified Chinese (简体中文)' : 'English'}.`,
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
        append({ role: 'assistant', content: complete || full, ts: Date.now() });
        setPartial('');
        setStreaming(false, null);
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
  }, [input, streaming, providers, defaultProvider, aiLanguagePolicy, messages, append, setStreaming, setPartial, t]);

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
    <div className="flex flex-col h-full">
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
      </div>

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
