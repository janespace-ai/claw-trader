/**
 * Top-level routing type for the desktop-client.
 *
 * Post unified-strategy-workspace, the tab order is:
 *   - workspace : 创建/编辑策略 (DEFAULT — chat-driven strategy session)
 *   - library   : 策略库 (saved/draft strategy list, conversation-style)
 *   - settings
 *
 * Plus drill-down surfaces (no top-level tab):
 *   - symbol-detail   : opens from S3 result table per-symbol click
 *   - workspace.deep  : "View full report" backed by the legacy
 *                       deep-backtest screen (workspaceStore.mode = 'deep')
 *
 * `kind: 'screener'` is REMOVED — the screener's job is now performed
 * inside the workspace's AI chat (the strategist persona generates a
 * Screener Python program, runs it, and writes the resulting symbols
 * into the active strategy's draft_symbols).
 */
export type AppRoute =
  | { kind: 'workspace'; strategyId?: string }
  | { kind: 'library' }
  | {
      kind: 'symbol-detail';
      symbol: string;
      /** Where to return to when the user clicks back. */
      returnTo: AppRoute;
      /** Which backtest this symbol was drilled-into from, if any. */
      backtestTaskId?: string;
    }
  | { kind: 'settings'; section?: string };

/**
 * Legacy tab names — kept JUST for the persisted-route fallback in
 * `appStore` (a v0 user with `last_route = 'screener'` in localStorage
 * gets silently redirected to the workspace tab on first launch).
 * No code should produce these strings going forward.
 */
export type LegacyTab = 'screener' | 'strategies' | 'backtest' | 'workspace' | 'library' | 'settings';

export function routeToLegacyTab(route: AppRoute): LegacyTab | null {
  if (route.kind === 'workspace') return 'workspace';
  if (route.kind === 'library') return 'library';
  return null;
}

/** Migration helper: converts a legacy tab string (read from
 *  localStorage on first boot after upgrade) into the current AppRoute.
 *  Anything unrecognised → workspace (the new default). */
export function legacyTabToRoute(tab: string | null | undefined): AppRoute {
  switch (tab) {
    case 'library':
    case 'strategies':
      return { kind: 'library' };
    case 'settings':
      return { kind: 'settings' };
    case 'workspace':
    case 'backtest':
    case 'screener':
    default:
      return { kind: 'workspace' };
  }
}
