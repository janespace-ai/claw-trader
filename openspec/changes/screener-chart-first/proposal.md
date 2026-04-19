## Why

Pencil frame `bnwnL` (`Screen / Screener (chart-first)`) + `iFmHp` (Light) replaces the current table-only `ScreenerPage.tsx`. The redesigned screen:

- Has a **left watchlist** of symbols that passed the screener, with mini equity charts + rank
- **Main area** shows the focused symbol's candlestick chart with **signal markers** (where the screener would have triggered)
- Right rail stays as **Screener Assistant** — the auto-run flow we already built, but now rendered inside the unified `AIPersonaShell`

Current code is a flat table of passed/failed symbols with scores. Users can't see *why* a symbol matched.

## What Changes

**Rewrite** `src/pages/ScreenerPage.tsx` → `src/screens/ScreenerScreen.tsx`:
- `WorkspaceShell` layout (reuse — Screener shares structure with Workspace screens):
  - Topbar: saved-list selector + "Run screener" button + timeframe chips
  - LeftRail: `Watchlist` of passed symbols, each row showing rank + mini chart + score. "Passed" section (filled) and "Failed" collapsed section below.
  - Main: `ClawChart.Candles` for focused symbol with optional signal markers overlay
  - RightRail: `AIPersonaShell persona="screener"` — picks up the existing auto-run behavior from `change/chat-auto-run-screener`

**Migrate auto-run**:
- Current `src/services/chat/screenerRunner.ts` + `src/stores/autoRunStore.ts` + `src/components/chat/AutoRunStatus.tsx` move into the `screener` persona as first-class features.
- `AutoRunStatus` embedded in the `AIPersonaShell.Transcript`.
- Chat now goes through the unified persona system, not the side-channel wiring in `AIPanel.tsx`.

**Signal markers for the chart** (new):
- When a screener completes and produces `results[].signals`, the main chart overlays markers at those timestamps.
- Contract needs `ScreenerResult.signals_per_symbol: Record<string, Signal[]>` — verify this exists in contract; if not, request contract patch in follow-up (not in this change's scope to modify contracts).

**Saved lists panel** (modal-style panel slide-in from left):
- Still available via button in topbar
- Lists saved screener runs + a "+" button to save current results
- Moved out of the inline layout into a dedicated overlay

**Delete** old files after migration:
- `src/pages/ScreenerPage.tsx` — deleted (replaced by `ScreenerScreen.tsx`)
- `src/components/chat/AutoRunStatus.tsx` — merged into persona's transcript renderer

## Capabilities

### New Capabilities
- `ui-screener`: The chart-first screener screen, Screener persona wiring, saved-lists overlay, signal-marker integration.

### Modified Capabilities
- `ui-foundation`: Reuse, no changes.

## Impact

**New files**
- `src/screens/ScreenerScreen.tsx` + sub-components
- `src/services/prompt/personas/screener.ts` (formalizes existing system prompt)
- `e2e/visual/screener.spec.ts`

**Modified files**
- `src/components/primitives/AIPersonaShell/personas.ts` — register `screener` persona, incorporates auto-run
- `src/components/chat/AIPanel.tsx` — delete the chat-tab-specific auto-run hook (now handled by persona)
- `src/stores/autoRunStore.ts` — may be renamed to `screenerRunStore` or merged into AIPersonaShell context
- `src/App.tsx` — route `kind: "screener"` now renders `ScreenerScreen` instead of `ScreenerPage`
- `docs/design-alignment.md` — ScrRow (Pencil) → Watchlist row, signal marker → ClawChart.Markers

**Deleted files**
- `src/pages/ScreenerPage.tsx`
- `src/components/chat/AutoRunStatus.tsx` (content moved into persona)

**Depends on**
- `ui-foundation`
- `api-contract-foundation` — `cremote.startScreener`, `cremote.getScreenerResult`

**Out of scope**
- Editing screener code inline (use Strategies page).
- Saved-list organizational features (tagging, search) — minimal here.
- Real-time signal updates — post-hoc only.
