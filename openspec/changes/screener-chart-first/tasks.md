## 1. Prereqs

- [ ] 1.1 `ui-foundation`, `api-contract-foundation` landed. The `chat-auto-run-screener` branch has merged (or at least its content is inherited via branch base).

## 2. Screener persona

- [ ] 2.1 Move `src/services/chat/screenerRunner.ts` → `src/services/prompt/personas/screener/runner.ts` (co-located with persona).
- [ ] 2.2 Rename `src/stores/autoRunStore.ts` → `src/stores/screenerRunStore.ts`. Update imports repo-wide.
- [ ] 2.3 Create `src/services/prompt/personas/screener.ts` — system prompt (reuse the existing `promptMode: "screener"` content).
- [ ] 2.4 Register `screener` persona in `AIPersonaShell.personas` with the runner + transcript renderer.
- [ ] 2.5 Delete `src/components/chat/AutoRunStatus.tsx`; its render logic moves into the Screener persona's transcript renderer.

## 3. New screen

- [ ] 3.1 Create `src/screens/ScreenerScreen.tsx` using `WorkspaceShell`.
- [ ] 3.2 Topbar: `ScreenerTopbar.tsx` with saved-lists button, timeframe chips, Run screener button.
- [ ] 3.3 LeftRail: reuse `Watchlist` primitive; split items into `passed` + `failed` sections via a new `<WatchlistSection>` wrapper (or `Watchlist` prop `sections?`).
- [ ] 3.4 Main chart: `ClawChart.Candles` with `markers` prop sourced from `screenerRunStore.results.signals_per_symbol[focusedSymbol]`.
- [ ] 3.5 RightRail: `<AIPersonaShell persona="screener" context={{ focusedSymbol }} />`.

## 4. Saved lists overlay

- [ ] 4.1 `src/components/screener/SavedListsOverlay.tsx` — slide-in from left, renders `window.claw.db.coinLists.list()`.
- [ ] 4.2 "Save current" action: reads passed symbols, prompts for name, calls `db.coinLists.save`.
- [ ] 4.3 "Load" action: populates `screenerRunStore.results` with a synthetic result object whose passed symbols match the list.

## 5. Signal markers

- [ ] 5.1 Extend `screenerRunStore` to preserve `signals_per_symbol` from the screener result.
- [ ] 5.2 Wire `ClawChart.Candles` markers from the focused symbol's signals.
- [ ] 5.3 Style markers: orange diamond (`$accent-yellow` actually; diamond shape via `setMarkers` shape field).

## 6. Route wiring + deletion

- [ ] 6.1 `App.tsx`: `route.kind === "screener"` renders `<ScreenerScreen />`.
- [ ] 6.2 Delete `src/pages/ScreenerPage.tsx`.
- [ ] 6.3 Delete `src/components/chat/AutoRunStatus.tsx` (content already moved).
- [ ] 6.4 Delete `src/services/chat/screenerRunner.ts` (moved).

## 7. Migrate existing tests

- [ ] 7.1 `src/services/chat/screenerRunner.test.ts` → `src/services/prompt/personas/screener/runner.test.ts`, update imports.
- [ ] 7.2 Add new tests: `src/screens/ScreenerScreen.test.tsx` smoke, `src/components/screener/SavedListsOverlay.test.tsx`.
- [ ] 7.3 Visual regression `e2e/visual/screener.spec.ts` with 5 baselines.

## 8. Documentation

- [ ] 8.1 `docs/design-alignment.md` — add `ScrRow` (Pencil) → `Watchlist row (passed)`, signal marker → `ClawChart.Markers orange`.
- [ ] 8.2 `TESTING.md` note the screener-test path change.

## 9. Final validation

- [ ] 9.1 All tests green (including renamed tests).
- [ ] 9.2 Manual: auto-run flow still works, signal markers overlay correctly, saved lists load.
- [ ] 9.3 Visual baselines look right on both themes.
