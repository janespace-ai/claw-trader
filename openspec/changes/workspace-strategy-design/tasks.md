## 1. Prereq check

- [ ] 1.1 Verify `ui-foundation` has landed: `WorkspaceShell`, `ClawChart.Candles`, `AIPersonaShell`, `workspaceStore`, `AppRoute` type, tailwind token alignment.
- [ ] 1.2 Verify `api-contract-foundation` + `api-contract-new-capabilities`: `cremote.startBacktest` (with mode), `cremote.createStrategy`, `cremote.createStrategyVersion`, `cremote.listStrategies`. Run `pnpm typecheck` to confirm types compile.

## 2. Strategist persona wiring

- [ ] 2.1 Create `src/services/prompt/personas/strategist.ts`:
  - Export `strategistSystemPrompt(context: { focusedSymbol, interval, indicators, replyLang })`
  - Instructs the model to emit prose + ` ```json summary ``` ` + ` ```python ``` ` blocks in order
  - Includes explicit output schema for the summary JSON
- [ ] 2.2 Create `src/services/prompt/personas/parsers.ts`:
  - `parseStrategistOutput(raw): { prose: string, summary: StrategySummary | null, code: string | null }`
  - Regex walks the message, extracts json block, tries `JSON.parse`, falls back to null on invalid
  - Unit tests: happy path, no json, invalid json, missing code, multiple code blocks (take last)
- [ ] 2.3 Extend `AIPersonaShell` strategist persona to use this prompt + parser
- [ ] 2.4 `StrategySummaryCard` imported inside message rendering — when an assistant message has a parsed summary, render the card inline above (not replacing) the code block.
- [ ] 2.5 Remove `onApply` / `onDismiss` props from `StrategySummaryCard` (vestigial; auto-save handles it).

## 3. Draft persistence store

- [ ] 3.1 Create `src/stores/workspaceDraftStore.ts`:
  - State: `{ strategyId: string | null, version: number | null, name: string, code: string | null, summary: StrategySummary | null, params: Record<string, number | string> }`
  - Actions: `setDraft({ summary, code })`, `updateParam(key, value)`, `clear()`
- [ ] 3.2 On assistant message with parsed summary + code:
  - Call `setDraft({ summary, code })`
  - Then call auto-save flow: create strategy if none, create version
  - Update `workspaceStore.currentStrategyId`, `workspaceDraftStore.version`

## 4. Screen component

- [ ] 4.1 Create `src/screens/workspace/StrategyDesign.tsx` skeleton using `WorkspaceShell`.
- [ ] 4.2 `StrategyTopbar.tsx` — symbol selector (dropdown from `cremote.listSymbols({ limit: 50 })`), timeframe chips, indicator chips, "Run Preview" CTA.
- [ ] 4.3 Main area: mount `ClawChart.Candles` with data from `cremote.getKlines({ symbol, interval, from, to })`. Default `from` = `now - 30d`, `to` = `now`.
- [ ] 4.4 Below chart: tabs row (`Strategy | Screener | Metrics | Trades | Code`). In this change, only `Strategy` active. Others hidden or disabled ("Coming in Preview/Deep").
- [ ] 4.5 `StrategyDraftCard.tsx` — binds to `workspaceDraftStore`. Shows structured fields + editable params. Handles debounced param updates.
- [ ] 4.6 `RunPreviewCard.tsx` — purple gradient card bottom-right, visible only when `workspaceDraftStore.code !== null`. Contains the "Run Preview" button (duplicated from topbar CTA for prominence).

## 5. Run Preview flow

- [ ] 5.1 `onRunPreview` handler: debounce 500ms, sets button to "Running", calls `cremote.startBacktest({ code, config: { symbols: [focusedSymbol], mode: "preview" } })`.
- [ ] 5.2 On success: `workspaceStore.enterPreview(strategyId, task_id)`. UI transitions (App.tsx now renders Preview screen once #5 ships; in this change it shows "Preview workspace — coming in change #5" placeholder).
- [ ] 5.3 On failure:
  - `COMPLIANCE_FAILED` → show violations list under draft card
  - `INVALID_SYMBOL` / `INVALID_INTERVAL` → toast
  - Other codes → generic toast with error code
- [ ] 5.4 Reset button state on error.

## 6. Symbol switch context reset

- [ ] 6.1 On `focusedSymbol` change in `workspaceStore`:
  - Chart re-fetches klines for new symbol
  - Draft card + draft store retain current draft (editing continues)
  - Append a system-ish message to the chat: "Symbol switched to {sym}; previous advice may not apply" (1 line, muted style)
  - Strategist prompt's next turn uses new symbol context

## 7. Route wiring

- [ ] 7.1 Update `src/App.tsx`: for `route.kind === "workspace"`:
  - If `workspaceStore.mode === "design"` → render `<StrategyDesign />`
  - If `mode === "preview"` → placeholder "Preview workspace coming in change #5"
  - If `mode === "deep"` → placeholder "Deep workspace coming in change #6"
- [ ] 7.2 Update `TopBar.tsx`: "Backtest" tab click → `appStore.navigate({ kind: "workspace" })` (mode defaults to `design`).
- [ ] 7.3 Strategies page's "Open" button on a card → `navigate({ kind: "workspace", strategyId })` + `workspaceStore.enterDesign(id)` (helper action).

## 8. Visual regression + unit tests

- [ ] 8.1 `e2e/visual/workspace-strategy-design.spec.ts`: 4 snapshots — `dark-empty`, `dark-with-draft`, `light-empty`, `light-with-draft`. Use MSW `happy` + seed `workspaceDraftStore` in a test-only route.
- [ ] 8.2 Vitest: `screens/workspace/StrategyDesign.test.tsx` — smoke render + Run Preview click + symbol switch.
- [ ] 8.3 Vitest: `services/prompt/personas/parsers.test.ts` — 6+ cases for `parseStrategistOutput`.
- [ ] 8.4 Vitest: `stores/workspaceDraftStore.test.ts` — setDraft + param update debounce.

## 9. Docs

- [ ] 9.1 Update `docs/design-alignment.md` — new rows for `StrategyDraftCard`, `RunPreviewCard`, `StrategyTopbar`.

## 10. Final validation

- [ ] 10.1 `pnpm typecheck`, `pnpm test`, `pnpm test:visual` all green.
- [ ] 10.2 Manual: `pnpm dev:mock`, navigate to workspace, interact with AI, see draft card populate, see Run Preview button transition. Verify nothing errors in devtools.
- [ ] 10.3 Run in real-backend mode (`pnpm dev`) — verify AI Strategist still works end-to-end. Only the Run Preview transition target differs.
