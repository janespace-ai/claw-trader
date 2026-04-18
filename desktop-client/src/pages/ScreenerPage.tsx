import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCoinListStore } from '@/stores/coinListStore';
import { useStrategyStore } from '@/stores/strategyStore';
import { remote } from '@/services/remote/client';
import type { ScreenerRowResult } from '@/types/domain';

interface SavedList {
  id: string;
  name: string | null;
  symbols: string[];
  screener_id: string | null;
  updated_at: string;
}

export function ScreenerPage() {
  const { t } = useTranslation();
  const symbols = useCoinListStore((s) => s.symbols);
  const setSymbols = useCoinListStore((s) => s.set);
  const removeSymbol = useCoinListStore((s) => s.remove);
  const addSymbol = useCoinListStore((s) => s.add);
  const saveListAs = useCoinListStore((s) => s.saveAs);
  const loadList = useCoinListStore((s) => s.load);
  const current = useStrategyStore((s) => s.current);
  const strategies = useStrategyStore((s) => s.list);

  const [search, setSearch] = useState('');
  const [results, setResults] = useState<ScreenerRowResult[]>([]);
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const [showSaved, setShowSaved] = useState(false);
  const [savedLists, setSavedLists] = useState<SavedList[]>([]);
  const [saveName, setSaveName] = useState('');

  useEffect(() => {
    void refreshSaved();
  }, []);

  const refreshSaved = async () => {
    const rows = (await window.claw.db.coinLists.list()) as SavedList[];
    setSavedLists(rows);
  };

  const screenerStrategy = useMemo(
    () =>
      (current && current.type === 'screener' && current) ||
      strategies.find((s) => s.type === 'screener'),
    [current, strategies],
  );

  const selectedSet = useMemo(() => new Set(symbols), [symbols]);

  const run = async () => {
    if (!screenerStrategy) {
      setError('No screener strategy found. Create one on the Strategies tab first.');
      return;
    }
    setStatus('running');
    setError(null);
    try {
      const { task_id } = await remote.startScreener({
        code: screenerStrategy.code,
        config: { market: 'futures', lookback_days: 365 },
        strategy_id: screenerStrategy.id,
      });
      // Poll result
      for (let attempts = 0; attempts < 120; attempts++) {
        const r: any = await remote.screenerResult(task_id);
        if (r?.status === 'done') {
          const res = r.result ?? { results: [] };
          setResults(res.results as ScreenerRowResult[]);
          setSymbols(
            (res.results as ScreenerRowResult[])
              .filter((x) => x.passed)
              .map((x) => x.symbol),
          );
          setStatus('done');
          return;
        }
        if (r?.status === 'failed') {
          setError(r.error || 'failed');
          setStatus('error');
          return;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      setError('timeout');
      setStatus('error');
    } catch (err: any) {
      setError(err?.message ?? String(err));
      setStatus('error');
    }
  };

  const handleSaveAs = async () => {
    const name = saveName.trim() || `List ${new Date().toLocaleString()}`;
    await saveListAs(name, screenerStrategy?.id);
    setSaveName('');
    void refreshSaved();
  };

  const passedCount = results.filter((r) => r.passed).length;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-heading text-xl font-semibold">{t('screener.title')}</div>
          <div className="text-xs text-fg-muted mt-1">
            {passedCount > 0 && `${passedCount} ${t('screener.passed').toLowerCase()} · `}
            {symbols.length} selected
            {screenerStrategy && (
              <> · using <span className="text-fg-primary">{screenerStrategy.name}</span></>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSaved((v) => !v)}
            className="px-3 py-2 text-xs rounded-md bg-surface-secondary hover:bg-surface-tertiary"
          >
            Saved lists ({savedLists.length})
          </button>
          <button
            onClick={run}
            disabled={status === 'running'}
            className="px-3 py-2 text-xs rounded-md bg-accent-primary text-fg-inverse font-semibold disabled:opacity-40"
          >
            {status === 'running' ? '…' : 'Run screener'}
          </button>
        </div>
      </div>

      {error && <div className="text-xs text-accent-red">{error}</div>}

      {showSaved && (
        <div className="bg-surface-secondary rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Name this list…"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded-md bg-surface-primary text-xs"
            />
            <button
              onClick={handleSaveAs}
              disabled={symbols.length === 0}
              className="px-3 py-1.5 rounded-md bg-accent-primary text-fg-inverse text-xs font-semibold disabled:opacity-40"
            >
              {t('action.save')}
            </button>
          </div>
          <div className="space-y-1 max-h-40 overflow-auto">
            {savedLists.length === 0 ? (
              <div className="text-xs text-fg-muted">No saved lists yet.</div>
            ) : (
              savedLists.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between text-xs px-2 py-1 rounded hover:bg-surface-tertiary"
                >
                  <div>
                    <span className="font-medium">{l.name || 'Untitled'}</span>
                    <span className="text-fg-muted ml-2">
                      {l.symbols.length} symbols · {new Date(l.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                  <button
                    onClick={() => void loadList(l.id)}
                    className="text-accent-primary hover:underline"
                  >
                    Load
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('screener.search')}
          className="flex-1 px-3 py-2 rounded-md bg-surface-secondary text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && search.trim()) {
              addSymbol(search.trim().toUpperCase());
              setSearch('');
            }
          }}
        />
        <button
          onClick={() => {
            if (search.trim()) addSymbol(search.trim().toUpperCase());
            setSearch('');
          }}
          className="px-3 py-2 rounded-md bg-surface-secondary text-sm"
        >
          +
        </button>
      </div>

      {/* Rich screener result rows */}
      {results.length > 0 && (
        <div className="bg-surface-secondary rounded-lg p-4 space-y-1">
          <div className="grid grid-cols-[24px_100px_1fr_80px_80px_60px] gap-3 text-[10px] text-fg-muted border-b border-border-subtle pb-2">
            <span />
            <span>Symbol</span>
            <span>Score</span>
            <span className="text-right">Rank</span>
            <span className="text-right">24h Vol</span>
            <span className="text-right">Action</span>
          </div>
          {results.map((r) => (
            <ScreenerRow
              key={r.symbol}
              row={r}
              selected={selectedSet.has(r.symbol)}
              onToggle={(s) =>
                selectedSet.has(s) ? removeSymbol(s) : addSymbol(s)
              }
            />
          ))}
        </div>
      )}

      {/* Selected symbols (manual management) */}
      {results.length === 0 && (
        <div className="bg-surface-secondary rounded-lg p-4 space-y-1 max-h-[60vh] overflow-auto">
          <div className="text-xs text-fg-muted mb-2">
            Selected symbols ({symbols.length})
          </div>
          {symbols.length === 0 ? (
            <div className="text-xs text-fg-muted">
              No symbols selected. Run the screener or add manually.
            </div>
          ) : (
            symbols.map((sym) => (
              <div
                key={sym}
                className="flex items-center justify-between text-sm py-1.5 px-2 rounded hover:bg-surface-tertiary"
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
      )}
    </div>
  );
}

function ScreenerRow({
  row,
  selected,
  onToggle,
}: {
  row: ScreenerRowResult;
  selected: boolean;
  onToggle: (symbol: string) => void;
}) {
  const scoreColor =
    row.score >= 0.8
      ? 'var(--accent-green)'
      : row.score >= 0.5
        ? 'var(--accent-primary)'
        : row.score > 0
          ? 'var(--accent-yellow)'
          : 'var(--accent-red)';

  // We don't have real 24h volume in the stub; surface score instead.
  const volText = (row as any).volume_24h_quote
    ? `$${Math.round((row as any).volume_24h_quote / 1e6)}M`
    : '—';

  return (
    <div
      className={
        'grid grid-cols-[24px_100px_1fr_80px_80px_60px] gap-3 items-center py-1.5 px-1 rounded ' +
        (row.passed ? '' : 'opacity-50')
      }
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(row.symbol)}
        className="accent-[color:var(--accent-primary)]"
      />
      <span className="font-mono text-sm">{row.symbol}</span>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-surface-primary overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: Math.max(0, Math.min(100, row.score * 100)) + '%',
              background: scoreColor,
            }}
          />
        </div>
        <span className="font-mono text-xs text-fg-secondary w-10 text-right">
          {row.score.toFixed(2)}
        </span>
      </div>
      <span className="font-mono text-xs text-right text-fg-secondary">
        {row.rank != null ? '#' + row.rank : '—'}
      </span>
      <span className="font-mono text-xs text-right text-fg-secondary">{volText}</span>
      <button
        onClick={() => onToggle(row.symbol)}
        className="text-xs justify-self-end text-fg-muted hover:text-fg-primary"
      >
        {selected ? '✓' : 'Add'}
      </button>
    </div>
  );
}
