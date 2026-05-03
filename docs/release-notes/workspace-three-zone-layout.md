# Release: workspace-three-zone-layout

Follow-on to [unified-strategy-workspace](./unified-strategy-workspace.md).

## TL;DR

The 创建/编辑策略 screen restructures into three zones:

- **Left** = full market universe (~200 symbols), browseable while you
  edit a strategy.  No longer scoped to the current strategy's
  `draft_symbols`.
- **Center top** = persistent K-line of the focused symbol.  Always
  visible, doesn't disappear behind tabs.
- **Center bottom** = three tabs: 选出的币 / 代码 / 回测.  AI outputs
  land here and the active tab strong-switches automatically.
- **Right** = AI chat (unchanged).

## Why

The unified workspace v1 left rail showed only the active strategy's
`draft_symbols`, which made the screen feel claustrophobic; users
wanted to glance at "what's BTC doing?" without leaving the strategy.
The K-line lived inside a tab and disappeared whenever the user
opened code or result.  AI-screener results auto-overwrote
`draft_symbols` with no review step.  This change rebalances the
screen so the K-line is always there, the universe is always there,
and AI filter results land in a review queue ("选出的币" tab) before
modifying the draft.

## What's new

### Full-market left rail (`workspace-universe-rail`)

- The left rail now shows ~200 symbols loaded from `/api/symbols`,
  cached 60 s in `localStorage`.
- Search input filters by symbol name (case-insensitive substring).
- Clicking a row sets `focusedSymbol` — only updates the K-line
  above; doesn't add to `draft_symbols`.

### Persistent K-line (center top)

- Fixed-height (420 px) K-line + symbol info bar.
- Interval picker (1m / 15m / 1h / 4h / 1D); selection persists in
  localStorage.
- Visible regardless of which BOTTOM tab is active.

### Three-tab center bottom

- **选出的币** (default) — upper "草稿 (N)" chips of `draft_symbols`,
  lower "上次 AI 筛出 (M)" table from the most recent AI screener
  run.  Click "+ 加入" or "+ 全部加入草稿" to commit picks to the
  draft.  Removing a chip via "×" shrinks the draft.
- **代码** — current `draft_code`, read-only viewer.
- **回测** — backtest result viewer (unchanged from v1).

### Two-step AI filter flow

- "筛 24h 成交额 top 30" no longer overwrites `draft_symbols`.
- Result lands in `lastFilteredSymbols` (UI-only, not persisted).
- Bottom tab strong-switches to **选出的币**; user reviews and
  cherry-picks.

### Strong tab auto-switch

- AI emits filter result → switches to 选出的币.
- User accepts a code diff → switches to 代码.
- Backtest finishes → switches to 回测.
- Telemetry: `tab_auto_switch` event with `from`, `to`, `trigger`.

## Telemetry

New events:
- `workspace_load { layout: 'three_zone' | 'legacy' }`
- `focused_symbol_change { source: 'left_rail' | 'filtered_table' | 'draft_chip', symbol }`
- `tab_auto_switch { from, to, trigger }`
- `filtered_add { mode: 'one' | 'all', count }`

## Rollout

Behind feature flag **`workspaceThreeZone`**:
- Default `true` in dev (already on locally).
- Default `false` in prod for the rollout window.
- Flip prod default to `true` in a separate commit after the dogfood
  week; remove the flag and legacy code paths after 2 prod-clean
  weeks.

**Rollback**: flip `workspaceThreeZone` back to `false` — the legacy
`WorkspaceCenterPane` (single column with code/chart/result tabs) is
preserved one release for safety.

## Migration notes

- No backend change.
- No data-model change.  `lastFilteredSymbols` is in-memory only;
  it resets when the user reloads the workspace or switches
  strategies.
- 6 Pencil frames updated; the previous master `OUv6E` is retained
  but marked superseded by `A7ubw` in
  `docs/design/unified-strategy-workspace-frames.md`.
- ~6 vitest specs updated; total goes from 271 → 285 passing.
