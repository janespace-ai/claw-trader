import { describe, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/node';
import { cremote } from './contract-client';

describe('cremote — MSW-backed happy paths', () => {
  test('getKlines returns an array', async () => {
    const rows = await cremote.getKlines({
      symbol: 'BTC_USDT',
      interval: '1h',
      from: 1744000000,
      to: 1744500000,
    });
    expect(Array.isArray(rows)).toBe(true);
    expect(rows[0]).toHaveProperty('ts');
    expect(rows[0]).toHaveProperty('c');
  });

  test('listSymbols is paginated { items, next_cursor }', async () => {
    const page = await cremote.listSymbols({ market: 'futures', limit: 100 });
    expect(Array.isArray(page.items)).toBe(true);
    expect(page.items[0]).toHaveProperty('symbol');
    expect('next_cursor' in page).toBe(true);
  });

  test('startBacktest returns canonical TaskResponse', async () => {
    const task = await cremote.startBacktest({
      code: 'class MyStrategy(Strategy):\n    pass\n',
      config: {
        symbols: ['BTC_USDT'],
        interval: '1h',
        from: 1743900000,
        to: 1744500000,
      },
    });
    expect(task.status).toBe('pending');
    expect(task.task_id).toBeTruthy();
    expect(typeof task.started_at).toBe('number');
  });

  test('getScreenerResult done shape', async () => {
    const result = await cremote.getScreenerResult({ task_id: 'abc-123' });
    expect(result.status).toBe('done');
    expect(result.result?.results.length).toBeGreaterThan(0);
  });
});

describe('cremote — error path', () => {
  test('handler returning 400 error envelope propagates', async () => {
    server.use(
      http.post('*/api/backtest/start', () =>
        HttpResponse.json(
          { error: { code: 'COMPLIANCE_FAILED', message: 'forbidden import', details: { violations: ['os'] } } },
          { status: 400 },
        ),
      ),
    );
    await expect(
      cremote.startBacktest({
        code: 'import os',
        config: { symbols: ['BTC_USDT'], interval: '1h', from: 1, to: 2 },
      }),
    ).rejects.toThrow();
  });

  test('handler returning legacy flat shape still normalizes', async () => {
    server.use(
      http.get('*/api/screener/result/:id', () =>
        HttpResponse.json({
          task_id: 'legacy-1',
          status: 'running',
          started_at: '2024-01-01T00:00:00Z',
          s3_progress: { done: 3, total: 10, failed: 0 },
        }),
      ),
    );
    const r = await cremote.getScreenerResult({ task_id: 'legacy-1' });
    expect(r.status).toBe('running');
    expect(r.started_at).toBe(1704067200);
    expect(r.progress?.done).toBe(3);
  });
});
