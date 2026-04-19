import { describe, it, expect } from 'vitest';
import { signalReviewSystemPrompt, signalReviewIntro } from './signalReview';

const goodVerdict = {
  signal_id: 'sig-1',
  symbol: 'BTC_USDT',
  entry_ts: 1_700_000_000,
  verdict: 'good' as const,
};
const badVerdict = {
  signal_id: 'sig-2',
  symbol: 'ETH_USDT',
  entry_ts: 1_700_100_000,
  verdict: 'bad' as const,
  note: 'entered before confirmation',
};

describe('signalReviewSystemPrompt', () => {
  it('includes the role block and preview context', () => {
    const p = signalReviewSystemPrompt({
      symbols: ['BTC_USDT', 'ETH_USDT'],
      verdicts: [goodVerdict, badVerdict],
      summary: { good: 1, bad: 1 },
      windowLabel: 'last 7 days',
      replyLang: 'en',
    });
    expect(p).toContain('Signal Review');
    expect(p).toContain('PREVIEW CONTEXT');
    expect(p).toContain('BTC_USDT');
    expect(p).toContain('last 7 days');
    expect(p).toContain('Reply in English');
  });

  it('emits Chinese directive when replyLang is zh', () => {
    const p = signalReviewSystemPrompt({
      symbols: [],
      verdicts: [],
      summary: {},
      windowLabel: '7天',
      replyLang: 'zh',
    });
    expect(p).toContain('用简体中文回复');
  });

  it('handles empty verdict list gracefully', () => {
    const p = signalReviewSystemPrompt({
      symbols: [],
      verdicts: [],
      summary: {},
      windowLabel: 'today',
    });
    expect(p).toContain('(none produced yet)');
    expect(p).toContain('(pending)');
  });

  it('caps verdict list at 40 entries', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      ...goodVerdict,
      signal_id: `sig-${i}`,
    }));
    const p = signalReviewSystemPrompt({
      symbols: ['BTC_USDT'],
      verdicts: many,
      summary: { good: 60 },
      windowLabel: 'x',
    });
    expect(p).toContain('sig-0');
    expect(p).toContain('sig-39');
    expect(p).not.toContain('sig-40');
  });
});

describe('signalReviewIntro', () => {
  it('states when no verdicts are present', () => {
    const line = signalReviewIntro({
      symbols: [],
      verdicts: [],
      summary: {},
      windowLabel: 'x',
    });
    expect(line).toMatch(/No verdicts/);
  });

  it('celebrates a clean run', () => {
    const line = signalReviewIntro({
      symbols: ['BTC_USDT'],
      verdicts: [goodVerdict],
      summary: { good: 1 },
      windowLabel: 'x',
    });
    expect(line).toMatch(/None look suspicious/);
  });

  it('flags bad and questionable counts', () => {
    const line = signalReviewIntro({
      symbols: ['BTC_USDT'],
      verdicts: [goodVerdict, badVerdict],
      summary: { good: 1, bad: 1 },
      windowLabel: 'x',
    });
    expect(line).toMatch(/1 worth a second look/);
    expect(line).toMatch(/1 bad/);
  });
});
