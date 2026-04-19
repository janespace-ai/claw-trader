import { useAutoRunStore } from '@/stores/autoRunStore';

interface Props {
  /** Index of the assistant message this row lives under. Only shows
   *  when the store's triggerMessageIndex matches. */
  messageIndex: number;
}

/** Tiny status row embedded under an assistant bubble while the chat-
 *  triggered screener is running / after it finishes. */
export function AutoRunStatus({ messageIndex }: Props) {
  const status = useAutoRunStore((s) => s.status);
  const triggerIdx = useAutoRunStore((s) => s.triggerMessageIndex);

  if (!status || triggerIdx !== messageIndex) return null;

  if (status.phase === 'running') {
    return (
      <div className="flex items-center gap-2 text-[11px] text-fg-muted mt-1 animate-pulse">
        <span className="w-1.5 h-1.5 rounded-full bg-accent-primary" />
        <span>Running screener on backend…</span>
      </div>
    );
  }
  if (status.phase === 'done') {
    const { matched, total } = status;
    return (
      <div className="flex items-center gap-2 text-[11px] text-accent-green mt-1">
        <span>✓</span>
        <span>
          {matched} symbols matched
          {total > matched && ` (of ${total} screened)`}
          {' — populated on the left'}
        </span>
      </div>
    );
  }
  if (status.phase === 'failed') {
    return (
      <div className="flex items-start gap-2 text-[11px] text-accent-red mt-1">
        <span>⚠</span>
        <span>Screener failed: {status.error}</span>
      </div>
    );
  }
  return null;
}
