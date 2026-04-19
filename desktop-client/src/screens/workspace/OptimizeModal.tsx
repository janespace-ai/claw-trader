import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ParamRow {
  name: string;
  enabled: boolean;
  /** Start value (min) and stop (max) for the sweep grid. */
  min: string;
  max: string;
  step: string;
}

interface Props {
  /** From strategy `params_schema` — { name: defaultValue }. */
  paramsSchema: Record<string, unknown>;
  /** Symbols in scope. The Deep screen already knows which ones ran. */
  symbols: string[];
  onCancel: () => void;
  onSubmit: (grid: Record<string, number[]>) => void;
}

const MAX_COMBOS = 50; // matches PARAM_GRID_TOO_LARGE server-side cap

function parseFloat2(s: string): number | null {
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function expandAxis(row: ParamRow): number[] {
  const lo = parseFloat2(row.min);
  const hi = parseFloat2(row.max);
  const step = parseFloat2(row.step);
  if (lo == null || hi == null || step == null || step <= 0 || hi < lo) return [];
  const out: number[] = [];
  // Inclusive, rounded to mitigate FP drift.
  for (let v = lo; v <= hi + 1e-9; v = v + step) {
    out.push(Math.round(v * 1e6) / 1e6);
    if (out.length > 200) break;
  }
  return out;
}

/**
 * Modal that lets the user pick which strategy params to sweep and
 * their min/max/step. Live combo-count + client-side cap match the
 * server's `PARAM_GRID_TOO_LARGE` contract.
 */
export function OptimizeModal({ paramsSchema, symbols, onCancel, onSubmit }: Props) {
  const { t } = useTranslation();
  const tunable = useMemo(() => {
    return Object.entries(paramsSchema).filter(
      ([, v]) => typeof v === 'number' && Number.isFinite(v),
    );
  }, [paramsSchema]);

  const [rows, setRows] = useState<ParamRow[]>(() =>
    tunable.map(([name, v]) => {
      const num = v as number;
      const step = num < 1 ? '0.01' : '1';
      return {
        name,
        enabled: true,
        min: String(Math.max(0, Math.round((num * 0.5) * 1000) / 1000)),
        max: String(Math.round((num * 1.5) * 1000) / 1000),
        step,
      };
    }),
  );

  const perAxisCounts = rows.map(expandAxis);
  const totalCombos = rows.reduce((acc, row, i) => {
    if (!row.enabled) return acc;
    return acc * Math.max(1, perAxisCounts[i].length);
  }, 1);
  const tooLarge = totalCombos > MAX_COMBOS;

  const updateRow = (i: number, patch: Partial<ParamRow>) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  if (tunable.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/60 grid place-items-center z-50">
        <div className="bg-surface-primary rounded-lg p-6 w-96 space-y-3">
          <div className="font-heading font-semibold">{t('workspace.optimize.title')}</div>
          <div className="text-sm text-fg-secondary">
            {t('workspace.optimize.no_params')}
          </div>
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md bg-surface-tertiary text-fg-primary text-xs"
          >
            {t('action.close')}
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = () => {
    const grid: Record<string, number[]> = {};
    rows.forEach((row, i) => {
      if (!row.enabled) return;
      const axis = perAxisCounts[i];
      if (axis.length > 0) grid[row.name] = axis;
    });
    if (Object.keys(grid).length === 0) return;
    onSubmit(grid);
  };

  return (
    <div className="fixed inset-0 bg-black/60 grid place-items-center z-50">
      <div className="bg-surface-primary rounded-lg p-6 w-[520px] max-h-[80vh] overflow-y-auto space-y-4">
        <div>
          <div className="font-heading font-semibold">{t('workspace.optimize.title')}</div>
          <div className="text-[11px] text-fg-muted">
            {t('workspace.optimize.scope', { n: symbols.length })}
          </div>
        </div>

        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={row.name} className="border border-border-subtle rounded-md p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={row.enabled}
                  onChange={(e) => updateRow(i, { enabled: e.target.checked })}
                />
                <span className="font-mono text-xs">{row.name}</span>
                <span className="text-[10px] text-fg-muted ml-auto">
                  {t('workspace.optimize.values_count', { n: perAxisCounts[i].length })}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(['min', 'max', 'step'] as const).map((f) => (
                  <label key={f} className="flex flex-col">
                    <span className="text-[10px] text-fg-muted">{t(`workspace.optimize.field.${f}`)}</span>
                    <input
                      type="text"
                      value={row[f]}
                      disabled={!row.enabled}
                      onChange={(e) => updateRow(i, { [f]: e.target.value })}
                      className="bg-surface-secondary text-xs px-2 py-1 rounded-md"
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className={'text-xs ' + (tooLarge ? 'text-accent-red' : 'text-fg-secondary')}>
          {tooLarge
            ? t('workspace.optimize.combos_too_large', { n: totalCombos, max: MAX_COMBOS })
            : t('workspace.optimize.combos_ok', { n: totalCombos })}
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md text-fg-secondary text-xs"
          >
            {t('action.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={tooLarge}
            className="px-3 py-1.5 rounded-md bg-accent-primary text-fg-inverse text-xs font-semibold disabled:opacity-50"
          >
            {t('action.start_optimize')}
          </button>
        </div>
      </div>
    </div>
  );
}
