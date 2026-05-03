// Lightweight feature-flag layer for the desktop client.
//
// Flags persist via window.claw.db.settings (SQLite key:value store)
// under the prefix `flag:`.  All flags ship with a sensible default —
// missing keys behave as "default off" or "default on" depending on
// what's safer.
//
// This is the rollout primitive for unified-strategy-workspace's
// Group 13.  When confident, flip a default to true and remove the
// flag from this map.
//
// Telemetry hook: every flag read records an evaluation event so
// product can see real adoption in the wild (today the recorder is a
// console.log; replace with a real analytics sink when one exists).

const DEFAULTS: Record<string, boolean> = {
  /** Master switch for the new chat-driven workspace + library tabs.
   *  Default: true — Phase A keeps it on.  Set to false (in client
   *  Settings or via window.__claw.featureFlags.set) for an emergency
   *  fallback to the legacy ScreenerScreen / StrategiesScreen / etc.
   *  (which don't exist in this codebase any more — fallback would be
   *  the rebuild placeholder).  Real "true rollback" is a code revert. */
  unifiedWorkspace: true,
  /** Auto-fire backtest the first time both halves of the draft become
   *  present.  Off-by-default would force the user to click 运行回测,
   *  which we may want during a controlled rollout. */
  autoBacktestOnComplete: true,
  /** Prepend NL "试 X N1, N2, N3" detection to the strategist input
   *  pipeline (Group 8).  Off-by-default forces all sweeps through the
   *  LLM, which is more flexible but slower. */
  nlParamSweepIntercept: true,
  /** Workspace-three-zone-layout: render the new three-zone workspace
   *  (left=universe / center=K-line+tabs / right=chat).  Default true
   *  in dev, false in prod for the rollout window.  See proposal at
   *  openspec/changes/workspace-three-zone-layout/. */
  workspaceThreeZone:
    typeof process !== 'undefined' && process.env?.NODE_ENV === 'production'
      ? false
      : true,
};

export type FlagKey = keyof typeof DEFAULTS;

interface FlagsAPI {
  get: (k: string) => Promise<unknown>;
  set: (k: string, v: unknown) => Promise<void>;
}

function dbAPI(): FlagsAPI | null {
  const db = (typeof window !== 'undefined' ? window.claw?.db : undefined) as
    | { settings?: FlagsAPI }
    | undefined;
  return db?.settings ?? null;
}

/** Read a flag.  Returns the default when SQLite isn't available
 *  (e.g. in vitest environments). */
export async function readFlag(k: FlagKey): Promise<boolean> {
  const api = dbAPI();
  const def = DEFAULTS[k];
  if (!api) return def;
  try {
    const v = await api.get(`flag:${k}`);
    if (typeof v === 'boolean') {
      reportFlagEvaluation(k, v, 'set');
      return v;
    }
    reportFlagEvaluation(k, def, 'default');
    return def;
  } catch {
    return def;
  }
}

/** Write a flag.  No-op if SQLite isn't available. */
export async function writeFlag(k: FlagKey, value: boolean): Promise<void> {
  const api = dbAPI();
  if (!api) return;
  try {
    await api.set(`flag:${k}`, value);
  } catch {
    // best-effort
  }
}

/** Synchronous read — returns the default.  Useful when you can't
 *  await (e.g. inside a render path).  Pair with an async load on
 *  app boot that hydrates a zustand store from SQLite. */
export function readFlagSync(k: FlagKey): boolean {
  return DEFAULTS[k];
}

// ---- Telemetry stubs --------------------------------------------------

interface TelemetryEvent {
  ts: number;
  event: string;
  props: Record<string, unknown>;
}

const TELEMETRY: TelemetryEvent[] = [];

/** Record a structured event — flag evaluation, save, auto-backtest fire,
 *  diff rejection, etc.  Today writes to an in-memory ring + console;
 *  replace the implementation when a real analytics sink lands.
 *
 *  Public so screens can call it directly:
 *    recordEvent('strategy_save_overwrite', { strategy_id })
 *    recordEvent('auto_backtest_fired',     { strategy_id })
 *    recordEvent('diff_rejected',           { mutation_kind })
 */
export function recordEvent(event: string, props: Record<string, unknown> = {}): void {
  const e: TelemetryEvent = { ts: Date.now(), event, props };
  TELEMETRY.push(e);
  if (TELEMETRY.length > 500) TELEMETRY.shift();
  if (typeof console !== 'undefined' && console.debug) {
    console.debug('[telemetry]', event, props);
  }
}

function reportFlagEvaluation(k: FlagKey, value: boolean, source: 'set' | 'default') {
  recordEvent('feature_flag_evaluation', { flag: k, value, source });
}

/** Read-only access to the current event ring — used by tests + the
 *  /healthz debug page.  Returns a copy so callers can't mutate. */
export function getRecentTelemetry(): TelemetryEvent[] {
  return TELEMETRY.slice();
}
