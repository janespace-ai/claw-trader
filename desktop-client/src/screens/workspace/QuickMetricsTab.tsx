import { MetricsGrid, type Metric } from '@/components/primitives';
import type { components } from '@/types/api';

type MetricsBlock = components['schemas']['MetricsBlock'];

interface Props {
  metrics?: MetricsBlock;
}

function pctOrNull(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return v * 100;
}

/** Six headline tiles. The Preview screen keeps this list tight; the
 *  full Deep metric grid lives in the Deep workspace. */
export function QuickMetricsTab({ metrics }: Props) {
  if (!metrics) {
    return (
      <div className="p-6 text-center text-fg-muted text-sm">
        Metrics pending — waiting for backtest result.
      </div>
    );
  }
  const tiles: Metric[] = [
    { label: 'Return', value: pctOrNull(metrics.total_return), unit: '%' },
    { label: 'Sharpe', value: metrics.sharpe ?? null },
    { label: 'Max DD', value: pctOrNull(metrics.max_drawdown), unit: '%' },
    { label: 'Win Rate', value: pctOrNull(metrics.win_rate), unit: '%' },
    { label: 'Trades', value: metrics.total_trades ?? null },
    { label: 'Profit Factor', value: metrics.profit_factor ?? null },
  ];
  return <MetricsGrid metrics={tiles} />;
}
