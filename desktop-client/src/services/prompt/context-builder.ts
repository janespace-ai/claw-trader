import type { BacktestResultRecord, Trade } from '@/types/domain';

/** Build a compact, <=2000-token summary of a backtest result to inject as
 *  extra context when asking the AI to optimize. */
export function buildOptimizationContext(
  record: BacktestResultRecord,
  currentCode: string,
): string {
  const summary = record.summary_metrics?.all;
  const perSymbol = record.per_symbol_metrics ?? {};
  const trades = record.trades ?? [];

  const worstTrades = [...trades]
    .sort((a, b) => a.return_pct - b.return_pct)
    .slice(0, 5);
  const bestTrades = [...trades]
    .sort((a, b) => b.return_pct - a.return_pct)
    .slice(0, 3);

  const consecutiveLosses = longestLossRun(trades);

  const worstSymbols = Object.entries(perSymbol)
    .map(([s, m]) => ({ s, ret: m.all?.total_return ?? 0 }))
    .sort((a, b) => a.ret - b.ret)
    .slice(0, 3);

  return [
    `## Current strategy code`,
    '```python',
    currentCode,
    '```',
    '',
    `## Backtest summary (ALL / LONG / SHORT)`,
    summary
      ? [
          `total_return=${fmt(summary.total_return)}% | sharpe=${fmt(summary.sharpe_ratio)} | max_dd=${fmt(summary.max_drawdown)}%`,
          `win_rate=${fmt(summary.win_rate)}% | profit_factor=${fmt(summary.profit_factor)} | trades=${summary.total_trades ?? 0}`,
          `long=${record.summary_metrics?.long?.total_trades ?? 0} wins@${fmt(record.summary_metrics?.long?.win_rate ?? 0)}%`,
          `short=${record.summary_metrics?.short?.total_trades ?? 0} wins@${fmt(record.summary_metrics?.short?.win_rate ?? 0)}%`,
        ].join('\n')
      : '(no metrics)',
    '',
    `## Worst 5 trades`,
    ...worstTrades.map(
      (t) =>
        `- ${t.symbol} ${t.side.toUpperCase()} ${t.entry_time} → ${t.exit_time}  ${fmt(t.return_pct)}%  (pnl=${fmt(t.pnl)})`,
    ),
    '',
    `## Best 3 trades`,
    ...bestTrades.map(
      (t) =>
        `- ${t.symbol} ${t.side.toUpperCase()} ${t.entry_time} → ${t.exit_time}  ${fmt(t.return_pct)}%`,
    ),
    '',
    `## Consecutive loss run`,
    consecutiveLosses
      ? `max=${consecutiveLosses.length} trades, total=${fmt(consecutiveLosses.totalPct)}%`
      : 'none',
    '',
    `## Worst performing symbols`,
    ...worstSymbols.map((s) => `- ${s.s}: ${fmt(s.ret)}%`),
  ].join('\n');
}

function fmt(n: number | undefined): string {
  if (n === undefined || Number.isNaN(n)) return '—';
  return n.toFixed(2);
}

function longestLossRun(trades: Trade[]): { length: number; totalPct: number } | null {
  let best = { length: 0, totalPct: 0 };
  let cur = { length: 0, totalPct: 0 };
  for (const t of trades) {
    if (t.pnl < 0) {
      cur = { length: cur.length + 1, totalPct: cur.totalPct + t.return_pct };
      if (cur.length > best.length) best = { ...cur };
    } else {
      cur = { length: 0, totalPct: 0 };
    }
  }
  return best.length > 0 ? best : null;
}

/** Clamp a message history into a token budget by summarizing older turns.
 *  A rough heuristic: keep the most recent N messages fully, compress the rest. */
export function trimHistory<T extends { content: string }>(
  msgs: T[],
  maxChars = 60_000,
): T[] {
  let total = 0;
  const out: T[] = [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    total += msgs[i].content.length;
    if (total > maxChars) break;
    out.unshift(msgs[i]);
  }
  return out;
}
