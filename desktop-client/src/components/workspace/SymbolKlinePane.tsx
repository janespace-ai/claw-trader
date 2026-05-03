import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/stores/appStore';
import { cremote } from '@/services/remote/contract-client';
import { KlineChart, type KlineCandle } from '@/components/charts/KlineChart';
import type { components } from '@/types/api';

type Interval = components['schemas']['Interval'];

const INTERVAL_KEY = 'claw:kline-interval';
const DEFAULT_INTERVAL: Interval = '15m';
const VALID_INTERVALS: Interval[] = ['5m', '15m', '30m', '1h', '4h', '1d'];
/** Visible-bars target.  Roughly fills 800px-wide chart at 8px/bar. */
const KLINE_LIMIT = 100;

/**
 * Workspace center-top zone: persistent K-line of the focused symbol.
 *
 * Workspace-three-zone-layout: this component is fixed-height (420px)
 * and ALWAYS visible regardless of which BOTTOM tab is active.
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

  const [candles, setCandles] = useState<KlineCandle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (!focusedSymbol) {
      setCandles([]);
      return;
    }
    const myReq = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    cremote
      .getKlines({ symbol: focusedSymbol, interval, limit: KLINE_LIMIT })
      .then((rows) => {
        if (myReq !== reqIdRef.current) return; // superseded
        const mapped: KlineCandle[] = rows.map((k) => ({
          time: k.ts,
          open: k.o,
          high: k.h,
          low: k.l,
          close: k.c,
        }));
        setCandles(mapped);
        setLoading(false);
      })
      .catch((err) => {
        if (myReq !== reqIdRef.current) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  }, [focusedSymbol, interval]);

  const last = candles.length ? candles[candles.length - 1] : null;
  const prev = candles.length > 1 ? candles[candles.length - 2] : null;
  const pctChange = useMemo(() => {
    if (!last || !prev || prev.close === 0) return null;
    return ((last.close - prev.close) / prev.close) * 100;
  }, [last, prev]);

  return (
    <div className="flex flex-col" style={{ height: 420 }}>
      {/* Symbol info bar — 72px */}
      <div
        className="px-5 py-4 flex items-center justify-between border-b border-border-subtle"
        style={{ height: 72, flex: '0 0 72px' }}
      >
        <div className="flex items-center gap-5">
          <div className="flex flex-col gap-0.5">
            <span className="font-heading text-[18px] font-bold text-fg-primary">
              {focusedSymbol ?? '—'}
            </span>
            <span className="text-[11px] text-fg-muted">Gate.io · Futures</span>
          </div>
          {last && (
            <div className="flex flex-col items-end gap-0.5">
              <span className="font-mono text-[20px] font-semibold text-fg-primary">
                ${formatPrice(last.close)}
              </span>
              {pctChange != null && (
                <span
                  className={
                    'font-mono text-[12px] ' +
                    (pctChange >= 0 ? 'text-accent-green' : 'text-accent-red')
                  }
                >
                  {pctChange >= 0 ? '+' : ''}
                  {pctChange.toFixed(2)}%
                </span>
              )}
            </div>
          )}
        </div>

        {/* Interval picker */}
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

      {/* K-line area — fills remaining 348px */}
      <div className="flex-1 min-h-0 px-5 py-4">
        <div className="h-full bg-surface-secondary rounded-md p-3">
          {!focusedSymbol ? (
            <EmptyMsg
              text={t('workspace.kline.empty', {
                defaultValue: '选择左侧任意一个币种,看它的 K 线',
              })}
            />
          ) : error ? (
            <EmptyMsg text={error} kind="error" />
          ) : loading && candles.length === 0 ? (
            <EmptyMsg
              text={t('workspace.kline.loading', { defaultValue: '加载 K 线...' })}
            />
          ) : candles.length === 0 ? (
            <EmptyMsg
              text={t('workspace.kline.noData', { defaultValue: '该币种暂无 K 线数据' })}
            />
          ) : (
            <KlineChart candles={candles} height={300} />
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyMsg({ text, kind }: { text: string; kind?: 'error' }) {
  return (
    <div
      className={
        'h-full flex items-center justify-center text-[12px] ' +
        (kind === 'error' ? 'text-accent-red' : 'text-fg-muted')
      }
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
