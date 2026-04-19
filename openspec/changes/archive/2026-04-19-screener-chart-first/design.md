## Context

Today's `ScreenerPage.tsx` is a monolithic page that shows a table of screener results with inline status / score / rank — no chart, no per-symbol deep view, and the AI auto-run flow was wired in via a side-channel (`autoRunStore` + `AutoRunStatus`) because there was no unified persona system.

With `ui-foundation`'s `AIPersonaShell` and the redesigned screener layout in Pencil `bnwnL`, the flow becomes:

```
left Watchlist (passed symbols, ranked)          Main: ClawChart + signal markers
    ▲                                            ▲
    │ click row                                  │ hover → tooltip
    │                                            │
    └── focus symbol ──────────────────────────── ┘

rightRail: AIPersonaShell persona="screener"
    - Chat: generate / refine screener code
    - Inline: "Running screener... / Matched 20 symbols" status
    - On done: left Watchlist populates, main chart updates
```

## Goals / Non-Goals

**Goals:**
- Pixel fidelity to `bnwnL` / `iFmHp`.
- Auto-run flow preserved — user can chat, AI generates code, screener runs, results appear.
- Main chart overlays signal markers where the screener would have matched historically.
- Saved lists remain accessible and functional.

**Non-Goals:**
- Inline code editing.
- Multi-criteria composition UI (AND/OR combinators on screeners).
- Historical backtesting of the screener itself (not in design).

## Decisions

### D1. Reuse WorkspaceShell for the screener layout

**Decision.** Even though Screener isn't a "workspace" semantically, its three-column chrome matches. Using `WorkspaceShell` saves duplication and aligns visual rhythm.

### D2. Auto-run moves into the Screener persona

**Decision.** The Screener persona's transcript component (`<AIPersonaShell.Transcript />`) knows how to render structured "auto-run" entries. The side-channel `autoRunStore` is kept (renamed to `screenerRunStore` for clarity) but becomes an internal detail of the Screener persona, not exposed through `AIPanel.tsx`.

### D3. Signal markers come from `ScreenerResult.signals_per_symbol`

**Decision.** The backend (when available) returns, for each passed symbol, the timestamps where the screener condition evaluated true. MSW fixture provides this. The main chart overlays these as markers (orange diamonds, not arrows, to distinguish from trade-entry/exit markers in Workspace screens).

If the contract does not yet include `signals_per_symbol`, we add it as a request to `api-contract-new-capabilities` — but that contract is being proposed in parallel, so this change assumes the field is there.

### D4. Failed-symbols section collapsed by default

**Decision.** LeftRail shows "Passed (N)" expanded and "Failed (M)" collapsed. Users who want to see rejections click to expand. Design mock shows both but with visual de-emphasis on failed; collapse is an acceptable interpretation that scales to 300 symbols.

### D5. Saved lists as an overlay, not inline

**Decision.** Topbar button "Saved lists (N)" opens a slide-in panel over the LeftRail area. Selecting a list loads its symbols as the current watchlist; users can save the current results as a new list. Inline saved-list UI (current code has it) collapses to save horizontal space.

### D6. Timeframe chips in topbar — scope: display only

**Decision.** 5m/15m/1h/4h chips in the topbar change the **chart's interval** only, not the screener condition. Screener always evaluates on the interval the user specified in the script (e.g. daily for "top 20 by volume"). Chart interval is a display choice.

## Risks / Trade-offs

- **[Deleting AutoRunStatus breaks existing chat flow]** → Mitigation: commit the move + delete in the same PR; tests cover both paths. Screener chat must still trigger auto-run after the refactor.

- **[Signal markers density for long lookbacks]** → At 90+ days of hourly bars, markers can overlap. Use `setMarkers` with aggregation at zoom-out, or cap markers to 200.

- **[Screener persona vs Strategist persona confusion]** → User context (current tab) selects which persona is active; two personas never render simultaneously. Chat history per persona is separate — no mixing.

## Migration Plan

1. Implement `ScreenerScreen.tsx` alongside old `ScreenerPage.tsx`.
2. Gate the rendering via a temp feature flag (`CLAW_NEW_SCREENER=1`) or route condition for one PR to compare.
3. Delete old `ScreenerPage.tsx` + `AutoRunStatus.tsx` in the same PR once the new one renders correctly.
4. Visual regression baselines captured in the new location.

## Open Questions

- `autoRunStore` rename: worth it for clarity, or keep name for minimal churn? → Rename to `screenerRunStore` at migration time; grep + rename is cheap, name becomes less misleading.
- Should the saved-lists overlay be a modal or a slide-in sheet? → Slide-in from left, non-modal (chart remains visible). Matches Pencil.
- Is there a legend for orange signal markers? → Yes — tiny legend at chart top-right: "● Signal • ▲ Entry • ▽ Exit" (Entry/Exit not shown on screener but documented for consistency).
