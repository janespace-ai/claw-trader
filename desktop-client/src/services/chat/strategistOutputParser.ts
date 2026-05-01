// Output parser for the state-aware strategist persona.
//
// Extracts AT MOST ONE mutation block from the AI's response:
//   · ```python``` → kind: 'code'
//   · ```symbols``` → kind: 'symbols'
//   · ```symbols-filter``` → kind: 'filter' (asks the system to run a screener)
//
// If the AI emits multiple, only the FIRST is honored — the rest are
// surfaced as a parsing warning so the chat can show "AI emitted two
// mutations; only the first was applied".

export type StrategistMutation =
  | { kind: 'code'; code: string }
  | { kind: 'symbols'; symbols: string[] }
  | { kind: 'filter'; filter: ScreenerFilter }
  | { kind: 'param-sweep'; sweep: ParamSweepRequest };

/** Param sweep request — emitted by AI as ```optimize\n{...}``` block,
 *  OR detected heuristically from natural-language ("试 RSI 14, 21, 28")
 *  via the {@link parseNaturalLanguageParamSweep} helper. */
export interface ParamSweepRequest {
  /** Parameter name → list of values to try. */
  axes: Record<string, number[]>;
  /** Optional human-readable description (for chat status display). */
  description?: string;
}

export interface ScreenerFilter {
  description: string;
  rule_kind: string;
  params: Record<string, unknown>;
}

export interface ParsedTurn {
  /** Prose with all fenced blocks stripped out. */
  prose: string;
  /** First mutation found in the response (or null). */
  mutation: StrategistMutation | null;
  /** Non-fatal warnings (e.g. "AI emitted 2 mutations"). */
  warnings: string[];
}

const FENCE_RE = /```([A-Za-z0-9_-]+)\n([\s\S]*?)```/g;

export function parseStrategistTurn(raw: string): ParsedTurn {
  const warnings: string[] = [];
  const proseParts: string[] = [];
  let mutation: StrategistMutation | null = null;

  let lastIndex = 0;
  FENCE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = FENCE_RE.exec(raw)) !== null) {
    if (m.index > lastIndex) {
      proseParts.push(raw.slice(lastIndex, m.index));
    }
    const lang = (m[1] ?? '').toLowerCase().trim();
    const body = m[2] ?? '';

    const candidate = parseBlock(lang, body);

    if (candidate) {
      if (mutation == null) {
        mutation = candidate;
      } else {
        warnings.push(
          `Ignored extra mutation block (lang="${lang}") — only the first per turn applies.`,
        );
      }
    }
    // Anything we don't recognise (or that fails to parse): drop it
    // silently from the prose stream rather than echoing the raw fence.

    lastIndex = m.index + m[0].length;
  }

  if (lastIndex < raw.length) {
    proseParts.push(raw.slice(lastIndex));
  }

  const prose = proseParts.join('').trim();
  return { prose, mutation, warnings };
}

function parseBlock(lang: string, body: string): StrategistMutation | null {
  switch (lang) {
    case 'python':
    case 'py':
      return { kind: 'code', code: body.trim() };

    case 'symbols': {
      const arr = safeParseJSONArray(body);
      if (!arr) return null;
      // Coerce: strings only, dedupe, drop empties.
      const out: string[] = [];
      const seen = new Set<string>();
      for (const v of arr) {
        if (typeof v === 'string') {
          const s = v.trim();
          if (s && !seen.has(s)) {
            out.push(s);
            seen.add(s);
          }
        }
      }
      return out.length > 0 ? { kind: 'symbols', symbols: out } : null;
    }

    case 'symbols-filter': {
      try {
        const obj = JSON.parse(body) as Partial<ScreenerFilter>;
        if (
          typeof obj.description === 'string' &&
          typeof obj.rule_kind === 'string' &&
          typeof obj.params === 'object'
        ) {
          return {
            kind: 'filter',
            filter: {
              description: obj.description,
              rule_kind: obj.rule_kind,
              params: obj.params as Record<string, unknown>,
            },
          };
        }
        return null;
      } catch {
        return null;
      }
    }

    case 'optimize':
    case 'optimization': {
      try {
        const obj = JSON.parse(body) as {
          axes?: Record<string, unknown>;
          description?: string;
        };
        const axes = sanitizeAxes(obj.axes);
        if (!axes) return null;
        return {
          kind: 'param-sweep',
          sweep: {
            axes,
            description: typeof obj.description === 'string' ? obj.description : undefined,
          },
        };
      } catch {
        return null;
      }
    }

    default:
      return null;
  }
}

