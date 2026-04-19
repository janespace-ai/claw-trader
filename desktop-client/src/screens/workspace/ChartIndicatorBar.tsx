import { useTranslation } from 'react-i18next';

export type IndicatorId = 'SMA' | 'EMA' | 'BB' | 'RSI';

const INDICATORS: IndicatorId[] = ['SMA', 'EMA', 'BB', 'RSI'];

interface Props {
  selected: IndicatorId[];
  onToggle: (id: IndicatorId) => void;
}

/**
 * Row of indicator-toggle chips rendered **below** the Candles chart
 * (per Pencil layout — the top bar only holds symbol + timeframe).
 * Selecting a chip adds the indicator as an overlay (SMA / EMA / BB)
 * or a separate pane (RSI, rendered beneath the price chart).
 */
export function ChartIndicatorBar({ selected, onToggle }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 text-[11px] px-1">
      <span className="text-fg-muted uppercase">
        {t('chart.indicators', { defaultValue: 'Indicators' })}
      </span>
      {INDICATORS.map((ind) => {
        const on = selected.includes(ind);
        return (
          <button
            key={ind}
            type="button"
            onClick={() => onToggle(ind)}
            className={[
              'px-2 py-1 rounded font-mono transition-colors',
              on
                ? 'bg-accent-primary-dim text-accent-primary'
                : 'text-fg-muted hover:text-fg-primary hover:bg-surface-tertiary',
            ].join(' ')}
            aria-pressed={on}
          >
            {ind}
          </button>
        );
      })}
    </div>
  );
}
