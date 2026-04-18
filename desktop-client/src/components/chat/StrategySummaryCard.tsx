import { useTranslation } from 'react-i18next';
import { CodeBlock } from './CodeBlock';

export interface StrategySummary {
  name: string;
  kind: 'strategy' | 'screener';
  interval?: string;
  symbols?: string[];
  longCondition?: string;
  shortCondition?: string;
  leverage?: number | string;
  params?: Record<string, unknown>;
  code?: string;
}

interface Props {
  summary: StrategySummary;
  code?: string;
  onApply?: () => void;
  onDismiss?: () => void;
}

/** In-chat card that renders a structured strategy preview alongside its code. */
export function StrategySummaryCard({ summary, code, onApply, onDismiss }: Props) {
  const { t } = useTranslation();

  return (
    <div className="bg-surface-tertiary rounded-lg p-3 space-y-2 border border-border-subtle">
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-full bg-accent-primary-dim grid place-items-center text-[11px] text-accent-primary">
          ⚙
        </div>
        <div className="font-heading font-semibold text-sm">{summary.name}</div>
        <span className="ml-auto text-[10px] text-fg-muted">
          {summary.kind === 'strategy' ? t('nav.strategies') : t('nav.screener')}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {summary.interval && <Row label="Interval" value={summary.interval} />}
        {summary.symbols && summary.symbols.length > 0 && (
          <Row label="Symbols" value={summary.symbols.slice(0, 4).join(', ') + (summary.symbols.length > 4 ? ` +${summary.symbols.length - 4}` : '')} />
        )}
        {summary.leverage !== undefined && <Row label="Leverage" value={String(summary.leverage)} />}
        {summary.longCondition && <Row label="Long when" value={summary.longCondition} mono />}
        {summary.shortCondition && <Row label="Short when" value={summary.shortCondition} mono />}
        {summary.params && Object.keys(summary.params).length > 0 && (
          <Row
            label="Params"
            value={Object.entries(summary.params)
              .map(([k, v]) => `${k}=${Array.isArray(v) ? `[${v.join(',')}]` : String(v)}`)
              .join('  ')}
            mono
          />
        )}
      </div>

      {code && (
        <details className="text-xs">
          <summary className="cursor-pointer text-fg-muted hover:text-fg-primary">
            View code
          </summary>
          <div className="mt-2">
            <CodeBlock language="python" code={code} />
          </div>
        </details>
      )}

      {(onApply || onDismiss) && (
        <div className="flex gap-2 pt-1">
          {onApply && (
            <button
              onClick={onApply}
              className="px-3 py-1.5 rounded-md bg-accent-primary text-fg-inverse text-xs font-semibold"
            >
              {t('action.save')}
            </button>
          )}
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="px-3 py-1.5 rounded-md bg-surface-primary text-fg-secondary text-xs"
            >
              {t('action.cancel')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <div className="text-fg-muted">{label}</div>
      <div className={mono ? 'font-mono text-fg-primary' : 'text-fg-primary'}>{value}</div>
    </>
  );
}
