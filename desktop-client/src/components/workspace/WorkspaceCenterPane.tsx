import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStrategySessionStore } from '@/stores/strategySessionStore';
import { BacktestResultPane } from './BacktestResultPane';
import type { components } from '@/types/api';

type CenterTab = 'code' | 'chart' | 'result';

type BacktestResultExtended = components['schemas']['BacktestResultExtended'];

interface Props {
  focusedSymbol: string | null;
  /** Tab state hoisted so the parent can auto-switch to "result" once
   *  a backtest finishes (Group 6 trigger). */
  activeTab?: CenterTab;
  onTabChange?: (t: CenterTab) => void;
  /** Pre-resolved result payload (set by the parent via polling).  When
   *  null + last_backtest exists, the result tab shows a loading state. */
  result: BacktestResultExtended | null;
  resultLoading: boolean;
  /** Stale = workspace has changed since this backtest finished. */
  resultStale: boolean;
  onRerunBacktest?: () => void;
  onFocusSymbolFromResult?: (symbol: string) => void;
}

/**
 * Center pane of the unified strategy workspace.  3 tabs (code / K线 /
 * result), with a tab strip at the top.  Defaults to chart.  Auto-
 * switches to result when a backtest just completed.  Mirrors the
 * Pencil frame `czDSt`.
 */
export function WorkspaceCenterPane({
  focusedSymbol,
  activeTab,
  onTabChange,
  result,
  resultLoading,
  resultStale,
  onRerunBacktest,
  onFocusSymbolFromResult,
}: Props) {
  const { t } = useTranslation();
  const strategy = useStrategySessionStore((s) => s.strategy);
  const [internalTab, setInternalTab] = useState<CenterTab>('chart');
  const tab: CenterTab = activeTab ?? internalTab;
  const setTab = (t: CenterTab) => {
    setInternalTab(t);
    onTabChange?.(t);
  };

  // Auto-switch to result tab once a backtest result becomes available
  // and the user hasn't explicitly picked another tab in the meantime.
  useEffect(() => {
    if (result && !resultLoading) {
      setTab('result');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, resultLoading]);

  const draftCode = strategy?.draft_code ?? null;
  const lastBacktest = strategy?.last_backtest;
  // Aggregate PnL — prefer the resolved result's summary; fall back to
  // the cached last_backtest payload (which may be a "pending" stub
  // until polling completes).
  const pnlPct = (() => {
    const m = result?.summary?.metrics?.total_return;
    if (typeof m === 'number') return m * 100;
    const fallback = lastBacktest?.summary?.pnl_pct;
    return typeof fallback === 'number' ? fallback : null;
  })();

  return (
    <div className="flex flex-col h-full">
      {/* Tab strip */}
      <div className="flex items-center gap-1 px-4 h-12 border-b border-border-subtle">
        <TabButton active={tab === 'code'} onClick={() => setTab('code')}>
          {t('workspace.tab.code', { defaultValue: '代码' })}
        </TabButton>
        <TabButton active={tab === 'chart'} onClick={() => setTab('chart')}>
          {t('workspace.tab.chart', { defaultValue: 'K线' })}
        </TabButton>
        <TabButton active={tab === 'result'} onClick={() => setTab('result')}>
          {t('workspace.tab.result', { defaultValue: '结果' })}
          {pnlPct != null && (
            <span
              className={
                'ml-1.5 inline-flex items-center px-1.5 h-[18px] rounded-full text-[10px] font-mono font-semibold ' +
                (pnlPct >= 0
                  ? 'bg-[color:var(--accent-green-dim)] text-accent-green'
                  : 'bg-[color:var(--accent-red-dim)] text-accent-red')
              }
            >
              {pnlPct >= 0 ? '+' : ''}
              {pnlPct.toFixed(1)}%
            </span>
          )}
        </TabButton>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {tab === 'code' && <CodeView code={draftCode} />}
        {tab === 'chart' && <ChartView focusedSymbol={focusedSymbol} />}
        {tab === 'result' && (
          <ResultView
            result={result}
            loading={resultLoading}
            stale={resultStale}
            lastBacktest={lastBacktest ?? null}
            onRerun={onRerunBacktest}
            onFocusSymbol={onFocusSymbolFromResult}
          />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        'inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[13px] font-medium transition-colors ' +
        (active
          ? 'bg-surface-tertiary text-fg-primary font-semibold'
          : 'text-fg-secondary hover:text-fg-primary hover:bg-surface-tertiary/50')
      }
    >
      {children}
    </button>
  );
}

function CodeView({ code }: { code: string | null }) {
  const { t } = useTranslation();
  if (!code) {
    return (
      <div className="p-8 text-sm text-fg-muted leading-relaxed max-w-prose">
        {t('workspace.center.code.empty', {
          defaultValue:
            '尚无策略代码草稿。和右侧 AI 描述你的交易思路（"BTC 均值回归"、"突破策略" 等），AI 会生成代码并通过 diff 预览让你确认。',
        })}
      </div>
    );
  }
  return (
    <pre className="p-4 text-[11px] font-mono leading-relaxed text-fg-primary whitespace-pre-wrap">
      {code}
    </pre>
  );
}

function ChartView({ focusedSymbol }: { focusedSymbol: string | null }) {
  const { t } = useTranslation();
  if (!focusedSymbol) {
    return (
      <div className="p-8 text-sm text-fg-muted">
        {t('workspace.center.chart.no_symbol', {
          defaultValue: '从左栏选一个币种来看 K 线图。',
        })}
      </div>
    );
  }
  return (
    <div className="p-8 text-sm text-fg-muted">
      {t('workspace.center.chart.placeholder', {
        defaultValue: 'K 线图（{{sym}}）— 即将接入实时图表。',
        sym: focusedSymbol,
      })}
    </div>
  );
}

function ResultView({
  result,
  loading,
  stale,
  lastBacktest,
  onRerun,
  onFocusSymbol,
}: {
  result: BacktestResultExtended | null;
  loading: boolean;
  stale: boolean;
  lastBacktest: { task_id: string; summary: Record<string, unknown>; ran_at: number } | null;
  onRerun?: () => void;
  onFocusSymbol?: (symbol: string) => void;
}) {
  const { t } = useTranslation();

  // No backtest at all yet
  if (!lastBacktest) {
    return (
      <div className="p-8 text-sm text-fg-muted leading-relaxed">
        {t('workspace.center.result.empty', {
          defaultValue:
            '还没有回测结果。两半准备好（策略代码 + 币列表）后会自动跑一次回测。',
        })}
      </div>
    );
  }
  // Pending: backtest dispatched but result not yet resolved
  if (loading || !result) {
    return (
      <div className="p-8 text-sm text-fg-muted leading-relaxed flex items-center gap-3">
        <span className="animate-spin" aria-hidden>
          ⟳
        </span>
        <span>
          {t('workspace.center.result.pending', {
            defaultValue: '回测进行中…',
          })}
        </span>
      </div>
    );
  }
  // Resolved — render the proper Group 6 result pane
  return (
    <BacktestResultPane
      result={result}
      stale={stale}
      onRerun={onRerun}
      onFocusSymbol={onFocusSymbol}
    />
  );
}
