import { useEffect, useState } from 'react';
import type { Conversation } from '@/types/domain';

interface Props {
  open: boolean;
  onClose: () => void;
  onLoad: (conversation: Conversation) => void;
}

/** Dropdown/panel listing past AI conversations. */
export function ConversationHistory({ open, onClose, onLoad }: Props) {
  const [list, setList] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void (async () => {
      const rows = (await window.claw.db.conversations.list(30)) as Conversation[];
      setList(rows);
      setLoading(false);
    })();
  }, [open]);

  if (!open) return null;

  return (
    <div className="absolute right-0 top-14 z-20 w-80 max-h-96 overflow-y-auto bg-surface-primary border border-border-subtle rounded-lg shadow-lg">
      <div className="flex items-center justify-between p-3 border-b border-border-subtle">
        <div className="font-heading font-semibold text-sm">History</div>
        <button
          onClick={onClose}
          className="text-fg-muted hover:text-fg-primary text-sm"
          aria-label="close"
        >
          ✕
        </button>
      </div>

      {loading && <div className="p-3 text-xs text-fg-muted">Loading…</div>}

      {!loading && list.length === 0 && (
        <div className="p-3 text-xs text-fg-muted">No conversations yet.</div>
      )}

      <div className="divide-y divide-border-subtle">
        {list.map((c) => {
          const last = c.messages[c.messages.length - 1];
          return (
            <button
              key={c.id}
              onClick={() => {
                onLoad(c);
                onClose();
              }}
              className="w-full text-left p-3 hover:bg-surface-secondary"
            >
              <div className="text-xs font-medium truncate">
                {c.title || (last?.content ?? 'Untitled conversation').slice(0, 60)}
              </div>
              <div className="text-[10px] text-fg-muted mt-1">
                {c.messages.length} messages · {new Date(c.updated_at).toLocaleString()}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
