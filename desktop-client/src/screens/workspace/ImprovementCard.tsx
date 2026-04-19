import type { components } from '@/types/api';

type OptimLensImprovement = components['schemas']['OptimLensImprovement'];

interface Props {
  index: number;
  improvement: OptimLensImprovement;
  isDismissed?: boolean;
  isApplying?: boolean;
  onApply: (im: OptimLensImprovement) => void;
  onDismiss: (key: string) => void;
  onUndismiss?: (key: string) => void;
}

const CATEGORY_PILL: Record<OptimLensImprovement['category'], string> = {
  entry: 'bg-[color:var(--accent-primary-dim)] text-accent-primary',
  exit: 'bg-[color:var(--accent-yellow-dim)] text-accent-yellow',
  params: 'bg-[color:var(--accent-green-dim)] text-accent-green',
  filter: 'bg-[color:var(--accent-red-dim)] text-accent-red',
  risk_mgmt: 'bg-surface-tertiary text-fg-primary',
};

function formatDelta(label: string, value: number | null | undefined, unit = ''): JSX.Element | null {
  if (value == null) return null;
  const pos = value > 0;
  return (
    <span
      className={
        'font-mono text-[11px] ' +
        (pos ? 'text-accent-green' : value < 0 ? 'text-accent-red' : 'text-fg-muted')
      }
    >
      {label}: {pos ? '+' : ''}
      {(value * (unit === '%' ? 100 : 1)).toFixed(2)}
      {unit}
    </span>
  );
}

/** One OptimLens improvement rendered as a card with Apply / Dismiss. */
export function ImprovementCard({
  index,
  improvement,
  isDismissed,
  isApplying,
  onApply,
  onDismiss,
  onUndismiss,
}: Props) {
  const im = improvement;
  const delta = im.expected_delta ?? {};
  const key = im.title || `im-${index}`;

  return (
    <div
      className={
        'bg-surface-secondary rounded-lg p-3 space-y-2 border ' +
        (isDismissed ? 'border-dashed border-border-subtle opacity-60' : 'border-border-subtle')
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-fg-muted">#{index + 1}</span>
            <span className={'px-2 py-0.5 rounded-full text-[10px] font-semibold ' + CATEGORY_PILL[im.category]}>
              {im.category}
            </span>
            <span className="font-heading font-semibold text-sm truncate">{im.title}</span>
          </div>
        </div>
      </div>
      <p className="text-xs text-fg-secondary leading-snug">{im.rationale}</p>
      {(delta.sharpe != null || delta.max_drawdown != null || delta.win_rate != null) && (
        <div className="flex flex-wrap gap-3">
          {formatDelta('ΔSharpe', delta.sharpe)}
          {formatDelta('ΔMaxDD', delta.max_drawdown, '%')}
          {formatDelta('ΔWin', delta.win_rate, '%')}
        </div>
      )}
      {im.suggested_change?.kind === 'param_update' && im.suggested_change.payload && (
        <div className="text-[11px] font-mono text-fg-secondary bg-surface-tertiary rounded-md px-2 py-1">
          {String((im.suggested_change.payload as { param_name?: string }).param_name ?? 'param')} :{' '}
          <span className="text-fg-muted">
            {String((im.suggested_change.payload as { current?: unknown }).current ?? '?')}
          </span>{' '}
          →{' '}
          <span className="text-accent-primary">
            {String((im.suggested_change.payload as { suggested?: unknown }).suggested ?? '?')}
          </span>
        </div>
      )}
      {im.suggested_change?.kind === 'code_edit' && (
        <details className="text-[11px] font-mono text-fg-secondary bg-surface-tertiary rounded-md px-2 py-1">
          <summary className="cursor-pointer text-fg-primary">Code diff</summary>
          <pre className="whitespace-pre-wrap text-[10px] mt-1">
            {String((im.suggested_change.payload as { diff?: string }).diff ?? '(no diff provided)')}
          </pre>
        </details>
      )}
      <div className="flex items-center gap-2 pt-1">
        {isDismissed ? (
          <button
            onClick={() => onUndismiss?.(key)}
            className="text-xs text-fg-secondary hover:text-fg-primary"
          >
            Undismiss
          </button>
        ) : (
          <>
            <button
              onClick={() => onApply(im)}
              disabled={isApplying}
              className="px-3 py-1 rounded-md bg-accent-primary text-fg-inverse text-xs font-semibold disabled:opacity-50"
            >
              {isApplying ? 'Applying…' : 'Apply'}
            </button>
            <button
              onClick={() => onDismiss(key)}
              className="px-2 py-1 rounded-md text-xs text-fg-secondary hover:text-fg-primary"
            >
              Dismiss
            </button>
          </>
        )}
      </div>
    </div>
  );
}
