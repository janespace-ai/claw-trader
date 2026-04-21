import { useTranslation } from 'react-i18next';
import { toFriendlyError } from '@/services/errors/friendly';

interface Props {
  /** Raw error value — string, Error, or {code, message} body. */
  error: unknown;
  /** Visual variant: `inline` for tiny status rows (under a chat bubble,
   *  etc.), `card` for a full-width alert surface. */
  variant?: 'inline' | 'card';
  /** Optional prefix label, e.g. "Screener failed". When set, the
   *  friendly title renders after it. */
  label?: string;
  className?: string;
}

/** Renders a friendly, i18n-aware presentation of a backend error.
 *  Always shows a readable title + optional actionable hint; the raw
 *  backend message is tucked behind a "View details" disclosure so
 *  developers can still copy-paste it into a bug report. */
export function FriendlyError({ error, variant = 'card', label, className }: Props) {
  const { t } = useTranslation();
  const fe = toFriendlyError(error, t);

  if (variant === 'inline') {
    return (
      <div
        className={
          'flex items-start gap-2 text-[11px] text-accent-red mt-1 ' + (className ?? '')
        }
      >
        <span aria-hidden>⚠</span>
        <div className="min-w-0">
          <div>
            {label ? <span className="font-semibold">{label}: </span> : null}
            <span>{fe.title}</span>
          </div>
          {fe.hint && <div className="text-fg-secondary mt-0.5">{fe.hint}</div>}
          {fe.detail && fe.detail !== fe.title && (
            <details className="mt-0.5 text-fg-muted">
              <summary className="cursor-pointer select-none hover:text-fg-secondary">
                {t('errors.friendly.details')}
              </summary>
              <div className="mt-1 font-mono break-all whitespace-pre-wrap">
                {fe.detail}
              </div>
            </details>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        'rounded-md bg-accent-red-dim border border-accent-red-dim p-3 text-xs text-accent-red ' +
        (className ?? '')
      }
      role="alert"
    >
      <div className="flex items-start gap-2">
        <span aria-hidden className="text-sm leading-none">
          ⚠
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold">
            {label ? `${label} — ` : ''}
            {fe.title}
          </div>
          {fe.hint && <div className="text-fg-secondary mt-1">{fe.hint}</div>}
          {fe.detail && fe.detail !== fe.title && (
            <details className="mt-2 text-fg-muted">
              <summary className="cursor-pointer select-none hover:text-fg-secondary">
                {t('errors.friendly.details')}
              </summary>
              <div className="mt-1 font-mono break-all whitespace-pre-wrap text-[11px]">
                {fe.detail}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
