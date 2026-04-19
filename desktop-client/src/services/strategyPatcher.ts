// Applies a single OptimLens improvement to existing strategy code.
// Two payload kinds today:
//
//   - param_update: `{ param_name, suggested, current? }`. A regex walks
//     lines of the form `param_name = <number>` and replaces the RHS.
//     If no match is found we throw — surfaces to the UI as a toast
//     rather than silently writing a broken version.
//
//   - code_edit: `{ diff }` — naïve unified-diff applier. Supports only
//     single-hunk patches with stable @@ headers. Anything fancier
//     throws `code_edit_conflict` so the user can hand-apply.
//
// These patchers are deliberately minimal; OptimLens improvements are
// usually 1-2 lines. More complex edits should be expressed as
// `rationale` narrative + left for the user to apply via the
// strategist chat.

export interface ParamUpdatePayload {
  param_name: string;
  current?: number | string;
  suggested: number | string;
}

export interface CodeEditPayload {
  diff: string;
}

export class PatchError extends Error {
  constructor(message: string, public reason: 'pattern_miss' | 'conflict' | 'invalid_payload') {
    super(message);
  }
}

/**
 * Replaces the RHS of a `<param_name> = <value>` assignment.
 * Supports:
 *   foo = 10
 *   foo=10
 *   foo = 10  # comment  → rewrites value, preserves comment
 *   self.foo = 10        → matches too (useful inside class defs)
 * Does NOT support named params inside function signatures today.
 */
export function applyParamUpdate(code: string, payload: ParamUpdatePayload): string {
  if (!payload.param_name) {
    throw new PatchError('param_name missing', 'invalid_payload');
  }
  const esc = payload.param_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `^(\\s*(?:self\\.)?${esc}\\s*=\\s*)([0-9]+(?:\\.[0-9]+)?|"[^"]*"|'[^']*')(\\s*(?:#.*)?)$`,
    'gm',
  );
  let matched = false;
  const replacement = formatValue(payload.suggested);
  const next = code.replace(re, (_m, prefix: string, _old: string, suffix: string) => {
    matched = true;
    return `${prefix}${replacement}${suffix}`;
  });
  if (!matched) {
    throw new PatchError(
      `No assignment found for param "${payload.param_name}"`,
      'pattern_miss',
    );
  }
  return next;
}

function formatValue(v: number | string): string {
  if (typeof v === 'number') return String(v);
  // Quote strings with double quotes if no inner double quote.
  if (v.includes('"')) return `'${v.replace(/'/g, "\\'")}'`;
  return `"${v}"`;
}

/**
 * Applies a unified-diff patch. Expected shape (newline-delimited):
 *
 *   --- a/strategy.py
 *   +++ b/strategy.py
 *   @@ -10,3 +10,3 @@
 *    ctx.buy_if(...)
 *   -stop_loss = 0.05
 *   +stop_loss = 0.03
 *    ctx.sell_if(...)
 *
 * Context lines (leading space) must match exactly for the hunk to
 * apply. Anything else throws `conflict`.
 */
export function applyCodeEdit(code: string, payload: CodeEditPayload): string {
  const diff = payload.diff ?? '';
  if (!diff.trim()) throw new PatchError('empty diff', 'invalid_payload');

  const lines = diff.split('\n');
  // Find the @@ header; ignore file header lines.
  const hunkIdx = lines.findIndex((l) => /^@@/.test(l));
  if (hunkIdx === -1) throw new PatchError('no hunk header', 'invalid_payload');
  const body = lines.slice(hunkIdx + 1);

  // Build `want` (context + removed lines) and `replacement` (context + added).
  const want: string[] = [];
  const replacement: string[] = [];
  for (const line of body) {
    if (line.startsWith('-') && !line.startsWith('---')) {
      want.push(line.slice(1));
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      replacement.push(line.slice(1));
    } else if (line.startsWith(' ')) {
      want.push(line.slice(1));
      replacement.push(line.slice(1));
    }
    // Blank / other lines are ignored (trailing newline, "No newline" markers, etc.)
  }
  if (want.length === 0) throw new PatchError('empty hunk', 'invalid_payload');

  const wantText = want.join('\n');
  const idx = code.indexOf(wantText);
  if (idx === -1) {
    throw new PatchError('hunk context did not match', 'conflict');
  }
  // Refuse patches that match in multiple places — ambiguous.
  if (code.indexOf(wantText, idx + 1) !== -1) {
    throw new PatchError('hunk context matches multiple locations', 'conflict');
  }

  return code.slice(0, idx) + replacement.join('\n') + code.slice(idx + wantText.length);
}

/** Entry point used by the UI: dispatches on improvement.suggested_change.kind. */
export function applyImprovement(
  code: string,
  suggested: { kind?: 'param_update' | 'code_edit'; payload?: { [key: string]: unknown } } | undefined,
): string {
  if (!suggested) throw new PatchError('no suggested_change', 'invalid_payload');
  if (suggested.kind === 'param_update') {
    return applyParamUpdate(code, suggested.payload as unknown as ParamUpdatePayload);
  }
  if (suggested.kind === 'code_edit') {
    return applyCodeEdit(code, suggested.payload as unknown as CodeEditPayload);
  }
  throw new PatchError(`unsupported kind: ${suggested.kind}`, 'invalid_payload');
}
