# Design — Workspace Three-Zone Layout

## Context

The unified-strategy-workspace shipped a 3-pane layout (left=symbols,
center=tabs, right=chat).  After dogfooding, three problems became
clear (see proposal):
1. Left rail showing only `draft_symbols` makes the workspace
   claustrophobic.
2. K-line lives inside a tab and disappears whenever the user looks at
   code or result.
3. AI-screener results auto-overwrite `draft_symbols` with no
   cherry-pick step.

This change re-balances the screen into a three-zone layout where
the K-line is **persistent** (always visible above the tab area), the
left rail is the **full market** (not strategy-scoped), and AI-filter
results land in a new "选出的币" tab where the user explicitly adds
symbols to `draft_symbols`.

Design reference: Pencil frame `A7ubw` (master) at
`docs/design/trader.pen` (0, 8000) plus `V8qt9` (代码 tab content) and
`O8TIU2` (回测 tab content).  See
`docs/design/unified-strategy-workspace-frames.md` for hand-off.

## Goals / Non-Goals

**Goals:**
- Persist K-line visibility regardless of which tab is active.
- Decouple left rail from strategy state.
- Two-step AI filter flow (preview → cherry-pick).
- Single source of truth for "which symbol is currently in focus".
- No backend change.

**Non-Goals:**
- New screener capabilities (filter syntax stays as-is).
- Changing the data model of `Strategy` (`draft_symbols` semantics
  unchanged; new `lastFilteredSymbols` is UI-only, not persisted to
  the strategy row).
