/**
 * Top-level routing type for the desktop-client.
 *
 * `AppRoute` is a discriminated union of every route kind the app can
 * be in. Workspace sub-state (design / preview / deep) lives separately
 * in `workspaceStore.mode` to keep the main route small.
 */
export type AppRoute =
  | { kind: 'screener' }
  | { kind: 'strategies' }
  | { kind: 'workspace'; strategyId?: string }
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
 * Legacy tab names for backward compat during the migration. The
 * `currentTab` derived getter maps an `AppRoute` to the old flat
 * string so existing code paths continue to compile.
 */
export type LegacyTab = 'screener' | 'strategies' | 'backtest';

export function routeToLegacyTab(route: AppRoute): LegacyTab | null {
  if (route.kind === 'screener') return 'screener';
  if (route.kind === 'strategies') return 'strategies';
  if (route.kind === 'workspace') return 'backtest';
  return null;
}
