## 1. Prereqs

- [ ] 1.1 `ui-foundation` landed.
- [ ] 1.2 `api-contract-new-capabilities` provides `cremote.listStrategyVersions`, `createStrategyVersion`, `getStrategyVersion`.

## 2. Strategy history persona

- [ ] 2.1 Create `src/services/prompt/personas/strategyHistory.ts` — minimal (no real chat; persona is rendered as a list, not a conversation).
- [ ] 2.2 Register `strategy-history` in `AIPersonaShell.personas` with Composer hidden.

## 3. StrategyCard component

- [ ] 3.1 Create `src/components/strategy/StrategyCard.tsx`.
- [ ] 3.2 Background fetch: on mount, call `cremote.listBacktestHistory({ strategy_id, limit: 1 })` → set mini chart data.
- [ ] 3.3 Render: header (name, version chip, favorite star), middle (ClawChart.Mini or "No backtests yet"), footer (return pct, params summary).
- [ ] 3.4 Three-dot menu: Duplicate / Archive.
- [ ] 3.5 Favorite star: stopPropagation click handler.

## 4. StrategiesScreen

- [ ] 4.1 Create `src/screens/StrategiesScreen.tsx` using `WorkspaceShell`.
- [ ] 4.2 Topbar: `StrategiesTopbar.tsx` with title, search input, New Strategy CTA.
- [ ] 4.3 Main grid: `StrategiesGrid.tsx` loads via `strategyStore.load()`, renders cards, applies active tab + search filter.
- [ ] 4.4 Tabs: `All / Favorites / Active / Archived` — purely client-side filters.
- [ ] 4.5 RightRail: `<AIPersonaShell persona="strategy-history" context={{ strategyId: selectedId }} />`.

## 5. Strategy history panel

- [ ] 5.1 `src/components/strategy/StrategyHistoryPanel.tsx` — lists versions.
- [ ] 5.2 `VersionItem.tsx` — v chip + summary + timestamp + fork badge + Revert/Duplicate buttons.
- [ ] 5.3 RevertDialog — confirm dialog, calls `cremote.createStrategyVersion` with old code + summary "Revert to v{N}".
- [ ] 5.4 DuplicateAndImprove — creates new strategy + navigates.

## 6. strategyStore extensions

- [ ] 6.1 Add `listVersions(strategyId)` action.
- [ ] 6.2 Add `createVersion(strategyId, code, summary?, parent_version?)` action.
- [ ] 6.3 Add `revertTo(strategyId, version)` action — composed of fetch + createVersion.
- [ ] 6.4 Add `selectedId: string | null` state + `select(id)` action.
- [ ] 6.5 Vitest for each action.

## 7. Route wiring + deletion

- [ ] 7.1 `App.tsx`: `route.kind === "strategies"` → `<StrategiesScreen />`.
- [ ] 7.2 Delete `src/pages/StrategiesPage.tsx`.
- [ ] 7.3 Update TopBar "Strategies" tab → `navigate({ kind: "strategies" })` (unchanged from `ui-foundation`).

## 8. Card actions — end-to-end

- [ ] 8.1 Open card → Workspace Design with strategyId loaded.
- [ ] 8.2 Duplicate card → new strategy record, navigates.
- [ ] 8.3 Archive card → toggle status, remove from Active tab (optimistic).
- [ ] 8.4 Favorite card → toggle is_favorite (optimistic).
- [ ] 8.5 Error paths: toast + rollback.

## 9. Tests

- [ ] 9.1 `e2e/visual/strategy-management.spec.ts` with 5 baselines.
- [ ] 9.2 Vitest: `screens/StrategiesScreen.test.tsx` — filter interactions, grid loads.
- [ ] 9.3 Vitest: `components/strategy/StrategyCard.test.tsx` — actions, fetch mock.
- [ ] 9.4 Vitest: `stores/strategyStore.test.ts` — version actions.

## 10. Documentation

- [ ] 10.1 `docs/design-alignment.md` — `StrategyCard` → code, `StrategyHistoryPanel` → code.

## 11. Final validation

- [ ] 11.1 All tests green.
- [ ] 11.2 Manual: grid loads, card open works, favorite + archive + duplicate work, Strategy History opens + revert creates new version.
- [ ] 11.3 Visual baselines match.
