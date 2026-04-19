import { MetricsGrid, type Metric } from '@/components/primitives';
import type { components } from '@/types/api';

type MetricsExt = components['schemas']['MetricsBlockExtended'];

interface Props {
  metrics?: MetricsExt;
}

function pct(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return v * 100;
}

export function MetricsTab({ metrics }: Props) {
  if (!metrics) {
    return (
      <div className="p-6 text-center text-fg-muted text-sm">
        Metrics pending.
      </div>
    );
  }
  const headline: Metric[] = [
    { label: 'Total Return', value: pct(metrics.total_return), unit: '%', emphasis: 'large' },
    { label: 'Sharpe', value: metrics.sharpe ?? null, emphasis: 'large' },
    { label: 'Max DD', value: pct(metrics.max_drawdown), unit: '%', emphasis: 'large' },
  ];
  const secondary: Metric[] = [
    { label: 'Sortino', value: metrics.sortino ?? null },
    { label: 'Calmar', value: metrics.calmar ?? null },
    { label: 'Profit Factor', value: metrics.profit_factor ?? null },
    { label: 'Win Rate', value: pct(metrics.win_rate), unit: '%' },
    { label: 'Avg Trade', value: pct(metrics.avg_trade), unit: '%' },
    { label: 'Avg Hours', value: metrics.avg_hours_in_trade ?? null },
    { label: 'Positive Days', value: pct(metrics.positive_days_ratio), unit: '%' },
    { label: 'Total Trades', value: metrics.total_trades ?? null },
  ];
  return (
    <div className="space-y-4">
      <MetricsGrid metrics={headline} minColWidth={200} />
      <MetricsGrid metrics={secondary} />
    </div>
  );
}
