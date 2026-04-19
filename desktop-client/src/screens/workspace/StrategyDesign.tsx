import { useCallback, useEffect, useState } from 'react';
import {
  AIPersonaShell,
  ClawChart,
  WorkspaceShell,
  type CandlePoint,
} from '@/components/primitives';
import { cremote, toErrorBody } from '@/services/remote/contract-client';
import { useAppStore } from '@/stores/appStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useWorkspaceDraftStore } from '@/stores/workspaceDraftStore';
import { StrategyTopbar } from './StrategyTopbar';
import { StrategyDraftCard } from './StrategyDraftCard';
import { RunPreviewCard } from './RunPreviewCard';
import { AIPanel } from '@/components/chat/AIPanel';

type Interval = '5m' | '15m' | '30m' | '1h' | '4h' | '1d';

/**
 * Workspace — Strategy Design screen.
 * Pencil frame `Q6cKp` (dark) / `MZuaq` (light).
 */
export function StrategyDesign() {
  const focusedSymbol =
    useWorkspaceStore((s) => s.focusedSymbol) ?? 'BTC_USDT';
  const setFocus = useWorkspaceStore((s) => s.focus);
  const currentStrategyId = useWorkspaceStore((s) => s.currentStrategyId);
  const enterPreview = useWorkspaceStore((s) => s.enterPreview);
  const navigate = useAppStore((s) => s.navigate);

  const [interval, setInterval] = useState<Interval>('1h');
  const [indicators, setIndicators] = useState<string[]>([]);
  const [klines, setKlines] = useState<CandlePoint[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // --- Chart data ----------------------------------------------------------
  useEffect(() => {
    const to = Math.floor(Date.now() / 1000);
    const from = to - 30 * 24 * 3600;
    let cancelled = false;
    cremote
      .getKlines({
        symbol: focusedSymbol,
        interval,
        from,
        to,
        market: 'futures',
      })
      .then((rows) => {
        if (cancelled) return;
        setKlines(
          rows.map((k) => ({
            ts: k.ts,
            o: k.o,
            h: k.h,
            l: k.l,
            c: k.c,
            v: k.v,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setKlines([]);
      });
    return () => {
      cancelled = true;
    };
  }, [focusedSymbol, interval]);

  // --- Run Preview ---------------------------------------------------------
  const draftCode = useWorkspaceDraftStore((s) => s.code);
  const draftStrategyId = useWorkspaceDraftStore((s) => s.strategyId);
  const canRunPreview = !!draftCode;

  const handleRunPreview = useCallback(async () => {
    if (!draftCode) return;
    setIsRunning(true);
    setLastError(null);
    try {
      const task = await cremote.startBacktest({
        code: draftCode,
        config: {
          symbols: [focusedSymbol],
          interval,
          from: Math.floor(Date.now() / 1000) - 7 * 24 * 3600,
          to: Math.floor(Date.now() / 1000),
        },
        strategy_id: draftStrategyId ?? currentStrategyId ?? undefined,
      });
      enterPreview(draftStrategyId ?? currentStrategyId ?? '', task.task_id);
    } catch (err) {
      const body = toErrorBody(err);
      setLastError(`${body.code}: ${body.message}`);
    } finally {
      setIsRunning(false);
    }
  }, [
    draftCode,
    draftStrategyId,
    currentStrategyId,
    focusedSymbol,
    interval,
    enterPreview,
  ]);

  // --- Symbol switch → reload chart (effect above handles it) --------------
  const handleSymbolChange = (s: string) => {
    setFocus(s);
    // Context reset in prompt — each new turn already reads current focus,
    // so we just change the focus here.
  };

  const handleToggleIndicator = (ind: string) => {
    setIndicators((prev) =>
      prev.includes(ind) ? prev.filter((x) => x !== ind) : [...prev, ind],
    );
  };

  // For now, AIPanel is reused as-is (still uses generic prompt). The
  // strategist-specific prompt + parser integration is wired inside
  // AIPanel in a later pass; we rely on prompt mode branching.
  void navigate;

  return (
    <WorkspaceShell
      topbar={
        <StrategyTopbar
          symbol={focusedSymbol}
          onSymbolChange={handleSymbolChange}
          interval={interval}
          onIntervalChange={setInterval}
          indicators={indicators}
          onToggleIndicator={handleToggleIndicator}
          onRunPreview={handleRunPreview}
          canRunPreview={canRunPreview}
          isRunning={isRunning}
        />
      }
      main={
        <div className="flex flex-col gap-4 p-4">
          <ClawChart.Candles
            data={klines}
            height={360}
            showVolume
          />
          <div className="grid grid-cols-2 gap-4">
            <StrategyDraftCard />
            <RunPreviewCard
              onRunPreview={handleRunPreview}
              isRunning={isRunning}
              lastError={lastError}
            />
          </div>
        </div>
      }
      rightRail={
        <AIPersonaShell
          persona="strategist"
          context={{ focusedSymbol, interval, indicators }}
        >
          {/* For this change, the shell wraps the existing AIPanel so
              the strategist persona gets the correct header/framing.
              The inner panel still runs on the generic prompt — strategist-
              specific prompt + parser + auto-save flow is the next step. */}
          <div className="flex-1 overflow-hidden">
            <AIPanel />
          </div>
        </AIPersonaShell>
      }
    />
  );
}
