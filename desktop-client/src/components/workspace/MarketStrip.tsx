import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { components } from '@/types/api';
import { SymbolPicker } from './SymbolPicker';

type SymbolMetadata = components['schemas']['SymbolMetadata'];
type Kline = { ts: number; o: number; h: number; l: number; c: number; v?: number };

export interface RollingWindowStats {
  high: number | null;
  low: number | null;
  /** Base-currency volume (sum of kline.v over the window). */
  volumeBase: number | null;
}

/**
 * Derive 24-hour high / low / base-volume from a rolling window of
 * klines. The backend's `SymbolMetadata` exposes `volume_24h_quote`
 * but not the other three, so the frontend computes them from the
 * candles that are already on hand — no extra API calls.
 *
 * The window is defined as "all candles whose ts is within the last
 * 24 hours"; if the loaded data doesn't cover a full day, we use
 * whatever we have (values are still correct for the loaded range).
 */
export function computeRollingStats(klines: Kline[]): RollingWindowStats {
  if (klines.length === 0) {
    return { high: null, low: null, volumeBase: null };
  }
  const lastTs = klines[klines.length - 1].ts;
  const cutoff = lastTs - 24 * 3600;
  let high = -Infinity;
  let low = Infinity;
  let volumeBase = 0;
  for (let i = klines.length - 1; i >= 0; i--) {
    const k = klines[i];
    if (k.ts < cutoff) break;
    if (k.h > high) high = k.h;
    if (k.l < low) low = k.l;
    if (k.v != null) volumeBase += k.v;
  }
  return {
    high: Number.isFinite(high) ? high : null,
    low: Number.isFinite(low) ? low : null,
    volumeBase: volumeBase > 0 ? volumeBase : null,
  };
}

interface Props {
  /** Full symbol metadata from `cremote.getSymbolMetadata`. */
  metadata: SymbolMetadata | null;
  /** Fallback ticker when metadata hasn't loaded yet. */
  symbol: string;
  /** Called when the user picks a new symbol from the dropdown. */
  onSymbolChange?: (symbol: string) => void;
  /** Whether the symbol is in the favourites set (drives the star). */
  isFavorite?: boolean;
  /** Called when the user toggles the favourite star. */
  onToggleFavorite?: () => void;
  /** Derived 24h stats computed from klines by the parent screen. */
  rollingStats?: RollingWindowStats;
  /** Base currency ticker shown in the volume label (e.g. "BTC"). */
  baseCurrency?: string;
}

/**
 * Gate-style market info strip rendered between the workspace TopBar
 * and the candle chart. Shows price + 24h change on the left, then a
 * row of {label, value} stat chips (high, low, volumes, max leverage,
 * funding rate, mark/index price).
 *
 * Fields that aren't currently provided by the backend's
 * `SymbolMetadata` (e.g. 24h high/low, leverage, funding rate) render
 * as "—" so the layout stays consistent; they light up once the
 * backend contract grows to include them.
 */
