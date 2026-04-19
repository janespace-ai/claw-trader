import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useScreenerRunStore } from '@/stores/screenerRunStore';

interface SavedList {
  id: string;
  name: string | null;
  symbols: string[];
  screener_id: string | null;
  updated_at: string;
}

interface Props {
  onClose: () => void;
}

/**
 * Slide-in overlay listing saved coin lists from local SQLite.
 * "Load" replays a list into the screener run store as a synthetic
 * `complete` result so the chart + watchlist populate without an
 * actual screener run.
 */
export function SavedListsOverlay({ onClose }: Props) {
  const { t } = useTranslation();
  const [lists, setLists] = useState<SavedList[]>([]);
  const [saveName, setSaveName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const seed = useScreenerRunStore((s) => s.seed);
  const results = useScreenerRunStore((s) => s.results);

  const refresh = async () => {
    try {
      const rows = await window.claw.db.coinLists.list() as SavedList[];
      setLists(rows);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const passedSymbols = results.filter((r) => r.passed).map((r) => r.symbol);

  const handleSave = async () => {
    if (passedSymbols.length === 0) {
      setErr(t('screener.save_empty_error'));
      return;
    }
    try {
      await window.claw.db.coinLists.save({
        name: saveName.trim() || `List ${new Date().toLocaleString()}`,
        symbols: passedSymbols,
      });
      setSaveName('');
      setErr(null);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const handleLoad = (l: SavedList) => {
    const synthResults = l.symbols.map((sym, i) => ({
      symbol: sym,
      passed: true,
      score: 1,
      rank: i + 1,
    }));
    seed({ results: synthResults, focusedSymbol: l.symbols[0] ?? null });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose}>
      <div
        className="absolute top-0 left-0 bottom-0 w-80 bg-surface-primary border-r border-border-subtle p-4 space-y-3 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="font-heading font-semibold text-sm">{t('screener.saved_lists')}</div>
          <button
            onClick={onClose}
            className="text-fg-muted hover:text-fg-primary"
            aria-label={t('action.close')}
          >
            ✕
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder={t('screener.name_list')}
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            className="flex-1 px-2 py-1.5 rounded-md bg-surface-secondary text-xs"
          />
          <button
            onClick={handleSave}
            disabled={passedSymbols.length === 0}
            className="px-2 py-1.5 rounded-md bg-accent-primary text-fg-inverse text-xs font-semibold disabled:opacity-50"
          >
            {t('action.save')}
          </button>
        </div>

        {err && <div className="text-xs text-accent-red">{err}</div>}

        <div className="space-y-1">
          {lists.length === 0 ? (
            <div className="text-xs text-fg-muted italic">{t('screener.no_saved_lists')}</div>
          ) : (
            lists.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between text-xs px-2 py-2 rounded hover:bg-surface-secondary"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{l.name || t('strategy.untitled', { defaultValue: 'Untitled' })}</div>
                  <div className="text-fg-muted text-[10px]">
                    {t('screener.symbols_count', { n: l.symbols.length })} ·{' '}
                    {new Date(l.updated_at).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={() => handleLoad(l)}
                  className="text-accent-primary hover:underline"
                >
                  {t('action.load')}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
