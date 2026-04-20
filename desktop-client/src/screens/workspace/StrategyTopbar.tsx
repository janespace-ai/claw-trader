import { useTranslation } from 'react-i18next';

interface Props {
  onRunPreview: () => void;
  canRunPreview: boolean;
  isRunning: boolean;
}

/**
 * Topbar for the Strategy Design workspace.
 *
 * The symbol picker + timeframe chips that used to live here moved
 * into the Gate-style `MarketStrip` (ticker dropdown) and the
 * `TimeframeBar` (interval chips) which render in the main slot
 * beneath the workspace topbar. This keeps the top-most row focused
 * on the workspace-level primary CTA (`Run Preview`) and leaves the
 * chart's own controls adjacent to the chart — matching the Pencil
 * `Q6cKp` screen layout and Gate.io's trade page organisation.
 */
export function StrategyTopbar({ onRunPreview, canRunPreview, isRunning }: Props) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-end h-full px-4">
      <button
        type="button"
        onClick={onRunPreview}
        disabled={!canRunPreview || isRunning}
        className={[
          'px-3 py-1.5 rounded-md text-xs font-semibold transition-colors',
          canRunPreview && !isRunning
            ? 'bg-accent-primary text-fg-inverse hover:opacity-90'
            : 'bg-surface-tertiary text-fg-muted cursor-not-allowed',
        ].join(' ')}
      >
        {isRunning ? '…' : '✦ ' + t('workspace.design.run_preview')}
      </button>
    </div>
  );
}
