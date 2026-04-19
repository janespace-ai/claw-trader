import { describe, it, expect } from 'vitest';
import {
  applyParamUpdate,
  applyCodeEdit,
  applyImprovement,
  PatchError,
} from './strategyPatcher';

const SAMPLE = `import foo
ema_fast = 20
ema_slow = 50
stop_loss = 0.05
class Strategy:
    def on_bar(self, ctx):
        self.threshold = 0.8
        return ctx.close > ema_fast
`;

describe('applyParamUpdate', () => {
  it('replaces a numeric assignment at module scope', () => {
    const out = applyParamUpdate(SAMPLE, { param_name: 'ema_fast', suggested: 25 });
    expect(out).toContain('ema_fast = 25');
    expect(out).not.toContain('ema_fast = 20');
    expect(out).toContain('ema_slow = 50');
  });

  it('replaces a self.attr assignment inside a class', () => {
    const out = applyParamUpdate(SAMPLE, { param_name: 'threshold', suggested: 0.7 });
    expect(out).toContain('self.threshold = 0.7');
  });

  it('quotes string values', () => {
    const code = 'mode = "long"\n';
    const out = applyParamUpdate(code, { param_name: 'mode', suggested: 'short' });
    expect(out).toContain('mode = "short"');
  });

  it('raises PatchError on pattern miss', () => {
    expect(() =>
      applyParamUpdate(SAMPLE, { param_name: 'nonexistent', suggested: 1 }),
    ).toThrow(PatchError);
  });

  it('raises on missing param_name', () => {
    expect(() =>
      applyParamUpdate(SAMPLE, { param_name: '' as string, suggested: 1 }),
    ).toThrow(PatchError);
  });
});

describe('applyCodeEdit', () => {
  it('applies a single-hunk unified diff', () => {
    const diff = `--- a/strategy.py
+++ b/strategy.py
@@ -3,3 +3,3 @@
 ema_slow = 50
-stop_loss = 0.05
+stop_loss = 0.03
 class Strategy:`;
    const out = applyCodeEdit(SAMPLE, { diff });
    expect(out).toContain('stop_loss = 0.03');
    expect(out).not.toContain('stop_loss = 0.05');
  });

  it('raises conflict when context does not match', () => {
    const diff = `@@ -1,3 +1,3 @@
 not in file
-remove me
+add me`;
    expect(() => applyCodeEdit(SAMPLE, { diff })).toThrow(PatchError);
  });

  it('raises conflict when context matches multiple places', () => {
    const code = 'x = 1\nx = 1\n';
    const diff = `@@ -1,1 +1,1 @@
-x = 1
+x = 2`;
    expect(() => applyCodeEdit(code, { diff })).toThrow(PatchError);
  });

  it('raises invalid_payload when diff is empty', () => {
    expect(() => applyCodeEdit(SAMPLE, { diff: '' })).toThrow(PatchError);
  });
});

describe('applyImprovement dispatch', () => {
  it('routes param_update', () => {
    const out = applyImprovement(SAMPLE, {
      kind: 'param_update',
      payload: { param_name: 'ema_fast', suggested: 30 },
    });
    expect(out).toContain('ema_fast = 30');
  });

  it('throws on unsupported kind', () => {
    expect(() =>
      applyImprovement(SAMPLE, { kind: 'something_else' as unknown as 'param_update' }),
    ).toThrow(PatchError);
  });

  it('throws when suggested_change is undefined', () => {
    expect(() => applyImprovement(SAMPLE, undefined)).toThrow(PatchError);
  });
});
