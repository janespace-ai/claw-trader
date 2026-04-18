import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@/types/domain';

interface Props {
  messages: ChatMessage[];
  partial: string;
}

export function MessageList({ messages, partial }: Props) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, partial]);

  return (
    <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
      {messages.map((m, i) => (
        <Bubble key={i} role={m.role} content={m.content} />
      ))}
      {partial && <Bubble role="assistant" content={partial} pulsing />}
    </div>
  );
}

function Bubble({
  role,
  content,
  pulsing,
}: {
  role: ChatMessage['role'];
  content: string;
  pulsing?: boolean;
}) {
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] bg-surface-tertiary text-fg-primary rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words">
          {content}
        </div>
      </div>
    );
  }
  if (role === 'system') return null;
  return (
    <div className="flex">
      <div
        className={
          'max-w-[90%] text-fg-primary text-sm whitespace-pre-wrap break-words leading-relaxed ' +
          (pulsing ? 'animate-pulse' : '')
        }
      >
        {content}
      </div>
    </div>
  );
}
