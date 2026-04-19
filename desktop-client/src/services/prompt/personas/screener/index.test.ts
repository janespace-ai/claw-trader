import { describe, it, expect } from 'vitest';
import { screenerSystemPrompt } from './index';

describe('screenerSystemPrompt', () => {
  it('renders market + lookback into the context block', () => {
    const p = screenerSystemPrompt({ market: 'futures', lookbackDays: 90 });
    expect(p).toContain('Market: futures');
    expect(p).toContain('Lookback: 90 days');
    expect(p).toContain('def screen(ctx)');
  });

  it('respects replyLang=zh', () => {
    const p = screenerSystemPrompt({ market: 'futures', lookbackDays: 30, replyLang: 'zh' });
    expect(p).toContain('用简体中文回复');
  });

  it('defaults to English directive', () => {
    const p = screenerSystemPrompt({ market: 'futures', lookbackDays: 30 });
    expect(p).toContain('Reply in English');
  });
});
