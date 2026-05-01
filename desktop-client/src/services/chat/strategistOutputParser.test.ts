import { describe, expect, it } from 'vitest';
import { parseStrategistTurn, shouldProposeName } from './strategistOutputParser';

describe('parseStrategistTurn — prose-only response', () => {
  it('returns prose, no mutation, no warnings', () => {
    const r = parseStrategistTurn(
      'Sure! I think a mean-reversion strategy would suit BTC well — buy the dip when RSI < 30.',
    );
    expect(r.mutation).toBeNull();
    expect(r.warnings).toHaveLength(0);
    expect(r.prose).toContain('mean-reversion');
  });

  it('strips empty fenced blocks from prose', () => {
    // Code fence with unknown lang should be silently dropped (we don't
    // echo random fences in the chat bubble).
    const r = parseStrategistTurn(
      'Some prose.\n\n```bash\necho hi\n```\n\nMore prose.',
    );
    expect(r.prose).not.toContain('echo hi');
    expect(r.prose).toContain('Some prose');
    expect(r.prose).toContain('More prose');
    expect(r.mutation).toBeNull();
  });
});

describe('parseStrategistTurn — code mutation', () => {
  it('extracts a python block as kind=code', () => {
    const r = parseStrategistTurn(
      "Here's a draft:\n\n```python\nclass S(Strategy):\n    pass\n```\n",
    );
    expect(r.mutation).toEqual({
      kind: 'code',
      code: 'class S(Strategy):\n    pass',
    });
    expect(r.prose).toContain("Here's a draft");
  });

  it('also accepts `py` lang tag', () => {
    const r = parseStrategistTurn('```py\nx=1\n```');
    expect(r.mutation?.kind).toBe('code');
  });
});

describe('parseStrategistTurn — symbols mutation', () => {
  it('extracts a JSON array of strings', () => {
    const r = parseStrategistTurn(
      'Here are the picks:\n\n```symbols\n["BTC/USDT", "ETH/USDT", "SOL/USDT"]\n```',
    );
    expect(r.mutation).toEqual({
      kind: 'symbols',
      symbols: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
    });
  });

  it('dedupes + filters non-strings', () => {
    const r = parseStrategistTurn(
      '```symbols\n["BTC/USDT", "ETH/USDT", "BTC/USDT", 42, ""]\n```',
    );
    expect(r.mutation).toEqual({
      kind: 'symbols',
      symbols: ['BTC/USDT', 'ETH/USDT'],
    });
  });

  it('drops the block silently if JSON is malformed', () => {
    const r = parseStrategistTurn('```symbols\n[not, valid]\n```');
    expect(r.mutation).toBeNull();
  });

  it('drops empty arrays', () => {
    const r = parseStrategistTurn('```symbols\n[]\n```');
    expect(r.mutation).toBeNull();
  });
});

describe('parseStrategistTurn — symbols-filter mutation', () => {
  it('extracts a screener filter request', () => {
    const r = parseStrategistTurn(
      '```symbols-filter\n{"description": "top 30 by 24h volume", "rule_kind": "top_quote_vol", "params": {"end": 30}}\n```',
    );
    expect(r.mutation?.kind).toBe('filter');
    if (r.mutation?.kind === 'filter') {
      expect(r.mutation.filter.rule_kind).toBe('top_quote_vol');
    }
  });

  it('returns null when required fields missing', () => {
    const r = parseStrategistTurn(
      '```symbols-filter\n{"description": "X"}\n```',
    );
    expect(r.mutation).toBeNull();
  });
});

describe('parseStrategistTurn — at most ONE mutation per turn', () => {
  it('keeps only the first when multiple emitted', () => {
    const r = parseStrategistTurn(
      "Hi.\n\n```python\nx=1\n```\n\nAnd:\n\n```symbols\n[\"BTC/USDT\"]\n```",
    );
    expect(r.mutation?.kind).toBe('code');
    expect(r.warnings.length).toBe(1);
    expect(r.warnings[0]).toMatch(/Ignored extra mutation/);
  });
});

describe('shouldProposeName', () => {
  it('false when name already set', () => {
    expect(shouldProposeName(50, true)).toBe(false);
  });

  it('false when below threshold (≈5 user-AI pairs)', () => {
    expect(shouldProposeName(8, false)).toBe(false);
  });

  it('true at threshold', () => {
    expect(shouldProposeName(10, false)).toBe(true);
    expect(shouldProposeName(15, false)).toBe(true);
  });
});
