import { useTranslation } from 'react-i18next';
import type { components } from '@/types/api';

type Interval = components['schemas']['Interval'];

/** Intervals we render as chips, in display order. Must stay a subset
 *  of the generated `Interval` union so backend calls stay type-safe. */
export const TIMEFRAME_CHIPS: readonly Interval[] = [
  '5m',
  '15m',
  '30m',
  '1h',
  '4h',
  '1d',
] as const;

interface Props {
  /** Currently active interval — that chip is highlighted. */
  interval: Interval;
  /** Called when the user picks a different interval. */
  onIntervalChange: (iv: Interval) => void;
  /** Whether the "Indicators" button shows an "active" state, e.g. when
   *  at least one pane indicator is currently selected. */
  indicatorsActive?: boolean;
  /** Called when the user clicks the "Indicators" button — the parent
   *  is expected to open / focus the indicator picker UI. */
  onOpenIndicators?: () => void;
}

/**
 * Gate-style timeframe row (Pencil `TfBar` reusable `LXpUp`).
 *
 * Rendered between the `MarketStrip` (price + 24h stats) and the chart
 * body. Keeps the timeframe chips in a dedicated strip rather than
 * sharing the workspace topbar — this matches how Gate.io organises its
 * chart header and gives the chips enough room to breathe even on
 * narrow windows.
 *
 * Right-hand controls:
 *   - `Indicators` button: opens / focuses the indicator picker.
 *   - Camera icon: screenshot placeholder (no-op today).
 *   - Settings icon: chart settings placeholder (no-op today).
 */
export function TimeframeBar({
  interval,
  onIntervalChange,
  indicatorsActive,
  onOpenIndicators,
}: Props) {
  const { t } = useTranslation();

  return (
    <div
      className="flex items-center gap-1 h-9 px-3 bg-surface-secondary border-b border-border-subtle overflow-x-auto"
      role="toolbar"
      aria-label={t('timeframe.label', { defaultValue: 'Timeframe' })}
    >
      {/* Timeframe chips. Active chip uses surface-tertiary fill +
          fg-primary text at 600 weight — matches Pencil `TfBar` chip
          styling in both dark and light themes via CSS vars. */}
      {TIMEFRAME_CHIPS.map((iv) => {
        const active = iv === interval;
        return (
          <button
            key={iv}
            type="button"
            onClick={() => onIntervalChange(iv)}
            aria-pressed={active}
            className={[
              'font-mono text-[11px] px-2 py-1 rounded-sm transition-colors',
              active
                ? 'bg-surface-tertiary text-fg-primary font-semibold'
                : 'text-fg-muted hover:text-fg-primary',
            ].join(' ')}
          >
            {iv}
          </button>
        );
      })}

      {/* Spacer pushes the right-hand controls to the far edge. */}
      <div className="flex-1" />

      {/* Indicators button — Pencil `TfBar` indicators chip. */}
      <button
        type="button"
        onClick={onOpenIndicators}
        className={[
          'flex items-center gap-1 text-[11px] px-2 py-1 rounded-sm transition-colors',
          indicatorsActive
            ? 'text-accent-primary hover:bg-surface-tertiary'
            : 'text-fg-muted hover:text-fg-primary',
        ].join(' ')}
        aria-label={t('timeframe.indicators', { defaultValue: 'Indicators' })}
      >
        <span aria-hidden>ƒ</span>
        <span>{t('timeframe.indicators', { defaultValue: 'Indicators' })}</span>
      </button>

      {/* Screenshot + settings placeholders. Not wired to anything
          yet — they exist so the strip matches the Pencil design and
          so we have obvious insertion points when those features land. */}
      <button
        type="button"
        disabled
        className="text-[11px] px-1.5 py-1 text-fg-muted opacity-60 cursor-not-allowed"
        aria-label={t('timeframe.screenshot', { defaultValue: 'Screenshot' })}
      >
        <span aria-hidden>◻</span>
      </button>
      <button
        type="button"
        disabled
        className="text-[11px] px-1.5 py-1 text-fg-muted opacity-60 cursor-not-allowed"
        aria-label={t('timeframe.settings', { defaultValue: 'Chart settings' })}
      >
        <span aria-hidden>⚙</span>
      </button>
    </div>
  );
}
