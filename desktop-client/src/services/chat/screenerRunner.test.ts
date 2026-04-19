import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  extractPythonCode,
  looksLikeScreener,
  runScreenerFromCode,
} from './screenerRunner';

describe('extractPythonCode', () => {
  test('returns null when no fenced block', () => {
    expect(extractPythonCode('Just some prose.')).toBeNull();
  });

  test('pulls out a ```python block', () => {
    const msg = 'Here:\n```python\nprint(1)\n```';
    expect(extractPythonCode(msg)).toBe('print(1)');
  });

  test('pulls out a ```py short-form block', () => {
    const msg = '```py\nx = 2\n```';
    expect(extractPythonCode(msg)).toBe('x = 2');
  });

  test('pulls out a plain ``` block with no lang', () => {
    const msg = '```\nfoo()\n```';
    expect(extractPythonCode(msg)).toBe('foo()');
  });

  test('picks the LAST code block when multiple are present', () => {
    const msg =
      'First attempt:\n```python\nBROKEN\n```\n' +
      'Corrected:\n```python\nFIXED\n```';
    expect(extractPythonCode(msg)).toBe('FIXED');
  });
});

describe('looksLikeScreener', () => {
  test('recognises claw.screener import', () => {
    expect(looksLikeScreener('from claw.screener import Screener\n')).toBe(true);
  });

  test('recognises a Screener subclass', () => {
    expect(looksLikeScreener('class Foo(Screener):\n    pass')).toBe(true);
  });

  test('recognises the filter(self, symbol, ...) signature', () => {
    expect(
      looksLikeScreener('def filter(self, symbol, klines, metadata):\n    return True'),
    ).toBe(true);
  });

  test('rejects a plain Strategy', () => {
    expect(
      looksLikeScreener('from claw.strategy import Strategy\nclass S(Strategy): pass'),
    ).toBe(false);
  });

  test('rejects unrelated code', () => {
    expect(looksLikeScreener('print("hello")')).toBe(false);
  });
});

describe('runScreenerFromCode', () => {
  beforeEach(() => {
    (window as any).claw = {
      remote: {
        screener: {
          start: vi.fn(async () => ({ task_id: 't1', status: 'running' })),
          result: vi.fn(),
        },
      },
    };
  });

  test('returns done with the matched symbols list', async () => {
    const rResults = [
      { symbol: 'BTC_USDT', score: 1, rank: 1, passed: true },
      { symbol: 'ETH_USDT', score: 0.9, rank: 2, passed: true },
      { symbol: 'XYZ_USDT', score: 0, rank: 300, passed: false },
    ];
    const resultFn = vi.fn();
    resultFn.mockResolvedValueOnce({ status: 'running' });
    resultFn.mockResolvedValueOnce({ status: 'done', result: { results: rResults } });
    (window as any).claw.remote.screener.result = resultFn;

    const updates: any[] = [];
    const final = await runScreenerFromCode('code', {
      pollIntervalMs: 1,
      onUpdate: (s) => updates.push(s),
    });

    expect(final.phase).toBe('done');
    if (final.phase !== 'done') throw new Error('unreachable');
    expect(final.symbols).toEqual(['BTC_USDT', 'ETH_USDT']);
    expect(final.matched).toBe(2);
    expect(final.total).toBe(3);
    // onUpdate fired at least for running + done
    expect(updates.some((u) => u.phase === 'running')).toBe(true);
    expect(updates.some((u) => u.phase === 'done')).toBe(true);
  });

  test('returns failed when the backend reports failure', async () => {
    (window as any).claw.remote.screener.result = vi
      .fn()
      .mockResolvedValueOnce({ status: 'failed', error: 'sandbox crashed' });

    const final = await runScreenerFromCode('code', { pollIntervalMs: 1 });
    expect(final.phase).toBe('failed');
    if (final.phase !== 'failed') throw new Error('unreachable');
    expect(final.error).toBe('sandbox crashed');
  });

  test('returns failed on network error from start()', async () => {
    (window as any).claw.remote.screener.start = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const final = await runScreenerFromCode('code', { pollIntervalMs: 1 });
    expect(final.phase).toBe('failed');
    if (final.phase !== 'failed') throw new Error('unreachable');
    expect(final.error).toBe('ECONNREFUSED');
  });

  test('respects abort signal', async () => {
    const ac = new AbortController();
    ac.abort();
    (window as any).claw.remote.screener.result = vi.fn(async () => ({ status: 'running' }));
    const final = await runScreenerFromCode('code', { pollIntervalMs: 1, signal: ac.signal });
    expect(final.phase).toBe('failed');
  });
});
