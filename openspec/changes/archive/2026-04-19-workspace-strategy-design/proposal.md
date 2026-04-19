## Why

Pencil frame `Q6cKp` (`Screen / Workspace - Strategy Design`) + `MZuaq` (Light variant) is the entry point for the Workspace trio. Today no screen in code matches it. Users generate strategies via the generic AIPanel and then… have nowhere to go — the current `BacktestPage` is a monolithic different layout.

This change implements the Strategy Design workspace pixel-level for both themes, wires the **AI Strategist** persona to the right rail, and makes "Run Preview" transition to the next workspace state.

## What Changes

**New screen** (`desktop-client/src/screens/workspace/StrategyDesign.tsx`) — full Pencil fidelity:
- `WorkspaceShell` layout: topbar (strategy selector + "Run Preview" CTA) / main area / AI rightRail
- Main area:
  - Large `ClawChart.Candles` top pane (~55% height) with volume sub-pane
  - Bottom left: "Strategy draft" card showing indicator breakdown, params table, lookback summary
  - Bottom right: "Ready for preview" purple gradient card (when strategy draft complete) with `Run Preview` button
- Topbar: symbol selector (`BTC_USDT` default), timeframe chips (5m/15m/1h/4h), indicator chips (SMA/EMA/BB/RSI)
- Tabs under chart: `Strategy | Screener | Metrics | Trades | Code` — only `Strategy` active in this screen (the rest are placeholders hiding until Preview/Deep screens implement them)

**AI Strategist persona**:
- Fill the `AIPersonaShell` strategist wiring:
  - System prompt in `src/services/prompt/personas/strategist.ts` (streaming Python strategy code + structured summary)
  - Intro message: context-aware (e.g. "Designing strategy on BTC_USDT 1h — tell me what edge you want to capture")
  - Composer enabled
  - Assistant response parser: extract summary card (`name`, `interval`, `symbols`, `longCondition`, `shortCondition`, `params`) + code block
  - Summary card renders inline in chat via the `StrategySummaryCard` component (resurrected from its orphaned state)
- Each generated strategy auto-saves as a new version via `cremote.createStrategyVersion` (wired to `strategy-api` contract)

**Run Preview flow**:
- Topbar button "Run Preview" (primary CTA, disabled until a strategy draft exists)
- Click → `cremote.startBacktest({ code, config: { symbols: [focusedSymbol], mode: "preview" } })` → task_id
- Transitions `workspaceStore.mode = "preview"` — preview workspace (ships in #5) takes over
- Error handling: compile fail → show inline error under the draft card; sandbox error → toast

**Strategy draft persistence**:
- Local zustand slice `workspaceDraftStore` holds the current draft strategy (code, summary, params)
- Auto-saved every time AI emits a parseable strategy summary
- Swap drafts via a "Load existing" dropdown from strategy list (backed by `cremote.listStrategies`)

**No backend runtime requirements** — everything reads MSW fixtures or the legacy-adapter layer from `cremote`.

## Capabilities

### New Capabilities
- `ui-workspace-strategy-design`: The Strategy Design screen itself — layout, components, AI Strategist persona wiring, draft-persistence store, Run Preview transition.

### Modified Capabilities
*(None.)*

## Impact

**New files**
- `src/screens/workspace/StrategyDesign.tsx` + sub-components (`StrategyDraftCard`, `RunPreviewCard`, `StrategyTopbar`)
- `src/services/prompt/personas/strategist.ts`
- `src/services/prompt/personas/parsers.ts` — shared structured-output parsers used by multiple personas
- `src/stores/workspaceDraftStore.ts`
- `desktop-client/e2e/visual/workspace-strategy-design.spec.ts` — dark + light snapshots

**Modified files**
- `src/components/chat/StrategySummaryCard.tsx` — finally wired in; used by strategist persona
- `src/App.tsx` — `route.kind === "workspace" && workspaceStore.mode === "design"` renders this screen
- `src/components/layout/TopBar.tsx` — "Backtest" tab navigates to `{ kind: "workspace" }` with default `mode: "design"`
- `docs/design-alignment.md` — add rows for StrategyDraftCard, RunPreviewCard, StrategyTopbar

**Depends on**
- `ui-foundation` (primitives + routing + workspaceStore) — must land first.
- `api-contract-foundation` + `api-contract-new-capabilities` — `cremote.createStrategyVersion`, `cremote.startBacktest` (extended with `mode`), `cremote.listStrategies`.

**Out of scope**
- Preview / Deep mode content (separate changes).
- Real backend for OptimLens etc. (not needed; this screen doesn't call them).
- Strategy versioning UI beyond "save on generate" — full version tree lands in `strategy-management-v2`.
