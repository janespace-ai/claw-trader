import { describe, expect, test, vi } from 'vitest';
import { pollBacktestResult } from './client';

describe('pollBacktestResult', () => {
  test('returns the result once status=done', async () => {
    const responses = [
      { status: 'running', progress: 0.1 },
      { status: 'running', progress: 0.5 },
      { status: 'done' },
    ];
    let i = 0;
    const status = vi.fn(async () => responses[i++]);
    const result = vi.fn(async () => ({ data: 'ok' }));
    (window as any).claw.remote.backtest.status = status;
    (window as any).claw.remote.backtest.result = result;

    const onProgress = vi.fn();
    const out = await pollBacktestResult('task-123', onProgress, { intervalMs: 1 });

    expect(out).toEqual({ data: 'ok' });
    expect(status).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(result).toHaveBeenCalledTimes(1);
  });

  test('throws when status=failed', async () => {
    (window as any).claw.remote.backtest.status = vi.fn(async () => ({
      status: 'failed',
      error: 'strategy panicked',
    }));

    const onProgress = vi.fn();
    await expect(
      pollBacktestResult('task-fail', onProgress, { intervalMs: 1 }),
    ).rejects.toThrow(/strategy panicked/);
  });

  test('aborts when signal is aborted mid-poll', async () => {
    const ac = new AbortController();
    let calls = 0;
    (window as any).claw.remote.backtest.status = vi.fn(async () => {
      calls += 1;
      if (calls === 2) ac.abort();
      return { status: 'running' };
    });

    const onProgress = vi.fn();
    await expect(
      pollBacktestResult('task-abort', onProgress, { intervalMs: 1, signal: ac.signal }),
    ).rejects.toThrow(/aborted/);
  });
});
