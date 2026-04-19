import { useTranslation } from 'react-i18next';
import { MonthlyHeatmap, type MonthlyReturn } from '@/components/primitives';

interface Props {
  data: MonthlyReturn[];
}

export function MonthlyTab({ data }: Props) {
  const { t } = useTranslation();
  return (
    <div className="bg-surface-secondary rounded-lg p-3">
      <div className="text-xs text-fg-muted mb-2">{t('chart.monthly_returns_legend')}</div>
      <MonthlyHeatmap data={data} />
    </div>
  );
}
