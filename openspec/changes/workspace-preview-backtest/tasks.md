## 1. Prereqs

- [ ] 1.1 `ui-foundation` + `workspace-strategy-design` landed. `api-contract-*` landed.
- [ ] 1.2 Verify `cremote.getBacktestResult`, `startSignalReview`, `getSignalReviewResult`, `startBacktest(mode:"deep")` are all in the contract client.

## 2. Signal Review persona

- [ ] 2.1 Create `src/services/prompt/personas/signalReview.ts` — system prompt template that receives `{ verdicts: SignalVerdict[], summary, backtest_context }` context. The prompt is only used when the user chats (the automated verdicts come from the backend); it lets the AI answer follow-ups grounded in the verdict list.
- [ ] 2.2 Register `signal-review` persona in `src/components/primitives/AIPersonaShell/personas.ts`. `Composer` enabled. Intro auto-populates summary line once verdicts arrive.
- [ ] 2.3 Verdict list renderer `src/components/chat/VerdictList.tsx` — reads `autoRunStore`-analog (new `signalReviewStore`) and renders pills. Click emits `onSelectVerdict(signal_id)`.

## 3. signalReviewStore + auto-trigger

- [ ] 3.1 Create `src/stores/signalReviewStore.ts` — tracks one active review per backtest task: `{ taskId, status, verdicts[], error? }`.
- [ ] 3.2 Hook `useAutoSignalReview(backtestTaskId)` — on mount, if no entry exists for this taskId, call `cremote.startSignalReview` + poll via `cremote.getSignalReviewResult` in a loop. Handle 404 gracefully (no review backend yet → show "unavailable" banner, not an error).
- [ ] 3.3 Wire into PreviewBacktest screen root so the review kicks on entry.

## 4. Screen component

- [ ] 4.1 Create `src/screens/workspace/PreviewBacktest.tsx` — uses `WorkspaceShell`, consumes `workspaceStore.currentTaskId`, fetches backtest result, renders everything downstream.
- [ ] 4.2 `PreviewTopbar.tsx` — summary line (derived from result), "Confirm + Run Deep" button.
- [ ] 4.3 Main chart: `ClawChart.Candles` + `ClawChart.Markers`. Wire `onMarkerClick(tradeId)` to `signalReviewStore` highlight action.
- [ ] 4.4 LeftRail: reuse `Watchlist` primitive; items from `per_symbol` keys.
- [ ] 4.5 Bottom tabs container: `Trades | Quick Metrics | AI Review`. Persist selected tab in `localStorage`.
- [ ] 4.6 `TradesTab.tsx` — virtualized table (start with non-virtualized + 200 cap; measure; upgrade to `react-window` if needed).
- [ ] 4.7 `QuickMetricsTab.tsx` — uses `MetricsGrid` with 6 tiles from `summary.metrics`.
- [ ] 4.8 `AIReviewTab.tsx` — renders the same verdict list as RightRail but in a fuller table layout.

## 5. Cross-navigation: verdict ↔ chart

- [ ] 5.1 Clicking a verdict pill: set `workspaceStore.focusedSymbol` if different, then call `chart.timeScale().scrollToPosition(...)` centered on `entry_ts`.
- [ ] 5.2 Clicking a chart marker: find verdict by `signal_id`, scroll the RightRail transcript to it + apply pulse highlight (CSS animation 300ms).

## 6. Confirm + Run Deep flow

- [ ] 6.1 Button handler: `cremote.startBacktest({ code: workspaceDraftStore.code, config: { symbols, mode: "deep" } })`.
- [ ] 6.2 On success: `workspaceStore.enterDeep(newTaskId)`.
- [ ] 6.3 On failure: toast + button reset.
- [ ] 6.4 While `workspaceStore.mode === "deep"` but Deep screen (#6) not yet shipped, render a placeholder "Running deep backtest — coming in change #6" with a spinner.

## 7. Visual regression + unit tests

- [ ] 7.1 `e2e/visual/workspace-preview-backtest.spec.ts` — 4 baselines per Requirement 6.
- [ ] 7.2 Vitest: `screens/workspace/PreviewBacktest.test.tsx` — mount with seeded result, verify verdict list renders, click verdict → symbol changes.
- [ ] 7.3 Vitest: `stores/signalReviewStore.test.ts` — auto-trigger idempotence, 404 handling, poll loop abort.
- [ ] 7.4 Vitest: `services/prompt/personas/signalReview.test.ts` — prompt templating.

## 8. Documentation

- [ ] 8.1 `docs/design-alignment.md` rows: `TradeRow`, `PreviewTopbar`, `VerdictList`, `AIReviewTab`.
- [ ] 8.2 `TESTING.md` — note any new MSW fixtures added for verdict list.

## 9. Final validation

- [ ] 9.1 All tests green, visual baselines match.
- [ ] 9.2 Manual: run Design → Preview end-to-end against MSW; verify verdicts render + Confirm transitions to (placeholder) Deep.
- [ ] 9.3 Manual: run against real backend — verify fallback banner when Signal Review backend returns 404.
