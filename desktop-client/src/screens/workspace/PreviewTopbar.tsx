import { useTranslation } from 'react-i18next';
import { ViewModeSwitcher } from '@/components/workspace/ViewModeSwitcher';
import type { ViewMode } from '@/stores/workspaceStore';

interface Props {
  symbol: string;
  windowLabel: string;
  signalsTotal: number;
  symbolsTotal: number;
  onConfirmDeep: () => void;
  isRunningDeep: boolean;
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
}

export function PreviewTopbar({
  symbol,
  windowLabel,
  signalsTotal,
  symbolsTotal,
  onConfirmDeep,
  isRunningDeep,
  viewMode,
  onViewModeChange,
}: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between h-14 px-5 bg-surface-secondary border-b border-border-subtle">
      <div className="flex items-baseline gap-3">
        <span className="font-heading font-semibold text-sm">{symbol}</span>
        <span className="text-xs text-fg-secondary">
          {t('workspace.preview.summary', {
            window: windowLabel,
            n: signalsTotal,
            m: symbolsTotal,
          })}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <ViewModeSwitcher viewMode={viewMode} onChange={onViewModeChange} />
        <button
          onClick={onConfirmDeep}
          disabled={isRunningDeep}
          className="px-3 py-1.5 rounded-md bg-accent-primary text-fg-inverse text-xs font-semibold disabled:opacity-50"
        >
          {isRunningDeep ? t('action.running') : t('action.confirm_deep')}
        </button>
      </div>
    </div>
  );
}
