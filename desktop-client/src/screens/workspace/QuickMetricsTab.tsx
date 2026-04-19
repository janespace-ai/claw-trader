import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  if (!metrics) {
    return (
      <div className="p-6 text-center text-fg-muted text-sm">
        {t('metric.pending_full')}
      </div>
    );
  }
  const tiles: Metric[] = [
    { label: t('metric.return'), value: pctOrNull(metrics.total_return), unit: '%' },
    { label: t('metric.sharpe_ratio'), value: metrics.sharpe ?? null },
    { label: t('metric.max_drawdown'), value: pctOrNull(metrics.max_drawdown), unit: '%' },
    { label: t('metric.win_rate'), value: pctOrNull(metrics.win_rate), unit: '%' },
    { label: t('metric.trades'), value: metrics.total_trades ?? null },
    { label: t('metric.profit_factor'), value: metrics.profit_factor ?? null },
  ];
  return <MetricsGrid metrics={tiles} />;
}
