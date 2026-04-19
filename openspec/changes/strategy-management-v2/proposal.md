## Why

Pencil frame `pGjNd` (`Screen / Strategy Management`) + `PLr19` (Light) redesigns the current basic card grid. Today's `StrategiesPage.tsx` is functional but lacks:
- Mini equity sparkline per card
- A **Strategy History** right-side panel (git-log of versions)
- A polished filter/tab model (All / Favorites / Active / Archived)
- Actions: Duplicate + improve, Edit + save, each producing a new version

This change implements the pixel-level screen and wires Strategy versioning into the UI.

## What Changes

**New screen** (`src/screens/StrategiesScreen.tsx`) replacing `src/pages/StrategiesPage.tsx`:
- Main: 3-column responsive grid of `StrategyCard` (Pencil primitive)
  - Each card shows: name + version chip + status + mini equity curve (from latest backtest) + params summary + return %
  - Favorite star, Archive button, Open button
- Tabs: All / Favorites / Active / Archived (filters the grid)
- Search input
- Topbar: "New Strategy" CTA (opens Workspace Strategy Design with a blank draft)
- RightRail: `AIPersonaShell persona="strategy-history"` (new, read-mostly) — displays version tree of currently-hovered/clicked card

**Strategy History panel**:
- Lists versions of the selected strategy (newest first, via `cremote.listStrategyVersions`)
- Each entry: v#, summary, timestamp, parent_version (shows branching)
- Click entry → shows a side-by-side diff preview (textual; fancy diff viewer out of scope)
- "Duplicate and improve" button → `cremote.createStrategy` with code from this version, `workspaceStore.enterDesign(newId)`
- "Revert to this version" button → `cremote.createStrategyVersion` with this version's code as new latest, summary "Revert to v{N}"

**Card actions**:
- Open → navigate to Workspace Strategy Design with this strategy loaded
- Duplicate → create copy with "(copy)" suffix
- Archive → toggle status (keep in DB, hidden from Active tab)
- Favorite → toggle is_favorite

**Uses `cremote.listStrategies` pagination** — scrolls to load more

## Capabilities

### New Capabilities
- `ui-strategy-management`: The redesigned strategy management screen, version history panel wiring, card-level actions (duplicate / archive / favorite / revert).

### Modified Capabilities
*(None.)*

## Impact

**New files**
- `src/screens/StrategiesScreen.tsx` + sub-components (`StrategyCard`, `StrategyHistoryPanel`, `RevertDialog`)
- `src/services/prompt/personas/strategyHistory.ts` (minimal — composer disabled; persona mostly renders version list)
- `e2e/visual/strategy-management.spec.ts`

**Modified files**
- `src/App.tsx` — `route.kind === "strategies"` renders `StrategiesScreen`
- `src/stores/strategyStore.ts` — add version-related actions: `listVersions(strategyId)`, `createVersion(strategyId, code, summary, parent_version?)`, `revertTo(strategyId, version)`
- `src/components/primitives/AIPersonaShell/personas.ts` — register `strategy-history` persona
- `docs/design-alignment.md` — `StrategyCard` Pencil primitive → code

**Deleted files**
- `src/pages/StrategiesPage.tsx` (replaced)

**Depends on**
- `ui-foundation`
- `api-contract-new-capabilities` — `cremote.listStrategyVersions`, `cremote.createStrategyVersion`, `cremote.getStrategyVersion`

**Out of scope**
- Full side-by-side diff viewer (use textual for now).
- Strategy sharing / export.
- Portfolio view of multiple strategies side-by-side (use Workspace for that).
