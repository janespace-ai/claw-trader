import { describe, it, expect } from 'vitest';
import { optimlensSystemPrompt, optimlensIntro } from './optimlens';

const imp = [
  {
    title: 'Tighter stops',
    category: 'risk_mgmt' as const,
    rationale: 'r1',
    expected_delta: { sharpe: 0.2, max_drawdown: -0.02, win_rate: 0.03 },
  },
  {
    title: 'Volume filter',
    category: 'filter' as const,
    rationale: 'r2',
  },
];

describe('optimlensSystemPrompt', () => {
  it('lists improvements with deltas', () => {
    const p = optimlensSystemPrompt({
      strategyName: 'MyStrat',
      improvements: imp,
      baseMetricsSummary: 'Sharpe 1.2 / MaxDD -10%',
      lookbackDays: 180,
    });
    expect(p).toContain('[#1]');
    expect(p).toContain('Tighter stops');
    expect(p).toContain('Δsharpe=0.20');
    expect(p).toContain('Reply in English');
  });

  it('handles empty improvements', () => {
    const p = optimlensSystemPrompt({
      strategyName: 'S',
      improvements: [],
      baseMetricsSummary: '',
      lookbackDays: 180,
    });
    expect(p).toContain('(none yet)');
  });

  it('zh directive', () => {
    const p = optimlensSystemPrompt({
      strategyName: 'S',
      improvements: [],
      baseMetricsSummary: '',
      lookbackDays: 30,
      replyLang: 'zh',
    });
    expect(p).toContain('用简体中文回复');
  });

  it('caps at 20 improvements', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      title: `T${i}`,
      category: 'params' as const,
      rationale: 'r',
    }));
    const p = optimlensSystemPrompt({
      strategyName: 'S',
      improvements: many,
      baseMetricsSummary: '',
      lookbackDays: 180,
    });
    expect(p).toContain('T0');
    expect(p).toContain('T19');
    expect(p).not.toContain('T20');
  });
});

describe('optimlensIntro', () => {
  it('no improvements line', () => {
    expect(
      optimlensIntro({
        strategyName: 'S',
        improvements: [],
        baseMetricsSummary: '',
        lookbackDays: 180,
      }),
    ).toMatch(/no concrete improvements/i);
  });

  it('counts categories', () => {
    const line = optimlensIntro({
      strategyName: 'S',
      improvements: imp,
      baseMetricsSummary: '',
      lookbackDays: 180,
    });
    expect(line).toContain('2 improvements');
    expect(line).toContain('2 categories');
  });
});
