import { useTranslation } from 'react-i18next';
import type { WorkspaceStrategy, ChatMessage } from '@/stores/strategySessionStore';

export interface StrategyLibraryCardProps {
  strategy: WorkspaceStrategy;
  /** Last chat message preview (joined "role: content" snippet, ≤80 chars).
   *  Pass null when no chat history.  Library uses
   *  window.claw.db.strategyChats to fetch + cache these. */
  lastMessage: ChatMessage | null;
  favorite: boolean;
  onClick: () => void;
  onToggleFavorite?: (next: boolean) => void;
}

/**
 * One row of the new conversation-style strategy library.  Mirrors
 * Pencil reference frame `twKvt`'s card sub-layout:
 *
 *   ★  Strategy name [saved/draft badge]      +18.3%   11 syms   2 天前  ›
 *      AI: 调到 RSI 21 之后波动小很多, 最大回撤 -8% → -4%
 */
export function StrategyLibraryCard({
  strategy,
  lastMessage,
  favorite,
  onClick,
  onToggleFavorite,
}: StrategyLibraryCardProps) {
  const { t } = useTranslation();

  const isSaved = !!strategy.saved_at;
  const isArchivedDraft = !!strategy.is_archived_draft;
  const symbolCount = strategy.draft_symbols?.length ?? strategy.saved_symbols?.length ?? 0;
  const pnlPct = (() => {
    const v = strategy.last_backtest?.summary?.pnl_pct;
    return typeof v === 'number' ? v : null;
  })();

  const updatedAt = (strategy.saved_at ?? strategy.updated_at ?? 0) as number;
  const relTime = useRelativeTime(updatedAt);

  const displayName = strategy.name || t('library.untitled', { defaultValue: '未命名' });
  const snippet = formatSnippet(lastMessage);

  let badgeText: string;
  let badgeClass: string;
  if (isArchivedDraft) {
    badgeText = t('library.badge.archivedDraft', { defaultValue: '归档草稿' });
    badgeClass = 'bg-surface-tertiary text-fg-muted';
  } else if (!isSaved) {
    badgeText = t('library.badge.draft', { defaultValue: '草稿' });
    badgeClass = 'bg-surface-tertiary text-accent-yellow';
  } else {
    badgeText = t('library.badge.saved', { defaultValue: '已保存' });
    badgeClass = 'bg-[color:var(--accent-green-dim)] text-accent-green';
  }

  return (
    <button
      onClick={onClick}
      className={
        'w-full text-left rounded-lg bg-surface-secondary border border-border-subtle ' +
        'hover:border-border-strong transition-colors px-5 py-3.5 ' +
        'flex items-center gap-4 group'
      }
    >
      {/* Star (favorite toggle) */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite?.(!favorite);
        }}
        className={
          'flex-shrink-0 w-5 h-5 grid place-items-center text-base transition-colors ' +
          (favorite
            ? 'text-accent-yellow'
            : 'text-fg-muted hover:text-accent-yellow')
        }
        aria-label={t(favorite ? 'library.unfavorite' : 'library.favorite', {
          defaultValue: favorite ? 'Unfavorite' : 'Favorite',
        })}
      >
        {favorite ? '★' : '☆'}
      </button>

      {/* Main column: name + snippet */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span
            className={
              'font-heading text-[14px] font-semibold truncate ' +
              (isArchivedDraft ? 'text-fg-secondary' : 'text-fg-primary')
            }
            title={displayName}
          >
            {displayName}
          </span>
          <span
            className={
              'inline-flex items-center px-1.5 h-[18px] rounded-full text-[10px] font-semibold ' +
              badgeClass
            }
          >
            {badgeText}
          </span>
        </div>
        <div className="text-[11px] text-fg-muted truncate" title={snippet}>
          {snippet}
        </div>
      </div>

      {/* Right metadata: PnL pill, symbols, time, chevron */}
      <div className="flex items-center gap-3.5 flex-shrink-0">
        <PnlPill pnlPct={pnlPct} />
        <div className="flex items-center gap-1 text-fg-muted">
          <span aria-hidden>🪙</span>
          <span className="text-[11px] font-mono font-medium">
            {t('library.card.symbols', { defaultValue: '{{n}} syms', n: symbolCount })}
          </span>
        </div>
        <span className="text-[11px] text-fg-muted">{relTime}</span>
        <span className="text-fg-muted text-sm transition-transform group-hover:translate-x-0.5">
          ›
        </span>
      </div>
    </button>
  );
}

function PnlPill({ pnlPct }: { pnlPct: number | null }) {
  if (pnlPct == null) {
    return (
      <span className="inline-flex items-center px-2.5 h-7 rounded-md bg-surface-tertiary text-fg-muted text-[13px] font-mono font-bold">
        —
      </span>
    );
  }
  const isPositive = pnlPct >= 0;
  return (
    <span
      className={
        'inline-flex items-center px-2.5 h-7 rounded-md text-[13px] font-mono font-bold ' +
        (isPositive
          ? 'bg-[color:var(--accent-green-dim)] text-accent-green'
          : 'bg-[color:var(--accent-red-dim)] text-accent-red')
      }
    >
      {isPositive ? '+' : ''}
      {pnlPct.toFixed(1)}%
    </span>
  );
}

function formatSnippet(msg: ChatMessage | null): string {
  if (!msg) return '—';
  const prefix = msg.role === 'user' ? '你' : msg.role === 'assistant' ? 'AI' : '系统';
  const trimmed = msg.content.replace(/```[\s\S]*?```/g, '').replace(/\s+/g, ' ').trim();
  if (!trimmed) return '—';
  const max = 80 - prefix.length - 2;
  const sliced = trimmed.length > max ? `${trimmed.slice(0, max).trimEnd()}…` : trimmed;
  return `${prefix}: ${sliced}`;
}

/** Pure relative-time formatter — null/0 → '—'. */
function useRelativeTime(unixSeconds: number): string {
  if (!unixSeconds) return '—';
  const ms = unixSeconds * 1000;
  const diff = Date.now() - ms;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days === 1) return '昨天';
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  if (days < 365) return `${Math.floor(days / 30)} 个月前`;
  return `${Math.floor(days / 365)} 年前`;
}
