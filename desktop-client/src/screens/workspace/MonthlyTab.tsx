import { MonthlyHeatmap, type MonthlyReturn } from '@/components/primitives';

interface Props {
  data: MonthlyReturn[];
}

export function MonthlyTab({ data }: Props) {
  return (
    <div className="bg-surface-secondary rounded-lg p-3">
      <div className="text-xs text-fg-muted mb-2">Monthly returns (green = profit, red = loss)</div>
      <MonthlyHeatmap data={data} />
    </div>
  );
}
