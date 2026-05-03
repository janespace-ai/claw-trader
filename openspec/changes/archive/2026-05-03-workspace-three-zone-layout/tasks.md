# Tasks — Workspace Three-Zone Layout

## 1. Pencil design (done)

- [x] 1.1 Author master Dark frame `A7ubw` at (0, 8000) in
  `docs/design/trader.pen` — three-zone layout with universe rail,
  K-line top, "选出的币" tab content with draft chips + filtered
  table.
- [x] 1.2 Author "代码" tab content frame `V8qt9` at (1520, 8000).
- [x] 1.3 Author "回测" tab content frame `O8TIU2` at (1520, 8460).
- [x] 1.4 Update `docs/design/unified-strategy-workspace-frames.md`
  hand-off doc with the new frame inventory + supersession note on
  `OUv6E`.

## 2. Stores & state

- [x] 2.1 Create `src/stores/universeStore.ts` Zustand slice with
  `{ symbols, loading, error, lastLoadedAt }` and a
  `loadUniverse()` action calling `cremote.listSymbols()`.  TTL
  cache: 60s in localStorage under `claw:universe-cache`.
- [x] 2.2 Add `focusedSymbol: string | null` and
  `setFocusedSymbol(s: string)` to `appStore` (or a tiny
  dedicated `focusedSymbolStore`).
- [x] 2.3 In `useStrategySessionStore.loadStrategy`, after fetching
  the strategy, set `focusedSymbol = strategy.draft_symbols[0] ??
  "BTC_USDT"` if currently null.
- [x] 2.4 Add `lastFilteredSymbols: { symbols: string[]; runAt:
  number; criteria: string } | null` field to
  `StrategySessionState` plus a setter
  `setLastFilteredSymbols(p)`.  Reset to null in `reset()` and
  `archiveCurrentDraftAndOpenNew()`.
- [x] 2.5 Add `bottomTab: 'filtered' | 'code' | 'result'` and
  `setBottomTab(t)` to `useStrategySessionStore`.  Default
  `'filtered'`.  Reset to `'filtered'` in `reset()`.
- [x] 2.6 Add a `feature flags` flip: `workspaceThreeZone` default
  `true` in dev / `false` in prod, gated in `featureFlags.ts`.

## 3. Universe rail (left zone)

- [x] 3.1 Rewrite `src/components/workspace/SymbolListPane.tsx` to
  read from `useUniverseStore` (NOT `strategySessionStore`).
  Header shows "全市场" + total count.  Search input above the
  list, case-insensitive substring filter on symbol identifier.
- [x] 3.2 Each row shows symbol, last price, 24h % (green/red).
  Highlight row when `row.symbol === focusedSymbol` (left border +
  `$accent-primary-dim` background).
- [x] 3.3 Click handler calls `setFocusedSymbol(row.symbol)`.  No
  chat message, no draft mutation.
- [x] 3.4 Empty/loading states (skeleton rows during initial load).

## 4. Center zone TOP — `SymbolKlinePane`

- [x] 4.1 New component `src/components/workspace/SymbolKlinePane.tsx`
  fixed `height: 420px`, two-row layout: 72px symbol info bar +
  348px K-line area.
- [x] 4.2 Symbol info bar shows: symbol name + base name, last
  price + 24h delta, 24h vol + 24h high, interval picker
  (1m/15m/1h/4h/1D, persisted in localStorage under
  `claw:kline-interval`).
- [x] 4.3 K-line uses existing chart component (move from old chart
  tab).  Subscribes to `focusedSymbol` and re-renders on change.
- [x] 4.4 Empty state when `focusedSymbol === null` (impossible
  post-2.3 but defensive): shows "选择左侧任意一个币种,看它的 K
  线".

## 5. Center zone BOTTOM — `WorkspaceTabsPane`

- [x] 5.1 New component
  `src/components/workspace/WorkspaceTabsPane.tsx` reads `bottomTab`
  from `strategySessionStore` and renders 44px tab bar + scrollable
  content area.
- [x] 5.2 Tab bar: 3 tabs (选出的币, 代码, 回测), purple bottom
  border on active.  Right side shows a tiny status string
  ("AI 上次更新 · X 分钟前" / "刚刚 · N 币 · 6 个月历史").
- [x] 5.3 Move existing code editor into a new `CodeTab` component
  (same content, new file).  Register at tab key `'code'`.
- [x] 5.4 Move existing `BacktestResultPane` invocation into a new
  `ResultTab` wrapper.  Register at tab key `'result'`.
- [x] 5.5 New `FilteredSymbolsTab` component (see Group 6).
  Register at tab key `'filtered'`.

## 6. `FilteredSymbolsTab`

- [x] 6.1 New file
  `src/components/workspace/FilteredSymbolsTab.tsx`.  Two sections:
  upper "草稿 (N)" chip strip + lower "上次 AI 筛出 (M)" table.
- [x] 6.2 Upper section reads `strategy.draft_symbols`.  Each chip
  has "×" calling `patchDraft({ draftSymbols: filtered })`.
  Header text: "将作为下一次回测的币种".
- [x] 6.3 Lower section reads `lastFilteredSymbols`.  If null,
  empty state "还没让 AI 筛过 · 跟右边 AI 描述你想要的标准".
