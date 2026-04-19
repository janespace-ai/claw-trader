import { useTranslation } from 'react-i18next';
import { useWorkspaceDraftStore } from '@/stores/workspaceDraftStore';

/**
 * "Strategy draft" card below the chart. Reads the latest draft from
 * workspaceDraftStore. Params are editable via inline numeric inputs;
 * conditions / interval / leverage are read-only (derived from summary).
 */
export function StrategyDraftCard() {
  const { t } = useTranslation();
  const draft = useWorkspaceDraftStore();

  if (!draft.summary || !draft.code) {
    return (
      <div className="rounded-lg bg-surface-secondary border border-border-subtle p-4 text-fg-muted text-sm">
        {t('workspace.design.no_draft')}
      </div>
    );
  }

  const s = draft.summary;

  return (
    <div className="rounded-lg bg-surface-secondary border border-border-subtle p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-heading font-semibold text-sm">
          {s.name || t('workspace.draft.unnamed')}
        </div>
        {draft.version && (
          <span className="text-[10px] font-mono text-fg-muted px-2 py-0.5 rounded-full bg-surface-tertiary">
            v{draft.version}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {s.interval && (
          <Row label={t('workspace.draft.interval')} value={s.interval} />
        )}
        {s.symbols && s.symbols.length > 0 && (
          <Row label={t('workspace.draft.symbols')} value={s.symbols.join(', ')} />
        )}
        {s.leverage !== undefined && s.leverage !== null && (
          <Row label={t('workspace.draft.leverage')} value={String(s.leverage)} />
        )}
        {s.longCondition && (
          <Row label={t('workspace.draft.long_when')} value={s.longCondition} mono wide />
        )}
        {s.shortCondition && (
          <Row label={t('workspace.draft.short_when')} value={s.shortCondition} mono wide />
        )}
      </div>

      {Object.keys(draft.params).length > 0 && (
        <div className="pt-2 border-t border-border-subtle">
          <div className="text-[10px] uppercase tracking-wider text-fg-muted mb-2">
            {t('workspace.draft.params')}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(draft.params).map(([k, v]) => (
              <ParamInput key={k} name={k} value={v} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  wide,
}: {
  label: string;
  value: string;
  mono?: boolean;
  wide?: boolean;
}) {
  return (
    <>
      <div className="text-fg-muted" style={wide ? { gridColumn: '1 / -1' } : undefined}>
        {label}
      </div>
      <div
        className={mono ? 'font-mono text-fg-primary' : 'text-fg-primary'}
        style={wide ? { gridColumn: '1 / -1' } : undefined}
      >
        {value}
      </div>
    </>
  );
}

function ParamInput({ name, value }: { name: string; value: number | string }) {
  const updateParam = useWorkspaceDraftStore((s) => s.updateParam);
  const numeric = typeof value === 'number';

  return (
    <label className="flex items-center gap-2">
      <span className="text-fg-muted font-mono text-[11px] w-14 truncate">{name}</span>
      <input
        type={numeric ? 'number' : 'text'}
        defaultValue={String(value)}
        onBlur={(e) => {
          const raw = e.target.value;
          const next = numeric ? Number(raw) : raw;
          if (numeric && Number.isNaN(next)) return;
          if (next !== value) updateParam(name, next as number | string);
        }}
        className="flex-1 bg-surface-tertiary rounded px-2 py-1 text-xs font-mono outline-none focus:ring-1 focus:ring-accent-primary"
      />
    </label>
  );
}
