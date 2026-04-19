import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  if (!metrics) {
    return (
      <div className="p-6 text-center text-fg-muted text-sm">
        {t('metric.pending')}.
      </div>
    );
  }
  const headline: Metric[] = [
    { label: t('metric.total_return'), value: pct(metrics.total_return), unit: '%', emphasis: 'large' },
    { label: t('metric.sharpe_ratio'), value: metrics.sharpe ?? null, emphasis: 'large' },
    { label: t('metric.max_drawdown'), value: pct(metrics.max_drawdown), unit: '%', emphasis: 'large' },
  ];
  const secondary: Metric[] = [
    { label: t('metric.sortino_ratio'), value: metrics.sortino ?? null },
    { label: t('metric.calmar_ratio'), value: metrics.calmar ?? null },
    { label: t('metric.profit_factor'), value: metrics.profit_factor ?? null },
    { label: t('metric.win_rate'), value: pct(metrics.win_rate), unit: '%' },
    { label: t('metric.avg_trade'), value: pct(metrics.avg_trade), unit: '%' },
    { label: t('metric.avg_hours'), value: metrics.avg_hours_in_trade ?? null },
    { label: t('metric.positive_days'), value: pct(metrics.positive_days_ratio), unit: '%' },
    { label: t('metric.total_trades'), value: metrics.total_trades ?? null },
  ];
  return (
    <div className="space-y-4">
      <MetricsGrid metrics={headline} minColWidth={200} />
      <MetricsGrid metrics={secondary} />
    </div>
  );
}