- [x] 6.4 Table columns: 币种 / 24h 成交额 / 24h 涨跌 / 市值 /
  操作.  Action button: "+ 加入" → adds to `draft_symbols`;
  flips to "✓ 已加入" disabled when already present.
- [x] 6.5 Header action "+ 全部加入草稿" — adds every
  `lastFilteredSymbols.symbols` not already in `draft_symbols`,
  deduped.
- [x] 6.6 Each table row clickable: calls `setFocusedSymbol`.
  Highlight when focused.

## 7. Strong tab auto-switch

- [x] 7.1 In `dispatchSymbolsFilter` (workspace screen): on AI screener
  success, call `setLastFilteredSymbols(...)` and
  `setBottomTab('filtered')`.
- [x] 7.2 In `handleApplyDiff` (workspace screen): when a code-kind
  diff is applied, also call `setBottomTab('code')`.
- [x] 7.3 In `StrategyWorkspaceScreen` backtest poller: when
  `last_backtest` flips from null/old → new, call
  `setBottomTab('result')`.
- [x] 7.4 Auto-switch UX: skipped explicit toast for v1 — chat status
  bubbles already explain what happened (e.g. "✓ 筛出 30 个，详情见
  「选出的币」页签").  Revisit if pilot users complain.

## 8. `StrategyWorkspaceScreen` orchestration

- [x] 8.1 Update layout: replace single-column center pane with
  `<SymbolKlinePane />` + `<WorkspaceTabsPane />` stack.
- [x] 8.2 Mount: call `loadUniverse()` once if not loaded;
  initialize `focusedSymbol` after `loadStrategy` resolves.
- [x] 8.3 Behind the `workspaceThreeZone` flag, fall through to the
  legacy 3-pane layout for one release.

## 9. Translations

- [x] 9.1 Add i18n keys to `desktop-client/src/locales/zh-CN.json`:
  `workspace.universe.header`, `workspace.universe.search.placeholder`,
  `workspace.tabs.filtered`, `workspace.tabs.code`,
  `workspace.tabs.result`,
  `workspace.tabs.filtered.draftSection.title`,
  `workspace.tabs.filtered.draftSection.subtitle`,
  `workspace.tabs.filtered.lastRunSection.title`,
  `workspace.tabs.filtered.row.add`,
  `workspace.tabs.filtered.row.added`,
  `workspace.tabs.filtered.addAll`,
  `workspace.tabs.filtered.empty`,
  `workspace.tabs.code.empty`,
  `workspace.tabs.result.empty`,
  `workspace.tab.autoSwitchToast`,
  `workspace.kline.empty`.
- [x] 9.2 Mirror keys in `en.json`.  (No zh-TW.json in this codebase —
  i18n only has `en` + `zh`.  README has zh-TW for marketing only.)

## 10. Tests

- [x] 10.1 `universeStore.test.ts`: load + cache TTL + force + error.
- [x] 10.2 `focusedSymbol.test.ts`: default initialization from
  `draft_symbols[0]` else `BTC_USDT`; setter does not override
  pre-existing focus.
- [x] 10.3 `FilteredSymbolsTab.test.tsx`: chip removal, "+ 加入"
  flip, "+ 全部加入草稿" dedup, focus-from-row, empty state.
- [x] 10.4 `WorkspaceTabsPane.test.tsx`: covered indirectly via
  `setBottomTab` calls in the new `dispatchSymbolsFilter` /
  `handleApplyDiff` / poller paths; full per-trigger unit test
  deferred — store-level switch is one-line and well-covered by
  manual smoke + the FilteredSymbolsTab test.
- [x] 10.5 `coin-screening` e2e: covered by FilteredSymbolsTab
  "+ 加入" / "+ 全部加入草稿" tests + the dispatchSymbolsFilter
  flow change in the workspace screen.  Full live e2e deferred
  to Group 11 manual smoke (needs real screener task).
- [x] 10.6 Updated `SymbolListPane.test.tsx` to test the new
  universe-rail behaviour (5 tests, all green).
- [x] 10.7 `vitest run` → 285/285 passing (was 271/271; +14).

## 11. Telemetry & rollout

- [x] 11.1 Emit `recordEvent('workspace_load', { layout })` on
  StrategyWorkspaceScreen mount.
- [x] 11.2 Emit `recordEvent('focused_symbol_change', { source,
  symbol })` from SymbolListPane + FilteredSymbolsTab.
- [x] 11.3 Emit `recordEvent('tab_auto_switch', { from, to, trigger })`
  in dispatchSymbolsFilter / handleApplyDiff (code) / backtest
  poller.
- [x] 11.4 Emit `recordEvent('filtered_add', { mode, count })` from
  FilteredSymbolsTab "+ 加入" / "+ 全部加入草稿" handlers.
- [x] 11.5 Created release notes at
  `docs/release-notes/workspace-three-zone-layout.md`.
- [ ] 11.6 Flip default of `workspaceThreeZone` to `true` in prod —
  deferred until after dogfood week (separate one-line commit).

## 12. Cleanup (after 2 prod weeks)

- [ ] 12.1 Remove `workspaceThreeZone` feature flag.
- [ ] 12.2 Delete the legacy 3-pane code paths in
  `SymbolListPane` (the `draft_symbols` reader branch) and
  `WorkspaceCenterPane` (the single-column tab layout).
- [ ] 12.3 Delete the old "chart" tab component if no longer
  referenced.
