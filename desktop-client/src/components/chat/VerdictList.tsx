import { useTranslation } from 'react-i18next';
import type { components } from '@/types/api';

type SignalVerdict = components['schemas']['SignalVerdict'];

interface Props {
  verdicts: SignalVerdict[];
  selectedId?: string | null;
  onSelect?: (signalId: string) => void;
  layout?: 'compact' | 'table';
}

/** Per-verdict pill coloring keyed off the `verdict` union. */
const PILL_CLASS: Record<SignalVerdict['verdict'], string> = {
  good: 'bg-[color:var(--accent-green-dim)] text-accent-green',
  questionable: 'bg-[color:var(--accent-yellow-dim)] text-accent-yellow',
  bad: 'bg-[color:var(--accent-red-dim)] text-accent-red',
};

/**
 * Compact or table rendering of Signal Review verdicts. Both the
 * RightRail transcript and the AIReviewTab use the same component;
 * `layout="table"` makes it stretch wider.
 */
export function VerdictList({ verdicts, selectedId, onSelect, layout = 'compact' }: Props) {
  const { t } = useTranslation();
  if (verdicts.length === 0) {
    return (
      <div className="text-xs text-fg-muted italic py-2">
        {t('verdict.empty')}
      </div>
    );
  }

  if (layout === 'table') {
    return (
      <table className="w-full text-xs">
        <thead className="text-fg-muted text-[10px] uppercase">
          <tr>
            <th className="text-left py-2 px-1 font-medium">{t('verdict.col.signal')}</th>
            <th className="text-left py-2 px-1 font-medium">{t('verdict.col.symbol')}</th>
            <th className="text-left py-2 px-1 font-medium">{t('verdict.col.entry')}</th>
            <th className="text-left py-2 px-1 font-medium">{t('verdict.col.verdict')}</th>
            <th className="text-left py-2 px-1 font-medium">{t('verdict.col.note')}</th>
          </tr>
        </thead>
        <tbody>
          {verdicts.map((v) => (
            <tr
              key={v.signal_id}
              onClick={() => onSelect?.(v.signal_id)}
              className={
                'border-t border-border-subtle cursor-pointer ' +
                (selectedId === v.signal_id ? 'bg-surface-tertiary' : 'hover:bg-surface-secondary')
              }
            >
              <td className="py-1.5 px-1 font-mono text-[10px] text-fg-secondary">
                {v.signal_id}
              </td>
              <td className="py-1.5 px-1 font-medium">{v.symbol}</td>
              <td className="py-1.5 px-1 text-fg-secondary">
                {new Date(v.entry_ts * 1000).toISOString().slice(0, 16).replace('T', ' ')}
              </td>
              <td className="py-1.5 px-1">
                <span className={'px-2 py-0.5 rounded-full text-[10px] font-semibold ' + PILL_CLASS[v.verdict]}>
                  {v.verdict}
                </span>
              </td>
              <td className="py-1.5 px-1 text-fg-secondary">{v.note ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {verdicts.map((v) => (
        <button
          key={v.signal_id}
          onClick={() => onSelect?.(v.signal_id)}
          title={`${v.symbol} @ ${new Date(v.entry_ts * 1000).toISOString()}${v.note ? ' — ' + v.note : ''}`}
          className={
            'px-2 py-0.5 rounded-full text-[10px] font-semibold transition-opacity ' +
            PILL_CLASS[v.verdict] +
            (selectedId === v.signal_id ? ' ring-2 ring-accent-primary' : ' hover:opacity-80')
          }
        >
          {v.symbol} · {v.verdict}
        </button>
      ))}
    </div>
  );
}
