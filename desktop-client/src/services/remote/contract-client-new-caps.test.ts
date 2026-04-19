import { describe, expect, test } from 'vitest';
import { cremote } from './contract-client';

// Smoke tests for the new-capabilities surface. MSW (Node mode) serves
// the committed fixtures from api/examples/ via generated handlers.

describe('cremote — new capabilities (MSW-backed)', () => {
  test('getSymbolMetadata returns metadata bundle', async () => {
    const m = await cremote.getSymbolMetadata({ symbol: 'BTC_USDT' });
    expect(m.symbol).toBe('BTC_USDT');
    expect(m.rank).toBe(1);
    expect(typeof m.last_price).toBe('number');
    expect(m.status).toBe('active');
  });

  test('listStrategyVersions returns paginated list, newest first', async () => {
    const page = await cremote.listStrategyVersions({
      strategy_id: '00000000-0000-0000-0000-000000000001',
      limit: 20,
    });
    expect(Array.isArray(page.items)).toBe(true);
    expect(page.items[0].version).toBeGreaterThan(page.items[page.items.length - 1].version);
    expect(page.items[0]).toHaveProperty('code');
    expect(page.items[0]).toHaveProperty('created_at');
  });

  test('createStrategyVersion returns the new version', async () => {
    const v = await cremote.createStrategyVersion({
      strategy_id: '00000000-0000-0000-0000-000000000001',
      body: { code: 'new code', summary: 'test change' },
    });
    expect(v.version).toBeGreaterThan(0);
    expect(v).toHaveProperty('parent_version');
  });

  test('getStrategyVersion returns a single version', async () => {
    const v = await cremote.getStrategyVersion({
      strategy_id: '00000000-0000-0000-0000-000000000001',
      version: 2,
    });
    expect(v.version).toBe(2);
    expect(v.code).toBeTruthy();
  });

  test('startOptimLens returns pending TaskResponse', async () => {
    const t = await cremote.startOptimLens({
      strategy_id: '00000000-0000-0000-0000-000000000001',
      symbols: ['BTC_USDT'],
      param_grid: { fast: [5, 8, 10], slow: [20, 25, 30] },
    });
    expect(t.status).toBe('pending');
    expect(t.task_id).toBeTruthy();
  });

  test('getOptimLensResult returns done with structured improvements', async () => {
    const r = await cremote.getOptimLensResult({
      task_id: '00000000-0000-0000-0000-000000000030',
    });
    expect(r.status).toBe('done');
    expect(Array.isArray(r.result?.improvements)).toBe(true);
    const imp = r.result?.improvements[0];
    if (imp) {
      expect(imp).toHaveProperty('title');
      expect(imp).toHaveProperty('category');
      expect(imp).toHaveProperty('rationale');
    }
  });

  test('startSignalReview returns pending TaskResponse', async () => {
    const t = await cremote.startSignalReview({ backtest_task_id: 'abc' });
    expect(t.status).toBe('pending');
  });

  test('getSignalReviewResult returns verdicts with summary', async () => {
    const r = await cremote.getSignalReviewResult({
      task_id: '00000000-0000-0000-0000-000000000040',
    });
    expect(r.status).toBe('done');
    expect(r.result?.verdicts.length).toBeGreaterThan(0);
    expect(r.result?.summary).toHaveProperty('good');
    expect(r.result?.summary).toHaveProperty('bad');
  });

  test('explainTrade returns structured narrative + contexts', async () => {
    const r = await cremote.explainTrade({
      backtest_task_id: 'abc',
      symbol: 'BTC_USDT',
      trade_id: '#4',
    });
    expect(r.trade_id).toBe('#4');
    expect(r.narrative.length).toBeGreaterThan(0);
    expect(r.entry_context?.indicators).toBeTruthy();
  });

  test('getEngineStatus returns version + supported arrays', async () => {
    const s = await cremote.getEngineStatus();
    expect(typeof s.version).toBe('string');
    expect(Array.isArray(s.supported_markets)).toBe(true);
    expect(Array.isArray(s.supported_intervals)).toBe(true);
    expect(typeof s.active_tasks).toBe('number');
    expect(typeof s.uptime_seconds).toBe('number');
  });
});
