/** Indicator identifiers. The split between "overlay" (drawn on the
 *  price chart) and "pane" (its own strip below) is still meaningful
 *  to the screen that renders them, but the chip bar itself puts them
 *  all in a single row à la Gate — less visual noise, more space. */
export type OverlayIndicatorId = 'SMA20' | 'SMA50' | 'SMA200' | 'EMA12' | 'EMA26' | 'BB' | 'VWAP' | 'DONCHIAN';
export type PaneIndicatorId = 'RSI' | 'MACD' | 'STOCH' | 'ATR' | 'OBV';
export type IndicatorId = OverlayIndicatorId | PaneIndicatorId;

/** Display order: overlays first (by complexity), then panes. Chosen
 *  to roughly match Gate's bar order so users coming from there find
 *  the layout familiar. */
const ALL_INDICATORS: IndicatorId[] = [
  'SMA20', 'SMA50', 'SMA200', 'EMA12', 'EMA26', 'BB', 'VWAP', 'DONCHIAN',
  'RSI', 'MACD', 'STOCH', 'ATR', 'OBV',
];

interface Props {
  selected: IndicatorId[];
  onToggle: (id: IndicatorId) => void;
}

/**
 * Single-row indicator-toggle bar rendered **below** the Candles chart,
 * mirroring Gate's compact chip strip (no categorical labels, no row
 * grouping). Overflows wrap onto additional lines only when the
 * window is too narrow to fit all chips in one row.
 */
export function ChartIndicatorBar({ selected, onToggle }: Props) {
  return (
    <div className="flex items-center gap-2 flex-wrap text-[11px] px-1">
      {ALL_INDICATORS.map((id) => {
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
      })}
    </div>
  );
}
