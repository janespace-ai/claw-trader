// Drives the "chat → AI generates code → auto-run backend screener → left
// panel shows picks" flow. No user click in between.
//
// Split into two pure pieces (extraction, detection) that are easy to
// unit-test, and one impure driver (runScreenerFromCode) that talks to
// the real backend via the existing `remote` client.

import { remote } from '@/services/remote/client';
import type { ScreenerRowResult } from '@/types/domain';

/** Extract the LAST fenced Python code block from a free-form message.
 *  Returns `null` if none found. */
export function extractPythonCode(message: string): string | null {
  // Greedy on content, matches ```python / ```py / ``` (no lang).
  const fence = /```(python|py)?\s*\n([\s\S]*?)```/gi;
  let last: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(message))) {
    last = m[2];
  }
  return last?.trim() || null;
}

/** Heuristic: does this code look like a screener (as opposed to a
 *  strategy or unrelated snippet)? */
export function looksLikeScreener(code: string): boolean {
  if (/from\s+claw\.screener\s+import/.test(code)) return true;
  if (/class\s+\w+\s*\(\s*Screener\s*\)/.test(code)) return true;
  // Fall back to "has a `filter` method that takes the screener signature"
  if (/def\s+filter\s*\(\s*self[^)]*symbol[^)]*\)/.test(code)) return true;
  return false;
}

export type RunState =
  | { phase: 'idle' }
  | { phase: 'running'; taskId: string }
  | { phase: 'done'; matched: number; total: number; symbols: string[]; results: ScreenerRowResult[] }
  | { phase: 'failed'; error: string };

export interface RunOptions {
  /** Market to screen. Defaults to 'futures' — the aggregator's primary market. */
  market?: string;
  /** Lookback window passed through to the backend. Defaults to 365. */
  lookbackDays?: number;
  /** Per-poll interval in ms. Defaults to 1500. */
  pollIntervalMs?: number;
  /** Max number of polls before giving up. Defaults to 120 (≈3 min). */
  maxPolls?: number;
  /** Called on each state transition so the UI can show progress. */
  onUpdate?: (state: RunState) => void;
  /** Optional abort signal. */
  signal?: AbortSignal;
}

/** Drives one screener run: starts the backend task, polls until terminal,
 *  returns the final RunState. Never throws — failures become
 *  `{ phase: 'failed' }`. */
export async function runScreenerFromCode(code: string, opts: RunOptions = {}): Promise<RunState> {
  const {
    market = 'futures',
    lookbackDays = 365,
    pollIntervalMs = 1500,
    maxPolls = 120,
    onUpdate = () => {},
    signal,
  } = opts;

  const emit = (s: RunState): RunState => {
    onUpdate(s);
    return s;
  };

  let start: Awaited<ReturnType<typeof remote.startScreener>>;
  try {
    start = await remote.startScreener({
      code,
      config: { market, lookback_days: lookbackDays },
    });
  } catch (err: unknown) {
    return emit({ phase: 'failed', error: describe(err) });
  }

  emit({ phase: 'running', taskId: start.task_id });

  for (let attempts = 0; attempts < maxPolls; attempts++) {
    if (signal?.aborted) {
      return emit({ phase: 'failed', error: 'aborted' });
    }
    // `error` can be a plain string (legacy) or the canonical
    // `{ code, message }` body (contract). Type reflects both so the
    // describe() path below normalizes either shape to a string.
    let poll: {
      status?: string;
      error?: string | { code?: string; message?: string };
      result?: { results?: ScreenerRowResult[] };
    };
    try {
      poll = (await remote.screenerResult(start.task_id)) as typeof poll;
    } catch (err: unknown) {
      return emit({ phase: 'failed', error: describe(err) });
    }

    if (poll?.status === 'done') {
      const results = (poll.result?.results ?? []) as ScreenerRowResult[];
      const matched = results.filter((r) => r.passed);
      return emit({
        phase: 'done',
        matched: matched.length,
        total: results.length,
        symbols: matched.map((r) => r.symbol),
        results,
      });
    }
    if (poll?.status === 'failed') {
      return emit({ phase: 'failed', error: describe(poll.error) || 'screener failed' });
    }
    await sleep(pollIntervalMs);
  }
  return emit({ phase: 'failed', error: 'timeout' });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function describe(err: unknown): string {
  if (err == null) return '';
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  // Canonical API error body: `{ code, message }`. Preserve both so the
  // status row reads "INTERNAL_ERROR: <msg>" rather than "[object Object]".
  if (typeof err === 'object') {
    const b = err as { code?: unknown; message?: unknown };
    const msg = typeof b.message === 'string' ? b.message : '';
    const code = typeof b.code === 'string' ? b.code : '';
    if (code && msg) return `${code}: ${msg}`;
    if (msg) return msg;
    if (code) return code;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}
