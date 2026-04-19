## Why

Pencil frame `3PSG8` (`Screen / Workspace - Preview Backtest`) + `PISBa` (Light) is the second step of the Workspace flow: after a user runs a 7-day preview, they need to decide whether the strategy is worth deep-backtesting. The screen shows entry/exit markers on a real chart, a per-symbol watchlist, a trades/metrics table, and the **Signal Review** AI persona that flags suspect entries.

## What Changes

**New screen** (`src/screens/workspace/PreviewBacktest.tsx`):
- `WorkspaceShell` with:
  - Topbar: symbol + "Preview backtest — last 7 days • 23 signals across 10 symbols" summary + `Confirm + Run Deep` CTA
  - LeftRail: `Watchlist` of symbols with pct return, focused row = currently shown chart
  - Main area:
    - `ClawChart.Candles` with trade markers (entry arrows + exit arrows, from per-symbol `trades`)
    - Below: tabs `Trades | Quick Metrics | AI Review`
    - `Trades` tab: virtualized table (the `TradeRow` Pencil primitive)
  - RightRail: `AIPersonaShell persona="signal-review"` — streams Signal Review verdicts via `cremote.startSignalReview` + polling

**Signal Review AI persona**:
- System prompt in `src/services/prompt/personas/signalReview.ts` — instructs the model to evaluate each signal with verdict + reason (the backend does this; frontend just renders; but we also support a local fallback where the model runs client-side given the context)
- Intro message: auto-populates "Scanned {N} entries. Most look healthy. Two flags:" style summary
- Composer: enabled, user can ask follow-ups ("Why did you flag the LINK entry?")
- Structured verdict rendering: pill per signal (green/yellow/red) keyed to `signal_id`; clicking a pill scrolls the main chart to that signal's timestamp

**Auto-trigger Signal Review on entry**:
- On mount, if `workspaceStore.currentTaskId` has a completed preview result, auto-kick `cremote.startSignalReview({ backtest_task_id })` and stream results into the AIPersonaShell transcript

**Confirm + Run Deep**:
- CTA submits a NEW backtest with `mode: "deep"` using the same code + symbols
- `workspaceStore.enterDeep(newTaskId)` — Deep workspace screen (#6) takes over

**Trade marker overlay on chart**:
- `ClawChart.Markers` child of `Candles`
- Green ↑ for long entry, red ↓ for short entry; hollow triangle for exit
- Hover marker → tooltip with entry price + PnL pct

## Capabilities

### New Capabilities
- `ui-workspace-preview-backtest`: The Preview Backtest screen, Signal Review persona, trade-markers overlay component, preview→deep transition, and its visual regression snapshots.

### Modified Capabilities
*(None.)*

## Impact

**New files**
- `src/screens/workspace/PreviewBacktest.tsx` + sub-components (`PreviewTopbar`, `TradesTab`, `QuickMetricsTab`, `TradeRow`)
- `src/services/prompt/personas/signalReview.ts`
- `e2e/visual/workspace-preview-backtest.spec.ts`

**Modified files**
- `src/App.tsx` — renders `<PreviewBacktest />` when `route.kind === "workspace" && workspaceStore.mode === "preview"`
- `src/components/primitives/ClawChart/Markers.tsx` — extended to take a `trades: Trade[]` prop if not already expressive enough in #3
- `src/components/primitives/AIPersonaShell/personas.ts` — register `signal-review`
- `docs/design-alignment.md` — add TradeRow, PreviewTopbar mappings

**Depends on**
- `ui-foundation`
- `workspace-strategy-design` (for the mode transition)
- `api-contract-*` — uses `cremote.getBacktestResult`, `cremote.startSignalReview`, `cremote.getSignalReviewResult`, `cremote.startBacktest` (for deep)

**Out of scope**
- Deep workspace rendering (next change)
- Multi-strategy comparison (Pencil doesn't have)
- Editing trades / forcing exits (retrospective analysis only)
