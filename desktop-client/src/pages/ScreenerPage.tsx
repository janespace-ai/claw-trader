import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCoinListStore } from '@/stores/coinListStore';
import { useStrategyStore } from '@/stores/strategyStore';
import { remote } from '@/services/remote/client';

export function ScreenerPage() {
  const { t } = useTranslation();
  const symbols = useCoinListStore((s) => s.symbols);
  const setSymbols = useCoinListStore((s) => s.set);
  const removeSymbol = useCoinListStore((s) => s.remove);
  const addSymbol = useCoinListStore((s) => s.add);
  const current = useStrategyStore((s) => s.current);

  const [search, setSearch] = useState('');
  const [passed, setPassed] = useState<any[]>([]);
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If current strategy is a screener, auto-run on mount? For now leave manual.
  }, [current]);

  const run = async () => {
    if (!current || current.type !== 'screener') {
      setError('Need a screener strategy in "current" — switch to Strategies tab first.');
      return;
    }
    setStatus('running');
    setError(null);
    try {
      const { task_id } = await remote.startScreener({
        code: current.code,
        config: { market: 'futures', lookback_days: 365 },
        strategy_id: current.id,
      });
      // Poll result
      let attempts = 0;
      while (attempts < 120) {
        const r: any = await remote.screenerResult(task_id);
        if (r?.status === 'done') {
          const res = r.result;
          setPassed(res?.results ?? []);
          setSymbols((res?.results ?? []).filter((x: any) => x.passed).map((x: any) => x.symbol));
          setStatus('done');
          return;
        }
        if (r?.status === 'failed') {
          setError(r.error || 'failed');
          setStatus('error');
          return;
        }
        await new Promise((r) => setTimeout(r, 3000));
        attempts += 1;
      }
      setError('timeout');
      setStatus('error');
    } catch (err: any) {
      setError(err?.message ?? String(err));
      setStatus('error');
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-heading text-xl font-semibold">{t('screener.title')}</div>
          <div className="text-xs text-fg-muted mt-1">
            {passed.length} passed · {symbols.length} selected
          </div>
        </div>
        <button
          onClick={run}
          disabled={status === 'running'}
          className="px-3 py-2 text-xs rounded-md bg-accent-primary text-fg-inverse font-semibold disabled:opacity-40"
        >
          {status === 'running' ? '…' : 'Run screener'}
        </button>
      </div>

      {error && <div className="text-xs text-accent-red">{error}</div>}

      <div className="flex gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('screener.search')}
          className="flex-1 px-3 py-2 rounded-md bg-surface-secondary text-sm"
        />
        <button
          onClick={() => {
            if (search.trim()) addSymbol(search.trim());
            setSearch('');
          }}
          className="px-3 py-2 rounded-md bg-surface-secondary text-sm"
        >
          +
        </button>
      </div>

      <div className="bg-surface-secondary rounded-lg p-4 space-y-1 max-h-[60vh] overflow-auto">
        {symbols.length === 0 ? (
          <div className="text-xs text-fg-muted">No symbols selected yet.</div>
        ) : (
          symbols.map((sym) => (
            <div
              key={sym}
              className="flex items-center justify-between text-sm py-1 px-2 rounded hover:bg-surface-tertiary"
            >
              <span className="font-mono">{sym}</span>
              <button
                onClick={() => removeSymbol(sym)}
                className="text-fg-muted hover:text-accent-red text-xs"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