- Per-strategy left-rail customization (e.g. "show only my universe of
  interest").  Out of scope for v1.
- Re-skinning chat / right rail — preserved as-is.
- Light-theme separate Pencil mockup (CSS token flip handles it).

## Decisions

### D1: Left rail = full universe, NOT `draft_symbols`

**Choice:** New `useUniverseStore` Zustand slice that loads ~200
symbols from `GET /api/symbols` once on app boot, refreshes on tab
focus.  `SymbolListPane` reads from it exclusively.

**Rationale:** Decouples a heavy panel (200 rows + price ticks) from
strategy switching.  Loading once and reusing across strategies is
faster than re-deriving from `draft_symbols`.  Universe never needs
write access — it's read-only.

**Alternative considered:** Keep `draft_symbols` rendering and add a
"全市场" toggle.  Rejected: forces a mode switch the user has to
think about.  We want browsing-the-market to be ambient.

### D2: Single `focusedSymbol` UI state, mutex-highlighted

**Choice:** A single string field in `appStore` (or a tiny dedicated
`focusedSymbolStore`).  Default = `draft_symbols[0] ?? "BTC_USDT"` on
strategy load.  Both `SymbolListPane` (left rail) and
`FilteredSymbolsTab` rows read this and apply highlight only when
`row.symbol === focusedSymbol`.  Click handlers in either panel call
the same `setFocusedSymbol(s)`.

**Rationale:** "Mutex" is enforced by the data model, not by event
plumbing — there's only one variable.  Cheap, correct, unambiguous.

**Alternative considered:** Two highlight states (one per panel) with
imperative "clear other" calls.  Rejected: bug factory.

### D3: Center pane = vertical split with FIXED top height (420px)

**Choice:** `WorkspaceCenterPane` becomes a `flex flex-col`.  Top is
`<SymbolKlinePane>` with `height: 420px` (not flex).  Bottom is
`<WorkspaceTabsPane>` with `flex: 1`, scrolling internally.  No
draggable splitter in v1.

**Rationale:** User explicitly requested fixed K-line proportion for
predictable UX.  420px is enough for ~80 candles at typical zoom + an
80px symbol info bar.  Bottom tab content scrolls when needed.

**Alternative considered:** Splitter or auto-resize-by-tab.  Deferred
to v2; revisit if users complain on small laptops (720h).

### D4: BOTTOM tab strong auto-switch on AI output

**Choice:** When AI emits new content (filter result, code diff
applied, backtest result), `useStrategySessionStore` setter
unconditionally calls `setBottomTab(<matching-tab>)`.  No red-dot
soft mode.

**Rationale:** Per product Q1=c.  Strong-switch is jarring but
predictable; users always see "what just happened" without hunting.
Combined with the persistent K-line on top, the user never loses
their place visually.

**Alternative considered:** Soft red-dot indicator with manual
switch.  Rejected per product decision; we found in pilot users
ignored red dots.

### D5: AI filter result lands in `lastFilteredSymbols`, NOT
`draft_symbols`

**Choice:** Add `lastFilteredSymbols: { symbols: string[]; runAt:
number; criteria: string } | null` to `StrategySessionState`
(in-memory only, not persisted to backend).  AI-screener handler
writes here on success.  "+ 加入" button appends to `draft_symbols`
via existing `patchDraft` flow.

**Rationale:** Two-step flow makes the filter result auditable.
Server-side `Strategy` row is untouched until the user actually
picks symbols.  Saves a server roundtrip per filter run.

**Trade-off:** `lastFilteredSymbols` is lost on reload (not
persisted).  Acceptable: it's "last AI run", not historical record.
A reload reloads the strategy fresh; user can re-ask the AI to
re-run if needed.

### D6: Tab content = code/result reuse, filtered tab is new

**Choice:** Existing `CodeTab` and `BacktestResultPane` move into the
new tab area unchanged (just become tab panes).  `FilteredSymbolsTab`
is new — implements the two-section layout (草稿 chips + filtered
table).

**Rationale:** Keeps blast radius small.  Code editor and result
viewer worked before; the change is just where they sit.

### D7: Empty states for the 3 tabs

**Choice:** Each tab has a polite empty state pointing to the right
rail:
- 选出的币 (no draft, no filter): "草稿是空的 · 跟右边 AI 说想筛什么"
- 代码 (no draft_code): "代码是空的 · 跟右边 AI 描述策略想法,它会写"
- 回测 (no last_backtest): "还没跑过回测 · 草稿齐了会自动跑"

**Rationale:** Per product Q4 (implicit from this conversation).
Always points the user back to the chat — chat is the primary
input surface.

### D8: Keep component file names the same (rename internals only)

**Choice:** Don't rename `SymbolListPane`, `WorkspaceCenterPane`,
`StrategyChatPane`.  Their public boundaries are stable; their
internals change.  Add new files for genuinely new units:
`SymbolKlinePane`, `WorkspaceTabsPane`, `FilteredSymbolsTab`,
`useUniverseStore`.

**Rationale:** Smaller diff, easier review, fewer import-update
chores.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Strong tab auto-switch could surprise users mid-edit (e.g. typing in code tab when backtest finishes and view jumps to 回测). | Document in release notes; add a 1.5s "switching to 回测..." toast for the first switch in a session. |
| Universe load (~200 rows + prices) may feel sluggish on first paint. | Stream-render rows progressively; cache last load in localStorage with 60s TTL. |
| `lastFilteredSymbols` lost on reload feels like a regression to users who expect "AI worked = it's saved". | Mitigate via release notes + the chat status bubble explicitly says "结果在 `选出的币` 页签查看". |
| Fixed 420px K-line wastes space on tall monitors (1440h). | Acceptable for v1; revisit with a splitter in v2. |
| Tests asserting `SymbolListPane` rows reflect `draft_symbols` will fail in bulk. | Updated as part of Group 4 in tasks.md. |
| `focusedSymbol` initialization race on first mount (universe loaded but strategy not yet). | Initialize `focusedSymbol` in the strategy `loadStrategy` action, not in component mount. |

## Migration Plan

1. **Land code behind a feature flag** `workspaceThreeZone` (default
   `true` in dev, `false` in prod).
2. **Smoke-test internally** for 1 week with dev users.
3. **Flip default to `true`** in prod.
4. **Remove flag** after 2 weeks of clean telemetry (`workspace_load`
   counts, `tab_auto_switch` events).
5. **Rollback**: flip flag → workspace renders the old 3-pane layout
   from the still-present `unified-strategy-workspace` code paths.
   We keep the old `SymbolListPane` data path (reading from
   `draft_symbols`) gated by the flag for one release; after flag
   removal, the dead code is deleted.

## Open Questions

- **Should "+ 加入" preserve the order of selection or sort by
  add-time?**  Tentative: preserve filter-table order (i.e. the AI's
  ranking).  Confirm during impl.
- **Universe refresh policy beyond the 60s localStorage cache?**
  Tentative: refresh on tab focus + manual "刷新" icon in the rail
  header.  Confirm post-pilot.
- **Should the K-line interval (15m / 1h / 1d) persist across
  sessions?**  Tentative: yes, in localStorage; no per-strategy
  override.
