// Shared output parsers for AI personas that emit structured blocks
// alongside prose (strategist, screener, optimlens-followup).
//
// Each persona's system prompt instructs the model to emit fenced
// blocks with specific tags (e.g. ```json summary``` or ```python```).
// These parsers walk the raw message, pull out the blocks, and return
// a strongly-typed subset. Invalid / missing blocks are non-fatal.

export interface StrategySummary {
  name: string;
  kind?: 'strategy' | 'screener';
  interval?: string;
  symbols?: string[];
  longCondition?: string;
  shortCondition?: string;
  leverage?: number | string;
  params?: Record<string, unknown>;
}

export interface ParsedStrategistOutput {
  /** Prose (everything outside fenced blocks, in order, joined with newlines). */
  prose: string;
  /** Parsed summary from the ```json summary``` block. `null` if missing/invalid. */
  summary: StrategySummary | null;
  /** Extracted Python code (last fenced python block). `null` if absent. */
  code: string | null;
  /** Raw summary string (for debugging / fallback rendering). */
  rawSummary: string | null;
}

// Lang tag is captured greedily but only across the same line (no newline).
// Using [ \t]+ rather than \s+ prevents "python\npass" being swallowed as
// a two-word tag when a fence sits directly after another fence.
const FENCE_RE = /```([A-Za-z0-9_]+(?:[ \t]+[A-Za-z0-9_]+)?)?[ \t]*\n([\s\S]*?)```/g;

function matchesLang(langTag: string | undefined, wanted: string): boolean {
  if (!langTag) return false;
  return langTag.toLowerCase().trim().split(/\s+/).includes(wanted);
}

export function parseStrategistOutput(raw: string): ParsedStrategistOutput {
  let proseParts: string[] = [];
  let summary: StrategySummary | null = null;
  let rawSummary: string | null = null;
  let lastCode: string | null = null;

  let lastIndex = 0;
  // Reset regex state since it's global.
  FENCE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FENCE_RE.exec(raw))) {
    const before = raw.slice(lastIndex, m.index);
    if (before.trim()) proseParts.push(before);
    const langTag = m[1];
    const body = m[2];
    if (matchesLang(langTag, 'python') || matchesLang(langTag, 'py')) {
      lastCode = body.trim();
    } else if (matchesLang(langTag, 'summary') || matchesLang(langTag, 'json')) {
      // Last summary wins — if the model emits multiple, take the final.
      rawSummary = body.trim();
      try {
        const obj = JSON.parse(rawSummary);
        if (obj && typeof obj === 'object' && typeof (obj as { name?: unknown }).name === 'string') {
          summary = obj as StrategySummary;
        }
      } catch {
        // Invalid JSON — summary stays null; prose captures the raw block.
        proseParts.push(before.length ? '' : '');
      }
    }
    // Anything else: leave in prose capture.
    else {
      proseParts.push(`\`\`\`${langTag ?? ''}\n${body}\n\`\`\``);
    }
    lastIndex = m.index + m[0].length;
  }
  const tail = raw.slice(lastIndex);
  if (tail.trim()) proseParts.push(tail);

  return {
    prose: proseParts.join('\n\n').trim(),
    summary,
    code: lastCode,
    rawSummary,
  };
}
