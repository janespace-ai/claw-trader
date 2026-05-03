import { useTranslation } from 'react-i18next';
import {
  useStrategySessionStore,
  type BottomTab,
} from '@/stores/strategySessionStore';
import { BacktestResultPane } from './BacktestResultPane';
import { FilteredSymbolsTab } from './FilteredSymbolsTab';
import type { components } from '@/types/api';

type BacktestResultExtended = components['schemas']['BacktestResultExtended'];

interface Props {
  /** Pre-resolved result payload (set by the parent via polling). */
  result: BacktestResultExtended | null;
  resultLoading: boolean;
  resultStale: boolean;
  onRerunBacktest?: () => void;
  onFocusSymbolFromResult?: (symbol: string) => void;
}

/**
 * Workspace center-bottom zone: 3-tab area for filtered symbols /
 * code / result.  Tab state lives on `useStrategySessionStore.bottomTab`
 * so AI-driven strong auto-switch (Group 7) can drive it.
 *
 * Pencil reference: `A7ubw` center bottom + `V8qt9` (代码) + `O8TIU2`
 * (回测).
 */
export function WorkspaceTabsPane(props: Props) {
  const { t } = useTranslation();
  const tab = useStrategySessionStore((s) => s.bottomTab);
  const setTab = useStrategySessionStore((s) => s.setBottomTab);
  const strategy = useStrategySessionStore((s) => s.strategy);
  const lastFiltered = useStrategySessionStore((s) => s.lastFilteredSymbols);

  const draftCount = strategy?.draft_symbols?.length ?? 0;
  const filteredCount = lastFiltered?.symbols.length ?? 0;
  const tabBadge = draftCount + filteredCount;
  const lastFilteredAgo = lastFiltered?.runAt
    ? formatAgo(lastFiltered.runAt)
    : null;

  return (
    <div className="flex flex-col h-full bg-surface-primary">
      {/* Tab bar — 44px */}
      <div
        className="flex items-center gap-1 px-4 border-b border-border-subtle"
        style={{ height: 44, flex: '0 0 44px' }}
      >
        <TabButton
          active={tab === 'filtered'}
          onClick={() => setTab('filtered')}
          label={t('workspace.tabs.filtered', { defaultValue: '选出的币' })}
          badge={tabBadge > 0 ? String(tabBadge) : undefined}
        />
        <TabButton
          active={tab === 'code'}
          onClick={() => setTab('code')}
          label={t('workspace.tabs.code', { defaultValue: '代码' })}
        />
        <TabButton
          active={tab === 'result'}
          onClick={() => setTab('result')}
          label={t('workspace.tabs.result', { defaultValue: '回测' })}
        />
        <div className="flex-1" />
        {tab === 'filtered' && lastFilteredAgo && (
          <span className="text-[11px] text-fg-muted">
            {t('workspace.tabs.filtered.lastRun', {
              defaultValue: 'AI 上次跑完 · {{ago}}',
              ago: lastFilteredAgo,
            })}
          </span>
        )}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {tab === 'filtered' && <FilteredSymbolsTab />}
        {tab === 'code' && <CodeTab />}
        {tab === 'result' && (
          <ResultTab
            result={props.result}
            loading={props.resultLoading}
            stale={props.resultStale}
            lastBacktest={strategy?.last_backtest ?? null}
            onRerun={props.onRerunBacktest}
            onFocusSymbol={props.onFocusSymbolFromResult}
          />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      data-tab-active={active}
      className={
        'inline-flex items-center gap-1.5 h-11 px-3.5 text-[13px] transition-colors ' +
        (active
          ? 'text-fg-primary font-semibold border-b-2 border-accent-primary'
          : 'text-fg-secondary hover:text-fg-primary border-b-2 border-transparent')
      }
    >
      <span>{label}</span>
      {badge && (
        <span
          className={
            'inline-flex items-center justify-center min-w-[1.25rem] px-1.5 py-px ' +
            'rounded-sm text-[10px] font-mono font-semibold ' +
            (active
              ? 'bg-[color:var(--accent-primary-dim)] text-accent-primary'
              : 'bg-surface-tertiary text-fg-muted')
          }
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function CodeTab() {
  const { t } = useTranslation();
  const code = useStrategySessionStore((s) => s.strategy?.draft_code ?? null);
  if (!code) {
    return (
      <div className="p-8 text-[13px] text-fg-muted leading-relaxed max-w-prose">
        {t('workspace.tabs.code.empty', {
          defaultValue:
            '代码是空的 · 跟右边 AI 描述策略想法,它会写。每次改动会以 diff 卡片让你确认。',
        })}
      </div>
    );
  }
  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="font-mono text-[12px] font-semibold text-fg-secondary">
          strategy.py
        </span>
        <span className="text-[11px] text-fg-muted">
          {code.split('\n').length} 行
        </span>
      </div>
      <pre className="bg-surface-secondary rounded-md p-4 text-[11px] font-mono leading-relaxed text-fg-primary whitespace-pre-wrap">
        {code}
      </pre>
    </div>
  );
}

interface ResultTabProps {
  result: BacktestResultExtended | null;
  loading: boolean;
  stale: boolean;
  lastBacktest:
    | components['schemas']['Strategy']['last_backtest']
    | null;
  onRerun?: () => void;
  onFocusSymbol?: (symbol: string) => void;
}

function ResultTab(p: ResultTabProps) {
  const { t } = useTranslation();
  if (!p.lastBacktest) {
    return (
      <div className="p-8 text-[13px] text-fg-muted leading-relaxed max-w-prose">
        {t('workspace.tabs.result.empty', {
          defaultValue: '还没跑过回测 · 草稿齐了会自动跑',
        })}
      </div>
    );
  }
  if (p.loading || !p.result) {
    return (
      <div className="p-8 text-[13px] text-fg-muted leading-relaxed flex items-center gap-3">
        <span className="animate-spin" aria-hidden>
          ⟳
        </span>
        <span>
          {t('workspace.tabs.result.pending', { defaultValue: '回测进行中…' })}
        </span>
      </div>
    );
  }
  return (
    <BacktestResultPane
      result={p.result}
      stale={p.stale}
      onRerun={p.onRerun}
      onFocusSymbol={p.onFocusSymbol}
    />
  );
}

function formatAgo(ms: number): string {
  const d = Date.now() - ms;
  const s = Math.floor(d / 1000);
  if (s < 5) return '刚刚';
  if (s < 60) return `${s} 秒前`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}
