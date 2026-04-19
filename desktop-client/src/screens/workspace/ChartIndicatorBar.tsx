import { useTranslation } from 'react-i18next';

/** Indicator identifiers. Split into two groups so the bar can render
 *  overlays on one row and pane-indicators on the next. */
export type OverlayIndicatorId = 'SMA20' | 'SMA50' | 'SMA200' | 'EMA12' | 'EMA26' | 'BB' | 'VWAP' | 'DONCHIAN';
export type PaneIndicatorId = 'RSI' | 'MACD' | 'STOCH' | 'ATR' | 'OBV';
export type IndicatorId = OverlayIndicatorId | PaneIndicatorId;

export const OVERLAY_INDICATORS: OverlayIndicatorId[] = [
  'SMA20',
  'SMA50',
  'SMA200',
  'EMA12',
  'EMA26',
  'BB',
  'VWAP',
  'DONCHIAN',
];

export const PANE_INDICATORS: PaneIndicatorId[] = [
  'RSI',
  'MACD',
  'STOCH',
  'ATR',
  'OBV',
];

interface Props {
  selected: IndicatorId[];
  onToggle: (id: IndicatorId) => void;
}

/**
 * Row of indicator-toggle chips rendered **below** the Candles chart
 * (per Pencil layout — the top bar only holds symbol + timeframe).
 * Grouped into two rows: "Overlays" (drawn on the price chart) and
 * "Panes" (rendered as separate strips beneath the price chart).
 */
export function ChartIndicatorBar({ selected, onToggle }: Props) {
  const { t } = useTranslation();
  const renderChip = (id: IndicatorId) => {
    const on = selected.includes(id);
    return (
      <button
        key={id}
        type="button"
        onClick={() => onToggle(id)}
        className={[
          'px-2 py-1 rounded font-mono text-[11px] transition-colors',
          on
            ? 'bg-accent-primary-dim text-accent-primary'
            : 'text-fg-muted hover:text-fg-primary hover:bg-surface-tertiary',
        ].join(' ')}
        aria-pressed={on}
      >
        {id}
      </button>
    );
  };
  return (
    <div className="space-y-1 text-[11px] px-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-fg-muted uppercase w-20">
          {t('chart.indicators_overlay', { defaultValue: 'Overlay' })}
        </span>
        {OVERLAY_INDICATORS.map(renderChip)}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-fg-muted uppercase w-20">
          {t('chart.indicators_pane', { defaultValue: 'Pane' })}
        </span>
        {PANE_INDICATORS.map(renderChip)}
      </div>
    </div>
  );
}
