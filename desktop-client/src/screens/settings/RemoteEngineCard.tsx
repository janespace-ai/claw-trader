import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cremote, toErrorBody } from '@/services/remote/contract-client';
import type { components } from '@/types/api';

type EngineStatus = components['schemas']['EngineStatus'];

/** Polls `GET /api/engine/status` and renders the capability card. */
export function RemoteEngineCard() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await cremote.getEngineStatus();
      setStatus(s);
    } catch (err) {
      const body = toErrorBody(err);
      setError(`${body.code}: ${body.message}`);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  return (
    <div className="bg-surface-secondary rounded-lg p-3 space-y-2 border border-border-subtle">
      <div className="flex items-center justify-between">
        <div className="font-heading font-semibold text-sm">
          {t('settings.remote.engine_card_title')}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={
              'px-2 py-0.5 rounded-full text-[10px] font-semibold ' +
              (status && !error
                ? 'bg-[color:var(--accent-green-dim)] text-accent-green'
                : 'bg-[color:var(--accent-red-dim)] text-accent-red')
            }
          >
            {status && !error ? t('status.connected') : t('status.offline')}
          </span>
          <button
            onClick={() => void refresh()}
            disabled={loading}
            className="px-2 py-1 rounded-md bg-surface-tertiary text-xs hover:bg-surface-primary disabled:opacity-50"
          >
            {loading ? '…' : t('action.refresh')}
          </button>
        </div>
      </div>
      {error && <div className="text-xs text-accent-red">{error}</div>}
      {status && (
        <dl className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-xs">
          <dt className="text-fg-muted">{t('settings.remote.version')}</dt>
          <dd className="font-mono">{status.version}</dd>
          {status.data_aggregator_version && (
            <>
              <dt className="text-fg-muted">{t('settings.remote.aggregator')}</dt>
              <dd className="font-mono">{status.data_aggregator_version}</dd>
            </>
          )}
          <dt className="text-fg-muted">{t('settings.remote.markets')}</dt>
          <dd className="font-mono">{status.supported_markets.join(', ') || '—'}</dd>
          <dt className="text-fg-muted">{t('settings.remote.intervals')}</dt>
          <dd className="font-mono">{status.supported_intervals.join(', ') || '—'}</dd>
          {status.data_range && (
            <>
              <dt className="text-fg-muted">{t('settings.remote.data_range')}</dt>
              <dd className="font-mono">
                {status.data_range.from != null
                  ? new Date(status.data_range.from * 1000).toISOString().slice(0, 10)
                  : '—'}{' '}
                →{' '}
                {status.data_range.to != null
                  ? new Date(status.data_range.to * 1000).toISOString().slice(0, 10)
                  : '—'}
              </dd>
            </>
          )}
          {status.last_aggregator_sync_at != null && (
            <>
              <dt className="text-fg-muted">{t('settings.remote.last_sync')}</dt>
              <dd className="font-mono">
                {new Date(status.last_aggregator_sync_at * 1000).toLocaleString()}
              </dd>
            </>
          )}
          <dt className="text-fg-muted">{t('settings.remote.active_tasks')}</dt>
          <dd className="font-mono">{status.active_tasks}</dd>
          <dt className="text-fg-muted">{t('settings.remote.uptime')}</dt>
          <dd className="font-mono">{Math.round(status.uptime_seconds / 60)}m</dd>
        </dl>
      )}
    </div>
  );
}
