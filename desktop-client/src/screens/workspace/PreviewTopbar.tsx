import { useTranslation } from 'react-i18next';

interface Props {
  symbol: string;
  windowLabel: string;
  signalsTotal: number;
  symbolsTotal: number;
  onConfirmDeep: () => void;
  isRunningDeep: boolean;
}

export function PreviewTopbar({
  symbol,
  windowLabel,
  signalsTotal,
  symbolsTotal,
  onConfirmDeep,
  isRunningDeep,
}: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between h-14 px-5 bg-surface-secondary border-b border-border-subtle">
      <div className="flex items-baseline gap-3">
        <span className="font-heading font-semibold text-sm">{symbol}</span>
        <span className="text-xs text-fg-secondary">
          {t('workspace.previewSummary', {
            defaultValue: 'Preview backtest — {{window}} • {{n}} signals across {{m}} symbols',
            window: windowLabel,
            n: signalsTotal,
            m: symbolsTotal,
          })}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onConfirmDeep}
          disabled={isRunningDeep}
          className="px-3 py-1.5 rounded-md bg-accent-primary text-fg-inverse text-xs font-semibold disabled:opacity-50"
        >
          {isRunningDeep ? t('action.running', { defaultValue: 'Running…' }) : t('workspace.confirmDeep', { defaultValue: 'Confirm + Run Deep' })}
        </button>
      </div>
    </div>
  );
}
