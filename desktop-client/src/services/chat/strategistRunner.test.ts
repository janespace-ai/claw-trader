import { describe, expect, it } from 'vitest';
import { sliceHistory } from './strategistRunner';
import type { ChatMessage } from '@/types/domain';

function msg(role: 'user' | 'assistant' | 'system', content: string, ts = 0): ChatMessage {
  return { role, content, ts };
}

describe('sliceHistory — sliding window', () => {
  it('returns the input unchanged when within window', () => {
    const h = [msg('user', 'a'), msg('assistant', 'b')];
    expect(sliceHistory(h, 30)).toEqual(h);
  });

  it('keeps only the most-recent N when over window', () => {
    const h = Array.from({ length: 50 }, (_, i) =>
      msg(i % 2 === 0 ? 'user' : 'assistant', `m${i}`),
    );
    const out = sliceHistory(h, 10);
    expect(out).toHaveLength(10);
    expect(out[0].content).toBe('m40');
    expect(out[9].content).toBe('m49');
  });

  it('returns a copy (not the same array)', () => {
    const h = [msg('user', 'x')];
    const out = sliceHistory(h, 30);
    expect(out).not.toBe(h);
  });

  it('handles n=0 by returning a copy of the full history', () => {
    const h = [msg('user', 'a'), msg('assistant', 'b')];
    expect(sliceHistory(h, 0)).toEqual(h);
  });
});