/** Coerce + validate a Record<string, unknown> into Record<string, number[]>.
 *  Drops axes whose values aren't all finite numbers, drops empty arrays,
 *  caps each axis at 20 values to match server-side PARAM_GRID_TOO_LARGE. */
function sanitizeAxes(raw: unknown): Record<string, number[]> | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(v)) continue;
    const nums: number[] = [];
    for (const x of v) {
      if (typeof x === 'number' && Number.isFinite(x)) nums.push(x);
      else if (typeof x === 'string') {
        const n = Number(x);
        if (Number.isFinite(n)) nums.push(n);
      }
      if (nums.length >= 20) break;
    }
    if (nums.length > 0) out[k] = nums;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function safeParseJSONArray(raw: string): unknown[] | null {
  try {
    const parsed = JSON.parse(raw.trim());
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// ---- Naming heuristic ----

/**
 * Auto-name candidate generator.  After ~5 user-AI exchanges with no
 * name, the AI is supposed to suggest a name.  We don't actually call
 * the AI for the name — we just check whether enough turns have
 * passed and return whether a name proposal is due.
 */
export function shouldProposeName(messageCount: number, hasName: boolean): boolean {
  if (hasName) return false;
  // 5 user-AI pairs ≈ 10 messages.  Threshold tunable.
  return messageCount >= 10;
}

// ---- Natural-language param sweep detection ------------------------

/**
 * Detect a "试 X N1, N2, N3" pattern in raw user text and return a
 * structured ParamSweepRequest if matched.  Used by the workspace screen
 * BEFORE sending to the LLM so simple grid-test asks don't burn AI
 * tokens.  Returns null if the message doesn't look like a sweep ask.
 *
 * Patterns recognised (case-insensitive):
 *   - "试 RSI 14, 21, 28"          (Chinese)
 *   - "试一下 RSI 14, 21, 28"
 *   - "try RSI 14, 21, 28"         (English)
 *   - "test RSI 14, 21, 28"
 *
 * Multiple-axis form ("试 RSI 14,21,28 和 SMA 10,20,50") parses each
 * axis independently and returns them in the same axes map.
 */
export function parseNaturalLanguageParamSweep(text: string): ParamSweepRequest | null {
  // Strip whitespace and normalise commas (Chinese full-width to ASCII).
  const t = text.replace(/，/g, ',').replace(/\s+/g, ' ').trim();
  // Quick gate: must START with a "try-like" verb.  We avoid `\b`
  // because JS regex word-boundary doesn't recognise CJK runs as
  // word edges, so `^试\b` would never match on "试 RSI ...".
  if (!/^(?:试(?:一?下?)?|try|test)\s/i.test(t)) return null;

  // Match each occurrence of "<NAME> <num>, <num>, ..." (≥ 2 numbers).
  // Anchor name to either start-of-string OR a non-alphanumeric char so
  // a Chinese verb like "试 " counts as a valid prefix.
  const re = /(?:^|[^A-Za-z0-9_])([A-Za-z][A-Za-z0-9_]*)\s+((?:-?\d+(?:\.\d+)?\s*,\s*){1,}-?\d+(?:\.\d+)?)/g;
  const axes: Record<string, number[]> = {};
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const name = m[1].toLowerCase();
    // Skip the leading verb itself ("try" / "test") if it captured.
    if (name === 'try' || name === 'test') continue;
    const raw = m[2];
    const nums = raw
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
    if (nums.length >= 2) {
      axes[name] = nums.slice(0, 20);
    }
  }

  if (Object.keys(axes).length === 0) return null;
  return { axes, description: text.trim().slice(0, 80) };
}

/**
 * Validate sweep axes against a strategy's `params_schema`.  Returns:
 *   - { ok: true } when every axis name is in the schema (or schema empty)
 *   - { ok: false, unknownAxes: [...] } otherwise
 *
 * params_schema has shape `{ rsi: {default: 14}, sma: {default: 20}, ... }`
 * — we just compare against the top-level keys (case-insensitive).
 */
export function validateSweepAgainstSchema(
  sweep: ParamSweepRequest,
  paramsSchema: Record<string, unknown> | null | undefined,
): { ok: true } | { ok: false; unknownAxes: string[] } {
  if (!paramsSchema || Object.keys(paramsSchema).length === 0) return { ok: true };
  const known = new Set(Object.keys(paramsSchema).map((k) => k.toLowerCase()));
  const unknown = Object.keys(sweep.axes)
    .map((k) => k.toLowerCase())
    .filter((k) => !known.has(k));
  return unknown.length === 0 ? { ok: true } : { ok: false, unknownAxes: unknown };
}
