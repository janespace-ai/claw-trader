import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/stores/appStore';
import { cremote } from '@/services/remote/contract-client';
import {
  KlineChart,
  type KlineCandle,
  type LoadBarsRequest,
  type LoadBarsResult,
} from '@/components/charts/KlineChart';
import { IndicatorBar } from '@/components/charts/IndicatorBar';
import type { components } from '@/types/api';

type Interval = components['schemas']['Interval'];

const INTERVAL_KEY = 'claw:kline-interval';
const DEFAULT_INTERVAL: Interval = '15m';
const VALID_INTERVALS: Interval[] = ['5m', '15m', '30m', '1h', '4h', '1d'];
/** Bars per fetch.  KlineChart's own pan-left detector requests
 *  additional pages as needed, so initial 200 is plenty. */
const PAGE_LIMIT = 200;
/** Stats fetch — always 5m × 288 = 24h, independent of chart interval. */
const STATS_INTERVAL: Interval = '5m';
const STATS_LIMIT = 288;

/**
 * Workspace center-top zone: persistent K-line of the focused symbol.
 *
 * Workspace-three-zone-layout: this component is always visible
 * regardless of which BOTTOM tab is active.  Height grows with the
 * number of indicator subcharts (capped at 6 in
 * useChartIndicatorsStore).
 *
 * Pencil reference: `A7ubw` center top + symbol info bar.
 */
