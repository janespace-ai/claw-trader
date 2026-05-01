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
  | { kind: 'filter'; filter: ScreenerFilter };

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

    default:
      return null;
  }
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
