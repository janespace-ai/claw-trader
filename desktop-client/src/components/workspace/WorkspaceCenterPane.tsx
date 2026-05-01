import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStrategySessionStore } from '@/stores/strategySessionStore';

type CenterTab = 'code' | 'chart' | 'result';

interface Props {
  focusedSymbol: string | null;
}

/**
 * Center pane of the unified strategy workspace.  3 tabs (code / K线 /
 * result), with a tab strip at the top.  Defaults to chart.  Auto-
 * switches to result when a backtest just completed.  Mirrors the
 * Pencil frame `czDSt`.
 */
export function WorkspaceCenterPane({ focusedSymbol }: Props) {
  const { t } = useTranslation();
  const strategy = useStrategySessionStore((s) => s.strategy);
  const [tab, setTab] = useState<CenterTab>('chart');

  const draftCode = strategy?.draft_code ?? null;
  const lastBacktest = strategy?.last_backtest;
  const pnlPct =
    typeof lastBacktest?.summary?.pnl_pct === 'number'
      ? (lastBacktest.summary.pnl_pct as number)
      : null;

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
        {tab === 'result' && <ResultView lastBacktest={lastBacktest ?? null} />}
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
  lastBacktest,
}: {
  lastBacktest: { task_id: string; summary: Record<string, unknown>; ran_at: number } | null;
}) {
  const { t } = useTranslation();
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
  // Group 6 will replace this placeholder with the real
  // multi-symbol-backtest-results component (aggregate metrics + per-symbol drill-down).
  return (
    <div className="p-6 space-y-3">
      <h3 className="font-heading font-bold text-fg-primary">
        {t('workspace.center.result.title', { defaultValue: '回测结果' })}
      </h3>
      <div className="text-xs text-fg-muted">
        Task: <span className="font-mono">{lastBacktest.task_id}</span>
      </div>
      <pre className="p-3 bg-surface-secondary rounded-md text-[11px] font-mono whitespace-pre-wrap">
        {JSON.stringify(lastBacktest.summary, null, 2)}
      </pre>
      <div className="text-[11px] text-fg-muted italic">
        {t('workspace.center.result.todo', {
          defaultValue:
            'Group 6 of unified-strategy-workspace will replace this with aggregate metrics + sortable per-symbol table.',
        })}
      </div>
    </div>
  );
}
