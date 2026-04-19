import { describe, it, expect } from 'vitest';
import { clipToRange } from './IndicatorPane';

const pts = [
  { ts: 100, value: 1 },
  { ts: 200, value: 2 },
  { ts: 300, value: 3 },
  { ts: 400, value: 4 },
  { ts: 500, value: 5 },
];

describe('clipToRange', () => {
  it('returns full series when range is null', () => {
    expect(clipToRange(pts, null)).toEqual(pts);
    expect(clipToRange(pts, undefined)).toEqual(pts);
  });

  it('trims both ends to the visible window', () => {
    const out = clipToRange(pts, { from: 200, to: 400 });
    expect(out.map((p) => p.ts)).toEqual([200, 300, 400]);
  });

  it('returns empty when range is entirely before the data', () => {
    const out = clipToRange(pts, { from: 0, to: 50 });
    expect(out).toEqual([]);
  });

  it('returns empty when range is entirely after the data', () => {
    const out = clipToRange(pts, { from: 1000, to: 2000 });
    expect(out).toEqual([]);
  });

  it('keeps the full array when range spans past both ends', () => {
    const out = clipToRange(pts, { from: 0, to: 9999 });
    expect(out.length).toBe(5);
  });

  it('bails out on invalid ranges (from >= to) and returns input unchanged', () => {
    expect(clipToRange(pts, { from: 400, to: 200 })).toEqual(pts);
    expect(clipToRange(pts, { from: 200, to: 200 })).toEqual(pts);
  });

  it('handles empty input without crashing', () => {
    expect(clipToRange([], { from: 100, to: 500 })).toEqual([]);
  });
});
