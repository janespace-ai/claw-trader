import { useEffect, useMemo, useState } from 'react';
import {
  AIPersonaShell,
  ClawChart,
  WorkspaceShell,
  type CandlePoint,
  type ChartMarker,
  type EquityPoint,
} from '@/components/primitives';
import { TradesTab } from '@/components/workspace/TradesTab';
import { TradeAnalysisCard } from '@/components/symbol/TradeAnalysisCard';
import { cremote } from '@/services/remote/contract-client';
import { useAppStore } from '@/stores/appStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { components } from '@/types/api';
import type { AppRoute } from '@/types/navigation';

type SymbolMetadata = components['schemas']['SymbolMetadata'];
type BacktestResult = components['schemas']['BacktestResult'];
type Trade = components['schemas']['Trade'];

interface Props {
  symbol: string;
  returnTo: AppRoute;
  backtestTaskId?: string;
}

/**
 * Symbol Detail drill-down screen.
 * Pencil frame `s9ooT` (dark) / `Aib9J` (light).
 */
export function SymbolDetailScreen({ symbol, returnTo, backtestTaskId }: Props) {
  const navigate = useAppStore((s) => s.navigate);
  const focusedTradeId = useWorkspaceStore((s) => s.focusedTradeId);
  const focusTrade = useWorkspaceStore((s) => s.focusTrade);

  const [metadata, setMetadata] = useState<SymbolMetadata | null>(null);
  const [klines, setKlines] = useState<CandlePoint[]>([]);
  const [result, setResult] = useState<BacktestResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    cremote
      .getSymbolMetadata({ symbol })
      .then((m) => {
        if (!cancelled) setMetadata(m);
      })
      .catch(() => {
        if (!cancelled) setMetadata(null);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  useEffect(() => {
    const to = Math.floor(Date.now() / 1000);
    const from = to - 90 * 24 * 3600;
    let cancelled = false;
    cremote
      .getKlines({ symbol, interval: '1h', from, to, market: 'futures' })
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
  }, [symbol]);

  useEffect(() => {
    if (!backtestTaskId) {
      setResult(null);
      return;
    }
    let cancelled = false;
    cremote
      .getBacktestResult({ task_id: backtestTaskId })
      .then((task) => {
        if (!cancelled) setResult((task.result as BacktestResult | undefined) ?? null);
      })
      .catch(() => {
        if (!cancelled) setResult(null);
      });
    return () => {
      cancelled = true;
    };
  }, [backtestTaskId]);

  const tradesForSymbol: Trade[] = useMemo(() => {
    return (result?.trades ?? []).filter((t) => t.symbol === symbol);
  }, [result, symbol]);

  const markers: ChartMarker[] = useMemo(() => {
    return tradesForSymbol.flatMap((t) => {
      const m: ChartMarker[] = [
        {
          ts: t.entry_ts,
          position: t.side === 'long' ? 'belowBar' : 'aboveBar',
          shape: t.side === 'long' ? 'arrowUp' : 'arrowDown',
          text: t.side === 'long' ? 'L' : 'S',
        },
      ];
      if (t.exit_ts != null) {
        m.push({
          ts: t.exit_ts,
          position: 'aboveBar',
          shape: 'circle',
          text: (t.pnl_pct ?? 0) >= 0 ? '+' : '-',
        });
      }
      return m;
    });
  }, [tradesForSymbol]);

  // Synthesize a per-symbol equity series by compounding trade PnL.
  const equityCurve: EquityPoint[] = useMemo(() => {
    let cum = 1;
    const sorted = [...tradesForSymbol].sort(
      (a, b) => (a.exit_ts ?? a.entry_ts) - (b.exit_ts ?? b.entry_ts),
    );
    return sorted.map((t) => {
      cum = cum * (1 + (t.pnl_pct ?? 0));
      return { ts: t.exit_ts ?? t.entry_ts, value: cum };
    });
  }, [tradesForSymbol]);

  const totalReturn = equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].value - 1 : 0;

  return (
    <WorkspaceShell
      topbar={
        <div className="flex items-center justify-between h-14 px-5 bg-surface-secondary border-b border-border-subtle">
          <div className="flex items-baseline gap-3">
            <button
              onClick={() => navigate(returnTo)}
              className="text-xs text-accent-primary hover:underline"
            >
              ← Back
            </button>
            <span className="font-heading font-semibold text-sm">{symbol}</span>
            {metadata?.name && (
              <span className="text-xs text-fg-muted">{metadata.name}</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            {metadata?.last_price != null && (
              <span className="px-2 py-0.5 rounded-full bg-surface-tertiary font-mono">
                ${metadata.last_price.toFixed(2)}
              </span>
            )}
            {metadata?.change_24h_pct != null && (
              <span
                className={
                  'px-2 py-0.5 rounded-full font-mono ' +
                  (metadata.change_24h_pct >= 0
                    ? 'bg-[color:var(--accent-green-dim)] text-accent-green'
                    : 'bg-[color:var(--accent-red-dim)] text-accent-red')
                }
              >
                {metadata.change_24h_pct >= 0 ? '+' : ''}
                {(metadata.change_24h_pct * 100).toFixed(2)}%
              </span>
            )}
            {metadata?.rank != null && (
              <span className="px-2 py-0.5 rounded-full bg-surface-tertiary text-fg-muted">
                #{metadata.rank}
              </span>
            )}
          </div>
        </div>
      }
      main={
        <div className="flex flex-col gap-4 p-4">
          <div>
            <div className="text-[10px] uppercase text-fg-muted mb-1">Price & Signals</div>
            <ClawChart.Candles data={klines} markers={markers} height={320} showVolume />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
            <div>
              <div className="text-[10px] uppercase text-fg-muted mb-1">Trade journal</div>
              <TradesTab
                trades={tradesForSymbol}
                selectedSymbol={symbol}
                onRowClick={(t) => focusTrade(t.id)}
              />
            </div>
            <div className="space-y-3">
              <div className="bg-surface-secondary rounded-lg p-3">
                <div className="text-[10px] uppercase text-fg-muted">Symbol equity</div>
                <div className="text-sm font-mono">
                  {equityCurve.length === 0 ? '—' : (totalReturn >= 0 ? '+' : '') + (totalReturn * 100).toFixed(2) + '%'}
                </div>
                {equityCurve.length > 0 && (
                  <ClawChart.Mini
                    data={equityCurve.map((p) => ({ ts: p.ts, value: p.value }))}
                    height={48}
                  />
                )}
              </div>
              <div className="bg-surface-secondary rounded-lg p-3">
                <div className="text-[10px] uppercase text-fg-muted">Trades</div>
                <div className="text-sm font-mono">{tradesForSymbol.length}</div>
                <div className="text-[11px] text-fg-muted">
                  {tradesForSymbol.filter((t) => (t.pnl_pct ?? 0) > 0).length} winners
                </div>
              </div>
            </div>
          </div>
        </div>
      }
      rightRail={
        <AIPersonaShell persona="trade-analysis" context={{ symbol, tradeId: focusedTradeId }}>
          <div className="flex-1 overflow-y-auto">
            <TradeAnalysisCard
              tradeId={focusedTradeId}
              backtestTaskId={backtestTaskId ?? null}
              symbol={symbol}
            />
          </div>
        </AIPersonaShell>
      }
    />
  );
}
