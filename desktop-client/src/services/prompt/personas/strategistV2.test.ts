import { describe, expect, it } from 'vitest';
import { buildStrategistPrompt } from './strategistV2';
import type { WorkspaceState } from '@/stores/strategySessionStore';

const baseCtx = {
  strategyName: null as string | null,
  isCommitted: false,
  draftCode: null as string | null,
  draftSymbols: null as string[] | null,
};

describe('buildStrategistPrompt — state-aware sections', () => {
  it.each<[WorkspaceState, RegExp]>([
    ['S0', /STATE: S0 — empty session/],
    ['S1a', /STATE: S1a — code exists/],
    ['S1b', /STATE: S1b — symbols picked/],
    ['S2', /STATE: S2 — both halves complete/],
    ['S3', /STATE: S3 — backtest result available/],
    ['S5', /STATE: S5 — parameter sweep/],
  ])('includes the right guidance block for state %s', (state, re) => {
    const prompt = buildStrategistPrompt({ ...baseCtx, state });
    expect(prompt).toMatch(re);
  });

  it('always includes the output protocol section', () => {
    const p = buildStrategistPrompt({ ...baseCtx, state: 'S0' });
    expect(p).toContain('OUTPUT PROTOCOL');
    expect(p).toContain('```python');
    expect(p).toContain('```symbols');
  });
});

describe('buildStrategistPrompt — workspace state injection', () => {
  it('renders draft_code verbatim when present', () => {
    const p = buildStrategistPrompt({
      ...baseCtx,
      state: 'S1a',
      draftCode: 'class MyStrategy(Strategy):\n    pass',
    });
    expect(p).toContain('--- draft_code ---');
    expect(p).toContain('class MyStrategy(Strategy):');
  });

  it('renders draft_symbols as JSON when present', () => {
    const p = buildStrategistPrompt({
      ...baseCtx,
      state: 'S1b',
      draftSymbols: ['BTC/USDT', 'ETH/USDT'],
    });
    expect(p).toContain('["BTC/USDT","ETH/USDT"]');
  });

  it('shows "(empty)" when fields are null/missing', () => {
    const p = buildStrategistPrompt({ ...baseCtx, state: 'S0' });
    expect(p).toMatch(/--- draft_code ---\s*\(empty\)/);
    expect(p).toMatch(/--- draft_symbols ---\s*\(empty\)/);
  });

  it('reflects strategy name + saved status', () => {
    const p = buildStrategistPrompt({
      ...baseCtx,
      state: 'S3',
      strategyName: 'BTC 均值回归 v1',
      isCommitted: true,
    });
    expect(p).toContain('Strategy name: BTC 均值回归 v1');
    expect(p).toContain('Saved: yes');
  });

  it('includes free-form notes when provided (auto-name hint flow)', () => {
    const p = buildStrategistPrompt({
      ...baseCtx,
      state: 'S2',
      notes: 'NAMING_HINT: please propose a short strategy name in your prose.',
    });
    expect(p).toContain('NAMING_HINT');
  });
});

describe('buildStrategistPrompt — language directive', () => {
  it('adds Chinese directive when replyLang=zh', () => {
    const p = buildStrategistPrompt({ ...baseCtx, state: 'S0', replyLang: 'zh' });
    expect(p).toContain('用简体中文');
  });

  it('omits language directive when replyLang=en', () => {
    const p = buildStrategistPrompt({ ...baseCtx, state: 'S0', replyLang: 'en' });
    expect(p).not.toContain('用简体中文');
  });
});
