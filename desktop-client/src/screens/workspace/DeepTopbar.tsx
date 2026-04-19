import { useTranslation } from 'react-i18next';
import { ViewModeSwitcher } from '@/components/workspace/ViewModeSwitcher';
import type { ViewMode } from '@/stores/workspaceStore';

interface Props {
  strategyName: string;
  summaryLabel: string;
  onOptimize: () => void;
  isOptimizing: boolean;
  canOptimize: boolean;
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
}

export function DeepTopbar({
  strategyName,
  summaryLabel,
  onOptimize,
  isOptimizing,
  canOptimize,
  viewMode,
  onViewModeChange,
}: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between h-14 px-5 bg-surface-secondary border-b border-border-subtle">
      <div className="flex items-baseline gap-3">
        <span className="font-heading font-semibold text-sm">{strategyName}</span>
        <span className="text-xs text-fg-secondary">{summaryLabel}</span>
      </div>
      <div className="flex items-center gap-2">
        <ViewModeSwitcher viewMode={viewMode} onChange={onViewModeChange} />
        <button
          onClick={onOptimize}
          disabled={isOptimizing || !canOptimize}
          className="px-3 py-1.5 rounded-md bg-accent-primary text-fg-inverse text-xs font-semibold disabled:opacity-50"
          title={canOptimize ? undefined : t('workspace.deep.need_params')}
        >
          {isOptimizing ? t('action.optimizing') : t('action.optimize')}
        </button>
      </div>
    </div>
  );
}