export function MarketStrip({
  metadata,
  symbol,
  onSymbolChange,
  isFavorite,
  onToggleFavorite,
  rollingStats,
  baseCurrency,
}: Props) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const tickerBtnRef = useRef<HTMLButtonElement | null>(null);
  const [pickerAnchor, setPickerAnchor] = useState<{ top: number; left: number } | null>(null);
  const ticker = metadata?.symbol ?? symbol;
  const displayName = metadata?.name;
  const price = metadata?.last_price;
  const changePct = metadata?.change_24h_pct;
  const high24h = rollingStats?.high ?? null;
  const low24h = rollingStats?.low ?? null;
  const volumeBase = rollingStats?.volumeBase ?? null;

  // Color the price + change based on sign — positive green, negative
  // red, unknown muted.
  const tone = (() => {
    if (changePct == null) return 'text-fg-primary';
    if (changePct > 0) return 'text-accent-green';
    if (changePct < 0) return 'text-accent-red';
    return 'text-fg-primary';
  })();

  const stats: Array<{ label: string; value: string; valueClass?: string }> = [
    {
      label: t('market.high_24h'),
      value: high24h != null ? fmtPrice(high24h) : '—',
    },
    {
      label: t('market.low_24h'),
      value: low24h != null ? fmtPrice(low24h) : '—',
    },
    {
      label: t('market.volume_24h', { unit: baseCurrency ?? 'base' }),
      value: volumeBase != null ? fmtCompact(volumeBase) : '—',
    },
    {
      label: t('market.volume_24h_quote'),
      value: fmtCompact(metadata?.volume_24h_quote),
    },
    {
      label: t('market.max_leverage'),
      value: '—',
      valueClass: 'text-accent-yellow font-semibold',
    },
    {
      label: t('market.funding_rate'),
      value: '—',
    },
    {
      label: t('market.mark_price'),
      value: '—',
    },
    {
      label: t('market.index_price'),
      value: '—',
    },
  ];

  return (
    <div
      className="flex items-center gap-5 h-[60px] px-4 bg-surface-primary border-b border-border-subtle overflow-x-auto"
      aria-label={t('market.strip_label', { symbol: ticker })}
    >
      {/* Favourite star — matches Pencil MktStrip `UEHjX`. Rendered as
          a button so keyboard users can toggle with Enter/Space. The
          glyph flips ☆ → ★ and colors up in accent-yellow when set. */}
      <button
        type="button"
        onClick={onToggleFavorite}
        aria-pressed={!!isFavorite}
        aria-label={
          isFavorite
            ? t('market.unfavorite', { defaultValue: 'Remove from favorites' })
            : t('market.favorite', { defaultValue: 'Add to favorites' })
        }
        className={[
          'shrink-0 text-[15px] leading-none transition-colors',
          isFavorite
            ? 'text-accent-yellow'
            : 'text-fg-muted hover:text-fg-primary',
        ].join(' ')}
      >
        {isFavorite ? '★' : '☆'}
      </button>

      {/* Symbol block — ticker becomes a dropdown trigger (Pencil
          MktStrip ticker column `cY9KB` + chevron `RbOua`). */}
      <div className="flex flex-col gap-0.5 shrink-0">
        <button
          ref={tickerBtnRef}
          type="button"
          onClick={() => {
            const r = tickerBtnRef.current?.getBoundingClientRect();
            if (r) setPickerAnchor({ top: r.bottom + 4, left: r.left });
            setPickerOpen((v) => !v);
          }}
          disabled={!onSymbolChange}
          className={[
            'flex items-center gap-1 font-mono text-[15px] font-bold text-fg-primary',
            onSymbolChange ? 'hover:text-accent-primary' : 'cursor-default',
          ].join(' ')}
          aria-haspopup="listbox"
          aria-expanded={pickerOpen}
        >
          <span>{formatTicker(ticker)}</span>
          {onSymbolChange && (
            <span className="text-[10px] text-fg-muted" aria-hidden>
              ▾
            </span>
          )}
        </button>
        <span className="text-[10px] text-fg-muted">{displayName ?? ticker}</span>
      </div>

      {pickerOpen && onSymbolChange && (
        <SymbolPicker
          current={ticker}
          anchor={pickerAnchor ?? undefined}
          onPick={(s) => {
            onSymbolChange(s);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      <div className="w-px h-7 bg-border-subtle" />

      {/* Price + change */}
      <div className="flex flex-col gap-0.5 shrink-0">
        <span className={`font-mono text-[18px] font-bold ${tone}`}>
          {price != null ? fmtPrice(price) : '—'}
        </span>
        <div className="flex items-center gap-1.5">
          <span className={`font-mono text-[11px] ${tone}`}>
            {changePct != null ? fmtSigned(price != null && changePct != null ? price * changePct : null) : '—'}
          </span>
          <span className={`font-mono text-[11px] ${tone}`}>
            {changePct != null ? fmtPct(changePct) : '—'}
          </span>
        </div>
      </div>

      <div className="w-px h-7 bg-border-subtle" />

      {/* Stats row */}
      <div className="flex items-center gap-5 shrink-0">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-1">
            <span className="text-[10px] text-fg-muted">{s.label}</span>
            <span className={`font-mono text-[12px] ${s.valueClass ?? 'text-fg-primary'}`}>
              {s.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- formatters -----------------------------------------------------------

function formatTicker(s: string): string {
  // Convert "BTC_USDT" → "BTC/USDT" (Gate-style display)
  return s.includes('_') ? s.replace('_', '/') : s;
}

function fmtPrice(v: number): string {
  // Adaptive decimals: big numbers use 2, small (< 1) show more precision.
  const digits = Math.abs(v) >= 100 ? 2 : Math.abs(v) >= 1 ? 4 : 6;
  return v.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtSigned(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const sign = v > 0 ? '+' : '';
  return sign + fmtPrice(v);
}

function fmtPct(v: number): string {
  const sign = v > 0 ? '+' : '';
  return `${sign}${(v * 100).toFixed(2)}%`;
}

/** Format a big USDT amount as "307.04M" / "1.23B" etc. */
function fmtCompact(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(2) + 'K';
  return v.toFixed(2);
}
