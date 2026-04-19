import { describe, expect, test } from 'vitest';

describe('MSW handlers', () => {
  test('getKlines is intercepted and returns fixture array', async () => {
    const r = await fetch('http://localhost/api/klines?symbol=BTC_USDT&interval=1h&from=1&to=2');
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).toHaveProperty('ts');
  });

  test('listSymbols is intercepted and returns paginated shape', async () => {
    const r = await fetch('http://localhost/api/symbols?market=futures&limit=5');
    const body = await r.json();
    expect(body).toHaveProperty('items');
    expect(body).toHaveProperty('next_cursor');
    expect(Array.isArray(body.items)).toBe(true);
  });

  test('startBacktest POST returns canonical task envelope', async () => {
    const r = await fetch('http://localhost/api/backtest/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: '', config: {} }),
    });
    const body = await r.json();
    expect(body.status).toBe('pending');
    expect(body.task_id).toBeTruthy();
  });

  test('healthz handler returns { status: "ok" }', async () => {
    const r = await fetch('http://localhost/healthz');
    const body = await r.json();
    expect(body.status).toBe('ok');
  });
});
