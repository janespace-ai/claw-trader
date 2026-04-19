import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '@/stores/workspaceStore';

const INTERVALS = ['5m', '15m', '30m', '1h', '4h', '1d'] as const;

interface Props {
  symbol: string;
  onSymbolChange: (s: string) => void;
  interval: (typeof INTERVALS)[number];
  onIntervalChange: (iv: (typeof INTERVALS)[number]) => void;
  onRunPreview: () => void;
  canRunPreview: boolean;
  isRunning: boolean;
}

/** Topbar for the Strategy Design workspace.
 *  Indicators (SMA/EMA/BB/RSI) were moved out of this bar and now live
 *  in a `ChartIndicatorBar` rendered beneath the Candles chart, matching
 *  the Pencil layout where the top bar is reserved for symbol/timeframe
 *  + the primary Run Preview CTA.
 */
export function StrategyTopbar({
  symbol,
  onSymbolChange,
  interval,
  onIntervalChange,
  onRunPreview,
  canRunPreview,
  isRunning,
}: Props) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const focused = useWorkspaceStore((s) => s.focusedSymbol) ?? symbol;

  return (
    <div className="flex items-center justify-between h-full px-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className="font-mono text-sm text-fg-primary hover:bg-surface-tertiary rounded-md px-2 py-1"
        >
          {focused} ▾
        </button>
        <div className="flex gap-1">
          {INTERVALS.map((iv) => (
            <button
              key={iv}
              type="button"
              onClick={() => onIntervalChange(iv)}
              className={[
                'text-xs px-2 py-1 rounded',
                iv === interval
                  ? 'bg-surface-tertiary text-fg-primary'
                  : 'text-fg-muted hover:text-fg-primary',
              ].join(' ')}
            >
              {iv}
            </button>
          ))}
        </div>
      </div>

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

      {pickerOpen && (
        <QuickSymbolPicker
          current={focused}
          onPick={(s) => {
            onSymbolChange(s);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

function QuickSymbolPicker({
  current,
  onPick,
  onClose,
}: {
  current: string;
  onPick: (s: string) => void;
  onClose: () => void;
}) {
  // Tiny hardcoded top-N list. Full searchable picker is a future
  // enhancement; this unblocks the design workspace for now.
  const SHORTLIST = ['BTC_USDT', 'ETH_USDT', 'SOL_USDT', 'DOGE_USDT', 'AVAX_USDT'];
  return (
    <div
      className="absolute top-12 left-4 z-10 bg-surface-secondary border border-border-subtle rounded-md shadow-lg p-1 min-w-[140px]"
      onMouseLeave={onClose}
    >
      {SHORTLIST.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onPick(s)}
          className={[
            'w-full text-left px-3 py-1.5 text-xs font-mono rounded hover:bg-surface-tertiary',
            s === current ? 'text-accent-primary' : 'text-fg-primary',
          ].join(' ')}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
