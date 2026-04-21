import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AIPersonaShell,
  ClawChart,
  Watchlist,
  WorkspaceShell,
  type CandlePoint,
  type ChartMarker,
  type WatchlistItem,
} from '@/components/primitives';
import { AIPanel } from '@/components/chat/AIPanel';
import { cremote } from '@/services/remote/contract-client';
import { useScreenerRunStore } from '@/stores/screenerRunStore';
import { useStrategyStore } from '@/stores/strategyStore';
import { ScreenerTopbar } from './screener/ScreenerTopbar';
import { SavedListsOverlay } from './screener/SavedListsOverlay';

/**
 * Screener (chart-first) screen.
 * Pencil frame `bnwnL` (dark) / `iFmHp` (light).
 */
export function ScreenerScreen() {
  const { t } = useTranslation();
  const results = useScreenerRunStore((s) => s.results);
  const focusedSymbol = useScreenerRunStore((s) => s.focusedSymbol);
  const status = useScreenerRunStore((s) => s.status);
  const error = useScreenerRunStore((s) => s.error);
  const focus = useScreenerRunStore((s) => s.focus);
  const run = useScreenerRunStore((s) => s.run);
  const signalsBySymbol = useScreenerRunStore((s) => s.signalsBySymbol);

  const current = useStrategyStore((s) => s.current);
  const strategies = useStrategyStore((s) => s.list);
  const screenerStrategy = useMemo(
    () =>
      (current && current.type === 'screener' && current) ||
      strategies.find((s) => s.type === 'screener'),
    [current, strategies],
  );

  const [interval, setInterval] = useState<'1h' | '4h' | '1d'>('1h');
  const [klines, setKlines] = useState<CandlePoint[]>([]);
  const [savedOpen, setSavedOpen] = useState(false);

  // --- Fetch klines for focused symbol -----------------------------------
  useEffect(() => {
    if (!focusedSymbol) {
      setKlines([]);
      return;
    }
    const to = Math.floor(Date.now() / 1000);
    const from = to - 30 * 24 * 3600;
    let cancelled = false;
    cremote
      .getKlines({ symbol: focusedSymbol, interval, from, to, market: 'futures' })
      .then((rows) => {
        if (cancelled) return;
        setKlines(rows.map((k) => ({ ts: k.ts, o: k.o, h: k.h, l: k.l, c: k.c, v: k.v })));
      })
      .catch(() => {
        if (!cancelled) setKlines([]);
      });
    return () => {
      cancelled = true;
    };
  }, [focusedSymbol, interval]);

  // --- Build watchlist items from results --------------------------------
  // `score` is contract-required as a number but the backend's python
  // runner can omit it when a filter() call blows up out-of-band. Defend
  // against null/undefined/non-number here so the whole screen doesn't
  // crash with a `Cannot read properties of undefined (reading 'toFixed')`.
  const { passed, failed } = useMemo(() => {
    const p: WatchlistItem[] = [];
    const f: WatchlistItem[] = [];
    for (const r of results) {
      const score = typeof r.score === 'number' && Number.isFinite(r.score) ? r.score : 0;
      const item: WatchlistItem = {
        symbol: r.symbol,
        badge: r.rank != null ? `#${r.rank}` : undefined,
        stat: score.toFixed(2),
        statColor:
          score >= 0.8
            ? 'var(--accent-green)'
            : score >= 0.5
              ? 'var(--accent-primary)'
              : score > 0
                ? 'var(--accent-yellow)'
                : 'var(--accent-red)',
        disabled: !r.passed,
      };
      (r.passed ? p : f).push(item);
    }
    return { passed: p, failed: f };
  }, [results]);

  // Chart markers from backend-supplied signals (forward-compat; empty
  // today since the contract doesn't expose signals_per_symbol yet).
  const markers: ChartMarker[] = useMemo(() => {
    if (!focusedSymbol) return [];
    return (signalsBySymbol[focusedSymbol] ?? []).map((s) => ({
      ts: s.ts,
      position: 'belowBar',
      shape: 'circle',
      color: 'var(--accent-yellow)',
      text: '·',
    }));
  }, [signalsBySymbol, focusedSymbol]);

  const handleRun = async () => {
    if (!screenerStrategy) return;
    await run({
      code: screenerStrategy.code,
      strategyId: screenerStrategy.id,
      market: 'futures',
      lookbackDays: 365,
    });
  };

  return (
    <>
      <WorkspaceShell
        topbar={
          <ScreenerTopbar
            strategyName={screenerStrategy?.name ?? null}
            status={status}
            interval={interval}
            onIntervalChange={setInterval}
            onRun={handleRun}
            onOpenSaved={() => setSavedOpen(true)}
          />
        }
        leftRail={
          <div className="p-3 space-y-4">
            <div>
              <div className="text-[10px] uppercase text-fg-muted mb-2 px-2">
                {t('screener.section.passed')} ({passed.length})
              </div>
              <Watchlist
                items={passed}
                focused={focusedSymbol}
                onFocus={focus}
              />
            </div>
            {failed.length > 0 && (
              <details>
                <summary className="text-[10px] uppercase text-fg-muted cursor-pointer px-2">
                  {t('screener.section.failed')} ({failed.length})
                </summary>
                <div className="mt-1">
                  <Watchlist items={failed} focused={focusedSymbol} onFocus={focus} />
                </div>
              </details>
            )}
          </div>
        }
        main={
          <div className="flex flex-col gap-4 p-4">
            {error && <div className="text-xs text-accent-red">{error}</div>}
            {focusedSymbol ? (
              <ClawChart.Candles data={klines} markers={markers} height={380} showVolume />
            ) : (
              <div className="flex-1 grid place-items-center text-fg-muted text-sm border border-border-subtle rounded-lg p-10">
                {status === 'complete'
                  ? t('screener.pick_symbol')
                  : t('screener.run_empty')}
              </div>
            )}
          </div>
        }
        rightRail={
          <AIPersonaShell
            persona="screener"
            context={{ focusedSymbol, status, results: results.length }}
          >
            <div className="flex-1 overflow-hidden">
              <AIPanel />
            </div>
          </AIPersonaShell>
        }
      />
      {savedOpen && <SavedListsOverlay onClose={() => setSavedOpen(false)} />}
    </>
  );
}
