## Context

`3PSG8` / `PISBa` is the **retrospective review** stage. The strategy already ran (preview mode, 7 days) and produced a backtest result object. The screen's job is to make the user understand:

- Where did it enter and exit?
- Which of those entries looked "good" vs "questionable"?
- Can I trust this to survive a longer backtest?

The Signal Review AI persona is the interpretive layer. Its output is structured (per-signal verdicts), not free prose. Crucial: the verdicts must map back to the chart markers so clicking a verdict scrolls/zooms the chart.

## Goals / Non-Goals

**Goals:**
- Pixel fidelity to `3PSG8` + `PISBa` across trade-marker density, watchlist row layout, trades table density.
- Chart markers correctly placed (entry arrow at entry_ts, exit arrow at exit_ts).
- Signal Review auto-kicks on mount and streams verdicts; clicking a verdict scrolls chart to that signal.
- "Confirm + Run Deep" reuses the same strategy code in a new backtest submission.

**Non-Goals:**
- Editing signals.
- Stepping through bar-by-bar playback.
- Showing every indicator that the strategy computes (out of scope unless already exposed as overlays in the backtest result).

## Decisions

### D1. Watchlist shows per-symbol return pct, sorted desc, focused symbol = chart context

**Decision.** Watchlist items come from `backtestResult.per_symbol` — one row per symbol that traded. Each row shows: symbol code, mini equity sparkline (via `ClawChart.Mini`), total return pct (colored green/red). Default sort: return desc. Clicking a row sets `workspaceStore.focusedSymbol` which drives the main chart.

### D2. Trade markers layered on top of candles, crosshair snaps to bar

**Decision.** `ClawChart.Markers` takes `{ trades: Trade[], onMarkerClick? }`. For each trade:
- Entry marker: up-arrow (long) or down-arrow (short) at `entry_ts`
- Exit marker: hollow triangle at `exit_ts`
- Optional `onMarkerClick(trade_id)` — used by Signal Review verdicts to navigate

`lightweight-charts` supports this natively via `series.setMarkers(...)`.

### D3. Signal Review auto-trigger is idempotent

**Decision.** On `PreviewBacktest` mount, check if `workspaceDraftStore.signalReviewTaskId` exists for this backtest; if not, call `cremote.startSignalReview({ backtest_task_id })` and store the id. If yes, just poll that task.

This avoids double-submits on StrictMode re-mounts and on navigating back from Deep→Preview.

### D4. Verdict pills are list items in the right rail, independent from the chart

**Decision.** The `AIPersonaShell.Transcript` renders an extra child — a structured list of `SignalVerdict` pills — above the chat messages. Each pill shows:
- Color (green = good, yellow = questionable, red = bad)
- Symbol abbreviation
- Timestamp (short format)
- The AI's 1-liner note

Clicking a pill scrolls the main chart's time range to center `entry_ts` ± 5 bars.

The user can then chat with the persona ("Why yellow for the LINK entry?"). The persona has full verdict context in its system prompt.

### D5. Confirm + Run Deep: one click, immediate mode switch

**Decision.** Button click = new `cremote.startBacktest({ code, config: { symbols, mode: "deep" } })`, `workspaceStore.enterDeep(taskId)`, transition to Deep workspace.

The deep backtest runs in the background; the Deep workspace UI shows a loading skeleton until results arrive. Preview data is NOT discarded — it's retrievable via `workspaceStore.previousTaskIds[]` if the user goes back.

### D6. Topbar summary line: server-computed

**Decision.** The `"Preview backtest — last 7 days • 23 signals across 10 symbols"` string is derived from `backtestResult`:
- `"last {lookback_days} days"`
- `"{total signals across per_symbol} signals"`
- `"{per_symbol keys count} symbols"`

If a piece is unknown, fall back gracefully ("Preview backtest").

### D7. Trade table is virtualized

**Decision.** Use `react-window` or the lightweight pattern `IntersectionObserver` + render-on-scroll. A 7-day multi-symbol preview can produce 100-500 trades; rendering all at once kills initial paint.

**Fallback.** If virtualization adds too much complexity, cap the trade table at 200 rows sorted by entry_ts desc (most recent first) with "load more" pagination. Ship the fallback first; virtualize if users complain.

## Risks / Trade-offs

- **[Signal Review backend doesn't exist yet]** → MSW fixture returns a plausible verdict list; screen works offline. When real backend misses, `cremote.getSignalReviewResult` returns 404 which we show as "Signal Review unavailable" banner.

- **[Trade markers clutter at dense zoom]** → Mitigation: at zoom-out views, aggregate adjacent markers into a single "cluster" marker with a count. Defer if simple density is acceptable.

- **[Signal Review verdict count can be > 100]** → Contract caps at 100; UI shows summary + expandable list. No UX issue expected for preview (7d).

- **[Clicking verdict scrolls chart but loses context]** → Animate the scroll + briefly highlight the target range. Details in implementation.

## Migration Plan

1. Ship the screen with MSW data (guaranteed available).
2. Verify against real backend once deep backtest result is returned from actual engine.
3. Add the Deep placeholder in Confirm + Run Deep — next change fills it.

## Open Questions

- Should watchlist include symbols that didn't trade (zero entries) for the preview? Pencil shows all 15 — yes, include them with "no trades" note.
- Should we persist the user's preferred tab (Trades vs Quick Metrics vs AI Review) across sessions? Yes via `localStorage`; minor UX polish.
- Does clicking a chart marker scroll the transcript to the matching verdict (reverse direction)? Yes — symmetric UX.
