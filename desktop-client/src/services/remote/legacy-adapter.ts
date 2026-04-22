// Adapter layer: normalizes today's drifted backend responses into the
// canonical shapes declared in `api/openapi.yaml`. Lives only until
// `service-api-align-contract` ships; after that, this file is
// deleted (the cremote client calls real handlers directly).
//
// Each adapter is a thin normalization: it accepts whatever the real
// handler currently emits (legacy or canonical) and produces the
// canonical shape. Passes through if already canonical.

import type { components } from '@/types/api';

type TaskResponse = components['schemas']['TaskResponse'];
type ErrorBody = components['schemas']['ErrorBody'];

/** Normalize a legacy response from /api/backtest/{status|result} into
 *  canonical TaskResponse. Legacy emits flat fields on the root
 *  (`{ task_id, status, s3_progress, api_progress, ... }`); canonical
 *  wraps progress + result + error.  */
export function adaptTaskResponse(legacy: unknown): TaskResponse {
  if (!legacy || typeof legacy !== 'object') {
    return {
      task_id: '',
      status: 'failed',
      started_at: 0,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'empty legacy response',
        details: { legacy_payload: legacy },
      },
    };
  }

  const l = legacy as Record<string, unknown>;

  // Already canonical (has our enum status AND no suspicious legacy fields)?
  if (
    typeof l.task_id === 'string' &&
    typeof l.started_at === 'number' &&
    ['pending', 'running', 'done', 'failed', 'cancelled'].includes(l.status as string) &&
    !('s3_progress' in l) &&
    !('api_progress' in l)
  ) {
    return l as unknown as TaskResponse;
  }

  // Legacy form.
  const canonical: TaskResponse = {
    task_id: String(l.task_id ?? ''),
    status: normalizeStatus(l.status),
    started_at: toUnixSeconds(l.started_at),
  };

  if (l.finished_at) canonical.finished_at = toUnixSeconds(l.finished_at);

  // Legacy progress shape — collapse into canonical.
  if (l.s3_progress || l.api_progress) {
    const phase = l.api_progress ? 'api' : 's3';
    const prog = (l.api_progress ?? l.s3_progress) as Record<string, number> | undefined;
    canonical.progress = {
      phase,
      done: Number(prog?.done ?? 0),
      total: Number(prog?.total ?? 0),
    };
  }

  if (l.result !== undefined) canonical.result = l.result as never;
  if (l.error !== undefined && l.error !== '') {
    canonical.error = adaptError(l.error);
  }

  return canonical;
}

/** Normalize a legacy error (string or free-form object) to canonical
 *  `ErrorBody`. Unclassified errors become INTERNAL_ERROR. */
export function adaptError(legacy: unknown): ErrorBody {
  if (legacy && typeof legacy === 'object') {
    const l = legacy as Record<string, unknown>;
    if (typeof l.code === 'string') {
      return {
        code: l.code as ErrorBody['code'],
        message: String(l.message ?? ''),
        details: (l.details as Record<string, unknown> | undefined) ?? undefined,
      };
    }
    return {
      code: 'INTERNAL_ERROR',
      message: String(l.error ?? JSON.stringify(l)),
      details: { legacy_payload: l },
    };
  }
  return {
    code: 'INTERNAL_ERROR',
    message: String(legacy ?? ''),
    details: { legacy_payload: legacy },
  };
}

/** Wrap a legacy "bare array" response into the new paginated shape. */
export function adaptPaginated<T>(legacy: unknown): { items: T[]; next_cursor: string | null } {
  if (Array.isArray(legacy)) {
    return { items: legacy as T[], next_cursor: null };
  }
  if (legacy && typeof legacy === 'object' && 'items' in (legacy as object)) {
    return legacy as { items: T[]; next_cursor: string | null };
  }
  return { items: [], next_cursor: null };
}

// ---- helpers ---------------------------------------------------------------

function normalizeStatus(s: unknown): TaskResponse['status'] {
  const allowed = ['pending', 'running', 'done', 'failed', 'cancelled'] as const;
  if (typeof s === 'string' && (allowed as readonly string[]).includes(s)) {
    return s as TaskResponse['status'];
  }
  return 'failed';
}

function toUnixSeconds(v: unknown): number {
  if (typeof v === 'number') return v > 1e12 ? Math.floor(v / 1000) : Math.floor(v);
  if (typeof v === 'string') {
    const n = Date.parse(v);
    if (!Number.isNaN(n)) return Math.floor(n / 1000);
    const asNum = Number(v);
    if (!Number.isNaN(asNum)) return Math.floor(asNum);
  }
  return 0;
}
