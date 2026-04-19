import { describe, expect, test } from 'vitest';
import { adaptTaskResponse, adaptError, adaptPaginated } from './legacy-adapter';

describe('adaptTaskResponse', () => {
  test('passes through canonical shape unchanged', () => {
    const canonical = {
      task_id: 't1',
      status: 'running',
      started_at: 1700000000,
      progress: { phase: 'backtest', done: 2, total: 10 },
    };
    const out = adaptTaskResponse(canonical);
    expect(out.task_id).toBe('t1');
    expect(out.status).toBe('running');
    expect(out.progress?.phase).toBe('backtest');
  });

  test('collapses legacy s3_progress into canonical progress', () => {
    const legacy = {
      task_id: 't2',
      status: 'running',
      started_at: 1700000000,
      s3_progress: { done: 5, total: 20, failed: 0 },
    };
    const out = adaptTaskResponse(legacy);
    expect(out.progress).toEqual({ phase: 's3', done: 5, total: 20 });
  });

  test('converts legacy ISO started_at to unix seconds', () => {
    const out = adaptTaskResponse({
      task_id: 't3',
      status: 'done',
      started_at: '2024-01-01T00:00:00Z',
    });
    expect(out.started_at).toBe(1704067200);
  });

  test('empty / non-object input produces INTERNAL_ERROR task', () => {
    const out = adaptTaskResponse(null);
    expect(out.status).toBe('failed');
    expect(out.error?.code).toBe('INTERNAL_ERROR');
  });

  test('normalizes unknown status to failed', () => {
    const out = adaptTaskResponse({ task_id: 't4', status: 'mystery', started_at: 1 });
    expect(out.status).toBe('failed');
  });
});

describe('adaptError', () => {
  test('string legacy → INTERNAL_ERROR', () => {
    const e = adaptError('something broke');
    expect(e.code).toBe('INTERNAL_ERROR');
    expect(e.message).toBe('something broke');
    expect(e.details?.legacy_payload).toBe('something broke');
  });

  test('object with legitimate code passes through', () => {
    const e = adaptError({
      code: 'INVALID_INTERVAL',
      message: 'bad',
      details: { allowed_intervals: ['5m', '1h'] },
    });
    expect(e.code).toBe('INVALID_INTERVAL');
    expect(e.details?.allowed_intervals).toEqual(['5m', '1h']);
  });

  test('object without code becomes INTERNAL_ERROR with legacy_payload', () => {
    const e = adaptError({ error: 'legacy string error' });
    expect(e.code).toBe('INTERNAL_ERROR');
    expect(e.message).toBe('legacy string error');
  });
});

describe('adaptPaginated', () => {
  test('wraps bare array', () => {
    const out = adaptPaginated<number>([1, 2, 3]);
    expect(out.items).toEqual([1, 2, 3]);
    expect(out.next_cursor).toBe(null);
  });

  test('passes through canonical shape', () => {
    const out = adaptPaginated<number>({ items: [1, 2], next_cursor: 'abc' });
    expect(out.items).toEqual([1, 2]);
    expect(out.next_cursor).toBe('abc');
  });

  test('empty input → empty result', () => {
    const out = adaptPaginated<number>(null);
    expect(out.items).toEqual([]);
    expect(out.next_cursor).toBe(null);
  });
});
