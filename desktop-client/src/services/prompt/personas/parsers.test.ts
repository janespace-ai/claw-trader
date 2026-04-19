import { describe, it, expect } from 'vitest';
import { parseStrategistOutput } from './parsers';

describe('parseStrategistOutput', () => {
  it('extracts summary + python code from a well-formed response', () => {
    const raw = [
      'Here is a momentum strategy tuned for BTC/USDT on 1h.',
      '',
      '```json summary',
      JSON.stringify({
        name: 'BTC Momentum',
        interval: '1h',
        longCondition: 'close > ema(close, 50)',
        params: { ema_fast: 20, ema_slow: 50 },
      }),
      '```',
      '',
      '```python',
      'def strategy(ctx):',
      '    return ctx.close > ctx.ema(50)',
      '```',
    ].join('\n');

    const parsed = parseStrategistOutput(raw);
    expect(parsed.summary).not.toBeNull();
    expect(parsed.summary?.name).toBe('BTC Momentum');
    expect(parsed.summary?.interval).toBe('1h');
    expect(parsed.summary?.params).toEqual({ ema_fast: 20, ema_slow: 50 });
    expect(parsed.code).toContain('def strategy(ctx):');
    expect(parsed.prose).toContain('Here is a momentum strategy');
  });

  it('returns null summary when JSON is invalid', () => {
    const raw = [
      '```json summary',
      '{ not valid json',
      '```',
      '```python',
      'pass',
      '```',
    ].join('\n');
    const parsed = parseStrategistOutput(raw);
    expect(parsed.summary).toBeNull();
    expect(parsed.code).toBe('pass');
  });

  it('returns null summary + null code when neither block is present', () => {
    const raw = 'Just prose, no fenced blocks.';
    const parsed = parseStrategistOutput(raw);
    expect(parsed.summary).toBeNull();
    expect(parsed.code).toBeNull();
    expect(parsed.prose).toBe('Just prose, no fenced blocks.');
  });

  it('accepts ```json``` tag as fallback for summary when JSON has a name', () => {
    const raw = [
      '```json',
      JSON.stringify({ name: 'FB', interval: '15m' }),
      '```',
    ].join('\n');
    const parsed = parseStrategistOutput(raw);
    expect(parsed.summary?.name).toBe('FB');
  });

  it('picks the last python block when multiple are present', () => {
    const raw = [
      '```python',
      'first = True',
      '```',
      '```python',
      'second = True',
      '```',
    ].join('\n');
    const parsed = parseStrategistOutput(raw);
    expect(parsed.code).toBe('second = True');
  });

  it('preserves non-summary, non-python fences in prose', () => {
    const raw = [
      'Shell preview:',
      '```bash',
      'echo hi',
      '```',
      '```python',
      'pass',
      '```',
    ].join('\n');
    const parsed = parseStrategistOutput(raw);
    expect(parsed.prose).toContain('```bash');
    expect(parsed.prose).toContain('echo hi');
    expect(parsed.code).toBe('pass');
  });
});
