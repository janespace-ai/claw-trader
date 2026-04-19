## Why

The Pencil design (`design/trader.pen`) defines 8 full-fidelity screens (dark + light = 16 frames) that don't map onto the current desktop-client at all — 6/8 screens are chart-first, none exist in code today, and the shared infrastructure they all depend on (`ClawChart`, `Watchlist`, `WorkspaceShell`, navigation state machine, AI-persona container) also doesn't exist.

Trying to build each screen independently would reinvent the same primitives 8 times. This change lays the foundation **once**, so the 8 follow-up screen changes (`workspace-strategy-design`, `workspace-preview-backtest`, `workspace-deep-backtest`, `screener-chart-first`, `strategy-management-v2`, `symbol-detail`, `multi-symbol-grid`, `settings-full-page`) can each focus on layout + wiring rather than plumbing.

It also introduces the two cross-cutting capabilities that every screen needs:
1. A visual regression test harness (Playwright snapshots) so pixel-level fidelity to Pencil is verifiable, not aspirational.
2. A Pencil ↔ code alignment audit on design tokens (spacing, radius, font sizing), currently only colors are aligned.

## What Changes

**New UI primitives** (`desktop-client/src/components/primitives/`)
- `ClawChart` family — wraps `lightweight-charts`:
  - `ClawChart.Candles` — single-pane candlesticks with configurable overlay lines (SMA/EMA/BB)
  - `ClawChart.Mini` — small non-interactive sparkline for watchlist/grid cells
  - `ClawChart.Equity` — line chart for equity/drawdown curves
  - `ClawChart.Markers` — overlay primitive for trade entry/exit arrows on `Candles`
  - Shared theme hookup (reads CSS variables, redraws on theme switch)
- `Watchlist` — left-panel vertical list of symbols with inline `ClawChart.Mini` + metadata line. Keyboard navigable, supports "focused" state.
- `WorkspaceShell` — layout primitive exposing `topbar`, `leftRail?`, `main`, `rightRail?` slots. Used by the 3 Workspace screens + Screener.
- `AIPersonaShell` — container for the right-side AI panel. Takes a `persona` prop (`strategist` | `signal-review` | `optimlens` | `screener` | `trade-analysis`) which selects system prompt, intro message, CTA buttons.
- `MetricsGrid` — responsive grid of metric tiles. Each tile: label, value, delta-vs-benchmark. Used by Deep Backtest + Symbol Detail + Strategy card.

**Navigation state machine** (`desktop-client/src/stores/workspaceStore.ts`)
- New zustand slice tracking the current workspace mode: `"design" | "preview" | "deep"`.
- Transitions:
  - `design` → `preview` (user clicks "Run Preview")
  - `preview` → `design` (back)
  - `preview` → `deep` (user clicks "Confirm + Run Deep")
  - `deep` → `preview` (back)
- Current strategy ID, current backtest task ID, and currently-focused symbol live here (shared across modes).
- TopBar's breadcrumb/progress indicator reads from this store.

**Design token alignment**
- `desktop-client/tailwind.config.js` — extend spacing scale to exactly match Pencil (Pencil uses `[0,2,4,6,8,12,16,20,24,32,40,48,64]`); current Tailwind ships a scale that's close but not identical.
- Radius scale: `rounded-sm|md|lg|xl|full` mapped to Pencil's `radius-sm=6 / md=8 / lg=12 / xl=16 / full=9999`.
- Font family: `font-body: Inter`, `font-heading: Geist`, `font-data: Geist Mono` — confirm available or add to `index.html` `<link>`s.
- Audit all existing components for stray Tailwind values not in scale; either align or add an ESLint rule.

**Visual regression** (`desktop-client/e2e/visual/`)
- Install Playwright as devDep (Chromium only).
- Setup: `e2e/visual/setup.ts` launches Electron with `VITE_USE_MOCKS=1` + fixed MSW profile `happy`, waits for app idle.
- Snapshots: one per screen per theme, committed under `e2e/visual/__screenshots__/`.
- This change captures only a **blank shell** snapshot (`WorkspaceShell` empty, both themes). Per-screen snapshots are captured in each screen's own change.
- CLI: `pnpm test:visual` runs diff; `pnpm test:visual:update` overwrites on intentional changes.

**Pencil ↔ code cross-reference**
- `docs/design-alignment.md` — table mapping each Pencil reusable component (`StrategyCard`, `ScrRow`, `TradeRow`, `MetTile`, `RailRow`, `GridCell`, etc.) to the code primitive that implements it. Updated by each screen change.

**App routing refactor**
- Replace the flat `currentTab` → page component switch in `App.tsx` with a nested structure that allows `backtest → {design | preview | deep}` substate, `symbol-detail` as modal/overlay, and Settings as full page (when Settings change lands).
- `AppRoute` type: `{ kind: "screener" | "strategies" | "workspace"; sub?: "design" | "preview" | "deep"; symbol?: string } | { kind: "symbol-detail"; symbol: string; returnTo: AppRoute } | { kind: "settings"; section?: string }`.

**What does NOT change in this one change**
- No actual screen implementations yet. `WorkspaceShell` renders placeholder "Workspace / design coming soon" — actual design-mode content ships in #4.
- No AI persona prompts filled in (just the shell); each persona's prompt + wiring comes with its screen.
- Existing pages (`ScreenerPage`, `StrategiesPage`, `BacktestPage`) continue to render unchanged during the migration period.

## Capabilities

### New Capabilities
- `ui-foundation`: Shared UI primitives (ClawChart family, Watchlist, WorkspaceShell, AIPersonaShell, MetricsGrid), design-token alignment, navigation state machine, visual regression harness, and Pencil↔code cross-reference doc.

### Modified Capabilities
*(None. Existing pages stay running during the migration.)*

## Impact

**New files**
- `desktop-client/src/components/primitives/` — 5 primitives + tests
- `desktop-client/src/stores/workspaceStore.ts`
- `desktop-client/src/types/navigation.ts`
- `desktop-client/e2e/visual/setup.ts`, `e2e/visual/shell.spec.ts` (blank shell snapshots)
- `desktop-client/playwright.config.ts`
- `docs/design-alignment.md`

**Modified files**
- `desktop-client/tailwind.config.js` (spacing / radius / font tokens)
- `desktop-client/src/App.tsx` (new routing)
- `desktop-client/src/stores/appStore.ts` (route state replaces `currentTab`)
- `desktop-client/package.json` (add `@playwright/test` devDep; add scripts `test:visual`, `test:visual:update`)
- Any existing component that used a now-non-canonical spacing value: adjusted to scale

**Follow-up changes unblocked**
- `workspace-strategy-design`, `workspace-preview-backtest`, `workspace-deep-backtest` — all consume `WorkspaceShell` + `ClawChart` + `AIPersonaShell`.
- `screener-chart-first` — consumes `Watchlist` + `ClawChart.Candles`.
- `strategy-management-v2` — consumes `ClawChart.Mini` + `MetricsGrid`.
- `symbol-detail` — consumes every primitive.
- `multi-symbol-grid` — consumes `ClawChart.Mini` in a grid layout.
- `settings-full-page` — consumes the new routing to be a full page.
- `light-theme-polish` — runs the visual regression suite on both themes.

**Out of scope**
- Real-time / streaming updates to charts.
- Chart indicator library (RSI, MACD, Bollinger — adders for specific screens).
- Storybook (considered, rejected — Playwright snapshots of full screens is cheaper maintenance).
- Full screen implementations (each is its own change).
