## 1. Prereqs

- [x] 1.1 `ui-foundation` landed.
- [x] 1.2 `api-contract-new-capabilities` provides `cremote.listStrategyVersions`, `createStrategyVersion`, `getStrategyVersion`.

## 2. Strategy history persona

- [x] 2.1 Create `src/services/prompt/personas/strategyHistory.ts` — minimal (no real chat; persona is rendered as a list, not a conversation).
- [x] 2.2 Register `strategy-history` in `AIPersonaShell.personas` with Composer hidden.

## 3. StrategyCard component

- [x] 3.1 Create `src/components/strategy/StrategyCard.tsx`.
- [x] 3.2 Background fetch: on mount, call `cremote.listBacktestHistory({ strategy_id, limit: 1 })` → set mini chart data.
- [x] 3.3 Render: header (name, version chip, favorite star), middle (ClawChart.Mini or "No backtests yet"), footer (return pct, params summary).
- [x] 3.4 Three-dot menu: Duplicate / Archive.
- [x] 3.5 Favorite star: stopPropagation click handler.

## 4. StrategiesScreen

- [x] 4.1 Create `src/screens/StrategiesScreen.tsx` using `WorkspaceShell`.
- [x] 4.2 Topbar: `StrategiesTopbar.tsx` with title, search input, New Strategy CTA.
- [x] 4.3 Main grid: `StrategiesGrid.tsx` loads via `strategyStore.load()`, renders cards, applies active tab + search filter.
- [x] 4.4 Tabs: `All / Favorites / Active / Archived` — purely client-side filters.
- [x] 4.5 RightRail: `<AIPersonaShell persona="strategy-history" context={{ strategyId: selectedId }} />`.

## 5. Strategy history panel

- [x] 5.1 `src/components/strategy/StrategyHistoryPanel.tsx` — lists versions.
- [x] 5.2 `VersionItem.tsx` — v chip + summary + timestamp + fork badge + Revert/Duplicate buttons.
- [x] 5.3 RevertDialog — confirm dialog, calls `cremote.createStrategyVersion` with old code + summary "Revert to v{N}".
- [x] 5.4 DuplicateAndImprove — creates new strategy + navigates.

## 6. strategyStore extensions

- [x] 6.1 Add `listVersions(strategyId)` action.
- [x] 6.2 Add `createVersion(strategyId, code, summary?, parent_version?)` action.
- [x] 6.3 Add `revertTo(strategyId, version)` action — composed of fetch + createVersion.
- [x] 6.4 Add `selectedId: string | null` state + `select(id)` action.
- [x] 6.5 Vitest for each action.

## 7. Route wiring + deletion

- [x] 7.1 `App.tsx`: `route.kind === "strategies"` → `<StrategiesScreen />`.
- [x] 7.2 Delete `src/pages/StrategiesPage.tsx`.
- [x] 7.3 Update TopBar "Strategies" tab → `navigate({ kind: "strategies" })` (unchanged from `ui-foundation`).

## 8. Card actions — end-to-end

- [x] 8.1 Open card → Workspace Design with strategyId loaded.
- [x] 8.2 Duplicate card → new strategy record, navigates.
- [x] 8.3 Archive card → toggle status, remove from Active tab (optimistic).
- [x] 8.4 Favorite card → toggle is_favorite (optimistic).
- [x] 8.5 Error paths: toast + rollback.

## 9. Tests

- [x] 9.1 `e2e/visual/strategy-management.spec.ts` with 5 baselines.
- [x] 9.2 Vitest: `screens/StrategiesScreen.test.tsx` — filter interactions, grid loads.
- [x] 9.3 Vitest: `components/strategy/StrategyCard.test.tsx` — actions, fetch mock.
- [x] 9.4 Vitest: `stores/strategyStore.test.ts` — version actions.

## 10. Documentation

- [x] 10.1 `docs/design-alignment.md` — `StrategyCard` → code, `StrategyHistoryPanel` → code.

## 11. Final validation

- [x] 11.1 All tests green.
- [x] 11.2 Manual: grid loads, card open works, favorite + archive + duplicate work, Strategy History opens + revert creates new version.
- [x] 11.3 Visual baselines match.