export function SymbolKlinePane() {
  const { t } = useTranslation();
  const focusedSymbol = useAppStore((s) => s.focusedSymbol);

  const [interval, setIntervalState] = useState<Interval>(() => {
    if (typeof localStorage === 'undefined') return DEFAULT_INTERVAL;
    const stored = localStorage.getItem(INTERVAL_KEY);
    if (stored && (VALID_INTERVALS as string[]).includes(stored)) {
      return stored as Interval;
    }
    return DEFAULT_INTERVAL;
  });

  const setInterval = (i: Interval) => {
    setIntervalState(i);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(INTERVAL_KEY, i);
      } catch {
        // best-effort
      }
    }
  };

  // Stats candles: fixed 24h of 5m bars, used to derive the info-bar
  // last/pct/24h-high/low.  Independent of the chart's own data flow.
  const [statsCandles, setStatsCandles] = useState<KlineCandle[]>([]);
  const statsReqRef = useRef(0);
  useEffect(() => {
    if (!focusedSymbol) {
      setStatsCandles([]);
      return;
    }
    const myReq = ++statsReqRef.current;
    cremote
      .getKlines({
        symbol: focusedSymbol,
        interval: STATS_INTERVAL,
        limit: STATS_LIMIT,
      })
      .then((rows) => {
        if (myReq !== statsReqRef.current) return;
        setStatsCandles(
          rows.map((k) => ({
            time: k.ts,
            open: k.o,
            high: k.h,
            low: k.l,
            close: k.c,
            volume: k.v,
          })),
        );
      })
      .catch(() => {
        if (myReq !== statsReqRef.current) return;
        setStatsCandles([]);
      });
  }, [focusedSymbol]);

  const last = statsCandles.length ? statsCandles[statsCandles.length - 1] : null;
  const prev = statsCandles.length > 1 ? statsCandles[statsCandles.length - 2] : null;
  const pctChange = useMemo(() => {
    if (!last || !prev || prev.close === 0) return null;
    return ((last.close - prev.close) / prev.close) * 100;
  }, [last, prev]);

  const stats24h = useMemo(() => {
    if (statsCandles.length === 0) return null;
    let hi = statsCandles[0].high;
    let lo = statsCandles[0].low;
    for (const c of statsCandles) {
      if (c.high > hi) hi = c.high;
      if (c.low < lo) lo = c.low;
    }
    return { high: hi, low: lo };
  }, [statsCandles]);

  // SymbolMetadata for 24h quote-vol (server pre-aggregates).
  const [metadata, setMetadata] = useState<{
    volume_24h_quote: number | null;
  } | null>(null);
  const metaReqRef = useRef(0);
  useEffect(() => {
    if (!focusedSymbol) {
      setMetadata(null);
      return;
    }
    const myReq = ++metaReqRef.current;
    const timer = setTimeout(() => {
      cremote
        .getSymbolMetadata({ symbol: focusedSymbol })
        .then((m) => {
          if (myReq !== metaReqRef.current) return;
          setMetadata({ volume_24h_quote: m.volume_24h_quote ?? null });
        })
        .catch(() => {
          if (myReq !== metaReqRef.current) return;
          setMetadata({ volume_24h_quote: null });
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [focusedSymbol]);

  // KlineChart loadBars callback — paginated history via the kline API.
  //
  // ALWAYS sends BOTH `from` and `to` explicitly so we don't depend on
  // any backend default-window behavior (the deployed Go handler
  // historically defaulted `from = now - 30 days` when empty, which
  // silently killed pagination once the user panned past 30 days back).
  //
  //   init     → to = now()
  //              from = to - PAGE_LIMIT × interval_seconds × 3
  //   backward → to = oldest_loaded_ts - 1
  //              from = to - PAGE_LIMIT × interval_seconds × 3
  //
  // The 3× buffer covers brief data gaps (a busted 5m bar here and
  // there) without overshooting — for 5m × 200 × 3 that's about 50
  // hours, plenty for 200 bars.  Backend's `limit` slice trims to
  // exactly PAGE_LIMIT.
  const loadBars = useCallback(
    async (req: LoadBarsRequest): Promise<LoadBarsResult> => {
      const nowSec = Math.floor(Date.now() / 1000);
      const to =
        req.type === 'backward' && req.timestamp != null
          ? req.timestamp - 1
          : nowSec;
      const intervalSec = intervalSeconds(req.interval);
      const from = to - PAGE_LIMIT * intervalSec * 3;
      const params: {
        symbol: string;
        interval: Interval;
        limit: number;
        from: number;
        to: number;
      } = {
        symbol: req.symbol,
        interval: req.interval as Interval,
        limit: PAGE_LIMIT,
        from,
        to,
      };
      const rows = await cremote.getKlines(params);
      return {
        bars: rows.map((k) => ({
          time: k.ts,
          open: k.o,
          high: k.h,
          low: k.l,
          close: k.c,
          volume: k.v,
        })),
        // Stop ONLY on an empty page.  A short page (e.g. 150 bars
        // when limit=200) might happen near the data boundary but
        // there could still be older rows in the next page —
        // historically this was `>= PAGE_LIMIT` and prematurely
        // killed pagination at any short response.  Now we keep
        // asking until the backend genuinely returns nothing.
        hasMoreBackward: rows.length > 0,
      };
    },
    [],
  );

  return (
    <div className="flex flex-col">
      {/* Symbol info bar — 48px hard single line.  Pencil `sFW5d`.
          Drops the Gate.io/Futures sublabel and the per-bar pct
          beneath the price; pct → inline pill next to the price. */}
      <div
        className="px-4 h-12 flex items-center justify-between gap-4 border-b border-border-subtle"
        style={{ flex: '0 0 auto' }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="font-heading text-[15px] font-bold text-fg-primary whitespace-nowrap">
            {focusedSymbol ?? '—'}
          </span>
          {last && (
            <span className="font-mono text-[17px] font-semibold text-fg-primary whitespace-nowrap">
              ${formatPrice(last.close)}
            </span>
          )}
          {pctChange != null && (
            <span
              className={
                'inline-flex items-center px-1.5 py-px rounded-sm ' +
                'font-mono text-[11px] font-semibold whitespace-nowrap ' +
                (pctChange >= 0
                  ? 'bg-[color:var(--accent-green-dim)] text-accent-green'
                  : 'bg-[color:var(--accent-red-dim)] text-accent-red')
              }
            >
              {pctChange >= 0 ? '+' : ''}
              {pctChange.toFixed(2)}%
            </span>
          )}
          <span
            aria-hidden
            className="inline-block w-px h-[18px] bg-border-subtle mx-1.5"
          />
          {/* 24h stats — gate-style label/value pairs, all inline. */}
          <div className="flex items-center gap-3.5 text-[11px] leading-tight whitespace-nowrap font-mono">
            <Stat label="H" value={stats24h ? formatPrice(stats24h.high) : '—'} />
            <Stat label="L" value={stats24h ? formatPrice(stats24h.low) : '—'} />
            <Stat
              label="Vol"
              value={
                metadata?.volume_24h_quote != null
                  ? `$${formatCompact(metadata.volume_24h_quote)}`
                  : '—'
              }
            />
            <Stat label={t('workspace.kline.bars', { defaultValue: 'Bars' })} value={String(statsCandles.length)} />
          </div>
        </div>

        {/* Right cluster: interval picker only.  Indicator picker
            now lives BELOW the chart in IndicatorBar (per UX revision
            2026-05-03 — Pencil frame `JHpLq`). */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1">
            {VALID_INTERVALS.map((iv) => (
              <button
                key={iv}
                onClick={() => setInterval(iv)}
                className={
                  'px-2 py-1 rounded-sm text-[11px] font-mono transition-colors ' +
                  (iv === interval
                    ? 'bg-[color:var(--accent-primary-dim)] text-fg-primary font-semibold'
                    : 'bg-surface-tertiary text-fg-secondary hover:text-fg-primary')
                }
              >
                {iv}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* K-line — height is managed by KlineChart itself (sum of
          pane heights so subchart additions GROW the container
          rather than compressing the main pane). */}
      <div className="bg-surface-secondary">
        {!focusedSymbol ? (
          <EmptyMsg
            text={t('workspace.kline.empty', {
              defaultValue: '选择左侧任意一个币种,看它的 K 线',
            })}
            height={380}
          />
        ) : (
          <KlineChart
            symbol={focusedSymbol}
            interval={interval}
            loadBars={loadBars}
          />
        )}
      </div>

      {/* Gate-style indicator bar — chips for active indicators
          (each with × to remove) + "+ 指标" trigger. */}
      <IndicatorBar />
    </div>
  );
}

function EmptyMsg({ text, height }: { text: string; height: number }) {
  return (
    <div
      className="flex items-center justify-center text-[12px] text-fg-muted bg-surface-secondary rounded-md"
      style={{ height }}
    >
      {text}
    </div>
  );
}

function formatPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(2);
  if (p >= 0.01) return p.toFixed(4);
  return p.toFixed(6);
}

function formatCompact(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(0);
}

/**
 * Convert one of our supported intervals to seconds.  Used to size
 * the explicit `from` window in `loadBars` so we never depend on
 * backend default-window behavior.
 */
function intervalSeconds(iv: string): number {
  switch (iv) {
    case '5m':
      return 5 * 60;
    case '15m':
      return 15 * 60;
    case '30m':
      return 30 * 60;
    case '1h':
      return 60 * 60;
    case '4h':
      return 4 * 60 * 60;
    case '1d':
      return 24 * 60 * 60;
    default:
      return 5 * 60; // safest fallback (smallest interval we support)
  }
}

/**
 * 24h stat: tiny label + mono value pair.  Used 4× in the top bar.
 * Pencil reference: stat_group children inside frame `sFW5d`.
 */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-[10px] font-semibold text-fg-muted">{label}</span>
      <span className="text-[12px] font-medium text-fg-secondary">{value}</span>
    </span>
  );
}
