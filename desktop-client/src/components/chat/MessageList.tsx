import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatMessage } from '@/types/domain';
import { CodeBlock } from './CodeBlock';
import { AutoRunStatus } from './AutoRunStatus';

interface Props {
  messages: ChatMessage[];
  partial: string;
  /** True while a request is in flight. When there's no partial text
   *  yet (i.e. the model hasn't streamed its first token), the list
   *  renders a pulsing "thinking" placeholder so the user sees
   *  acknowledgement rather than an empty transcript. */
  streaming?: boolean;
}

interface Segment {
  kind: 'text' | 'code';
  content: string;
  lang?: string;
}

/** Split a message body into text + ```lang blocks so we can render code
 *  with syntax highlighting while keeping prose flowing. */
function parseSegments(raw: string): Segment[] {
  const out: Segment[] = [];
  const fence = /```(\w*)\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(raw))) {
    if (m.index > last) out.push({ kind: 'text', content: raw.slice(last, m.index) });
    out.push({ kind: 'code', content: m[2], lang: m[1] || 'python' });
    last = m.index + m[0].length;
  }
  if (last < raw.length) out.push({ kind: 'text', content: raw.slice(last) });
  return out;
}

export function MessageList({ messages, partial, streaming }: Props) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, partial, streaming]);

  return (
    <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
      {messages.map((m, i) => (
        <Bubble key={i} role={m.role} content={m.content} messageIndex={i} />
      ))}
      {partial && <Bubble role="assistant" content={partial} pulsing messageIndex={-1} />}
      {/* "Thinking" placeholder — only visible in the gap between the
          user's send and the model's first streamed token. Once any
          partial text arrives, the Bubble above takes over. */}
      {streaming && !partial && <ThinkingBubble />}
    </div>
  );
}

/** Pulsing three-dot indicator shown while the AI is processing but
 *  hasn't emitted a single token yet. Gives the user immediate
 *  feedback so they don't mistake the empty transcript for a hung UI. */
function ThinkingBubble() {
  const { t } = useTranslation();
  return (
    <div className="flex" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-fg-secondary text-sm">
        <span className="flex gap-1" aria-hidden>
          <span className="w-1.5 h-1.5 rounded-full bg-fg-muted animate-bounce [animation-delay:-0.3s]" />
          <span className="w-1.5 h-1.5 rounded-full bg-fg-muted animate-bounce [animation-delay:-0.15s]" />
          <span className="w-1.5 h-1.5 rounded-full bg-fg-muted animate-bounce" />
        </span>
        <span className="italic">
          {t('ai.thinking', { defaultValue: 'Thinking…' })}
        </span>
      </div>
    </div>
  );
}

function Bubble({
  role,
  content,
  pulsing,
  messageIndex,
}: {
  role: ChatMessage['role'];
  content: string;
  pulsing?: boolean;
  /** Stable index of this message in the conversation. Used by
   *  AutoRunStatus to render only under the message that actually
   *  triggered a backend run. `-1` for the streaming partial bubble. */
  messageIndex: number;
}) {
  const segments = useMemo(() => parseSegments(content), [content]);

  if (role === 'system') return null;

  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-surface-tertiary text-fg-primary rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className={'flex ' + (pulsing ? 'animate-pulse' : '')}>
      <div className="max-w-[95%] text-fg-primary text-sm leading-relaxed space-y-2">
        {segments.map((seg, i) =>
          seg.kind === 'code' ? (
            <CodeBlock key={i} code={seg.content} language={seg.lang} />
          ) : (
            <div key={i} className="whitespace-pre-wrap break-words">
              {seg.content}
            </div>
          ),
        )}
        <AutoRunStatus messageIndex={messageIndex} />
      </div>
    </div>
  );
}
