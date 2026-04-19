## 1. Prereq check

- [ ] 1.1 Confirm `api-contract-foundation` has been applied (or at least its `api/openapi.yaml` skeleton, `api/errors.md`, `api/examples/` directory, and `openapi-typescript` + `msw` devDeps exist). If not, pause and flag in the apply output — do not bolt schemas onto an empty foundation.
- [ ] 1.2 Run `pnpm api:lint` once to establish a green baseline before edits.

## 2. Error-code registry additions

- [ ] 2.1 Append 4 new values to the `ErrorCode` enum in `api/openapi.yaml`: `STRATEGY_VERSION_NOT_FOUND`, `PARAM_GRID_TOO_LARGE`, `LLM_PROVIDER_FAILED`, `LLM_BUDGET_EXCEEDED`.
- [ ] 2.2 Add one section per new code to `api/errors.md`: when it fires, shape of `details`, suggested UI presentation (same format as the foundation's 15 entries).

## 3. Shared schemas (components section)

- [ ] 3.1 Add `BacktestMode` enum schema (`"preview" | "deep"`).
- [ ] 3.2 Add `MetricsBlock` schema with all fields per the spec (11 numeric fields, `total_trades: integer`, nullable where appropriate).
- [ ] 3.3 Add `MonthlyPoint` schema (`{ month: string "YYYY-MM", return_pct: number }`).
- [ ] 3.4 Add `Trade` schema (`{ id, side, entry_ts, exit_ts, entry_price, exit_price, pnl_pct, duration_hours, reason_in, reason_out }`).
- [ ] 3.5 Add `Signal` schema (`{ signal_id, symbol, ts, kind: "long"|"short"|"flat", indicators: Record<string,number> }`).
- [ ] 3.6 Extend `BacktestConfig` to add `mode`, make `symbols` explicitly 1..50, add optional `preview_lookback_days`, `deep_lookback_days`.
- [ ] 3.7 Extend `BacktestResult` to use `{ summary: { metrics, equity_curve, drawdown_curve, monthly_returns }, per_symbol: Record<string, SymbolResult> }`. Define `SymbolResult` schema (`{ metrics, equity_curve, trades, signals }`).
- [ ] 3.8 Add `StrategyVersion` schema per the spec.
- [ ] 3.9 Add `OptimLensRequest` / `OptimLensResult` / `OptimLensImprovement` schemas per D3–D4 of design.md.
- [ ] 3.10 Add `SignalReviewRequest` / `SignalReviewResult` / `SignalVerdict` schemas per D5.
- [ ] 3.11 Add `TradeExplainRequest` (oneOf: by-id OR inline-trade) / `TradeExplainResult` schemas per D6.
- [ ] 3.12 Add `EngineStatus` schema per D8.
- [ ] 3.13 Add `SymbolMetadata` schema per D9.

## 4. New / modified operations in `api/openapi.yaml`

- [ ] 4.1 `GET /api/symbols/{symbol}/metadata` → `operationId: getSymbolMetadata`. Path param with `^[A-Z0-9_]+$` pattern. Responses: 200 `SymbolMetadata`, 404 `SYMBOL_NOT_FOUND`, 400 `INVALID_SYMBOL`.
- [ ] 4.2 **Extend** `POST /api/backtest/start`: use the extended `BacktestConfig` (multi-symbol + mode). Responses: 200 `TaskResponse`, 400 `INVALID_SYMBOL`/`INVALID_INTERVAL`/`COMPLIANCE_FAILED`, 400 `DATA_UNAVAILABLE`.
- [ ] 4.3 **Extend** `GET /api/backtest/result/{task_id}`: `result` narrowed to the extended `BacktestResult` (summary + per_symbol).
- [ ] 4.4 `GET /api/strategies/{id}/versions` → `listStrategyVersions`. Query: `limit`, `cursor`. Response: `{ items: StrategyVersion[], next_cursor }`.
- [ ] 4.5 `POST /api/strategies/{id}/versions` → `createStrategyVersion`. Body: `{ code, summary?, params_schema?, parent_version? }`. Responses: 200 `StrategyVersion`, 400 `STRATEGY_VERSION_NOT_FOUND` (bad parent_version), 404 `STRATEGY_NOT_FOUND`.
- [ ] 4.6 `GET /api/strategies/{id}/versions/{version}` → `getStrategyVersion`. Responses: 200 `StrategyVersion`, 404 `STRATEGY_VERSION_NOT_FOUND`.
- [ ] 4.7 `POST /api/analysis/optimlens` → `startOptimLens`. Body: `OptimLensRequest`. Responses: 200 `TaskResponse`, 400 `PARAM_GRID_TOO_LARGE`, 402/429 `LLM_BUDGET_EXCEEDED`.
- [ ] 4.8 `GET /api/analysis/optimlens/{task_id}` → `getOptimLensResult`. Response: `TaskResponse<OptimLensResult>`.
- [ ] 4.9 `POST /api/analysis/signals` → `startSignalReview`. Body: `SignalReviewRequest`. Response: `TaskResponse`.
- [ ] 4.10 `GET /api/analysis/signals/{task_id}` → `getSignalReviewResult`. Response: `TaskResponse<SignalReviewResult>`.
- [ ] 4.11 `POST /api/analysis/trade` → `explainTrade`. Body: `TradeExplainRequest` (oneOf). Responses: 200 `TradeExplainResult`, 504 `LLM_PROVIDER_FAILED` on timeout.
- [ ] 4.12 `GET /api/engine/status` → `getEngineStatus`. Response: 200 `EngineStatus`.

## 5. Example fixtures

- [ ] 5.1 `api/examples/getSymbolMetadata.json` — BTC_USDT with plausible values (rank=1, last_price=$64750, change_24h=+1.3%, range from 2023-01-01 to now).
- [ ] 5.2 `api/examples/startBacktest-multi.json` — request body with 3 symbols, mode=deep; response TaskResponse pending.
- [ ] 5.3 `api/examples/getBacktestResult-deep.json` — full deep result with 3 symbols, each having trades/signals, summary aggregated, drawdown curve, monthly returns for 6 months.
- [ ] 5.4 `api/examples/listStrategyVersions.json` — 3 versions of one strategy, linear parent chain.
- [ ] 5.5 `api/examples/createStrategyVersion.json` — response only (request is symmetric).
- [ ] 5.6 `api/examples/getStrategyVersion.json` — single version.
- [ ] 5.7 `api/examples/startOptimLens.json` — request (strategy_id + param_grid with 2 params × 3 values = 6 combos); response TaskResponse pending.
- [ ] 5.8 `api/examples/getOptimLensResult-running.json` — mid-task state with `progress.phase="sweep"`, done=4, total=6.
- [ ] 5.9 `api/examples/getOptimLensResult-done.json` — completed result with 3 plausible `improvements` (one `param_update`, one `code_edit`, one `filter` category).
- [ ] 5.10 `api/examples/startSignalReview.json` — request with `backtest_task_id`; response TaskResponse.
- [ ] 5.11 `api/examples/getSignalReviewResult-done.json` — ~15 verdicts across 3 symbols, mixed good/questionable/bad.
- [ ] 5.12 `api/examples/explainTrade.json` — a complete TradeExplainResult with narrative + indicators + regime + exit reason.
- [ ] 5.13 `api/examples/getEngineStatus.json` — realistic backend metadata.
- [ ] 5.14 Ensure every fixture validates against its schema (`pnpm api:lint` will verify).

## 6. Regenerate TypeScript types

- [ ] 6.1 Run `pnpm api:types`. Commit the updated `src/types/api.d.ts`.
- [ ] 6.2 Run `tsc --noEmit` to confirm no collateral type errors in existing code.

## 7. Regenerate MSW handlers

- [ ] 7.1 Run `pnpm api:mocks`. Confirm `src/mocks/handlers.ts` now includes handlers for all 12 new/extended operations.
- [ ] 7.2 Spot-check: run `pnpm dev:mock` and verify `fetch('/api/engine/status')` from DevTools returns the fixture.
- [ ] 7.3 Spot-check: verify a POST handler returns `TaskResponse` with `status: "pending"` (e.g. `POST /api/analysis/optimlens`).

## 8. Extend `cremote` contract client

- [ ] 8.1 Add typed methods to `src/services/remote/contract-client.ts`:
  - `cremote.getSymbolMetadata({ symbol })`
  - `cremote.listStrategyVersions({ strategy_id, cursor?, limit? })`
  - `cremote.createStrategyVersion({ strategy_id, body })`
  - `cremote.getStrategyVersion({ strategy_id, version })`
  - `cremote.startOptimLens({ body })`
  - `cremote.getOptimLensResult({ task_id })`
  - `cremote.startSignalReview({ body })`
  - `cremote.getSignalReviewResult({ task_id })`
  - `cremote.explainTrade({ body })`
  - `cremote.getEngineStatus()`
- [ ] 8.2 For the extended `startBacktest` / `getBacktestResult`: widen the existing method signatures (no new method; same operationId, updated types).
- [ ] 8.3 For each new method: if the real backend doesn't implement the endpoint yet (all of them at this point), `cremote.*` still works against MSW. When pointed at the real backend, the call returns 404 → `cremote` translates to `NOT_FOUND` error which surfaces in the UI. Document this in code comments.
- [ ] 8.4 Expose new IPC channels in `desktop-client/electron/preload.ts` + `electron/ipc/remote.ts` for any operation that needs to go through the main process (generally all of them go through `fetch(baseURL + path)`; no new IPC channels needed if the existing generic passthrough covers them — verify).

## 9. Tests

- [ ] 9.1 `src/mocks/handlers.test.ts`: extend to cover at least one operation from each new capability (optimlens, signal-review, trade-explain, strategy-versions, engine-status, symbol-metadata).
- [ ] 9.2 `src/services/remote/contract-client.test.ts`: one happy + one error case per new method; verify types narrow correctly using `// @ts-expect-error` probes.
- [ ] 9.3 Add a dedicated test for the legacy-adapter: confirm that when the real backend emits a legacy `startBacktest` response (single symbol, flat result), `cremote.startBacktest` adapter produces the canonical shape with `per_symbol` containing a single entry.
- [ ] 9.4 Ensure `pnpm test` grows by ≥ 10 cases vs pre-change.

## 10. Documentation

- [ ] 10.1 Update `api/README.md`: mention the 3 new capabilities, link to relevant design.md decisions, document the `PARAM_GRID_TOO_LARGE` default of 50 (changeable later).
- [ ] 10.2 Add a "Budget & cost" section noting that `LLM_BUDGET_EXCEEDED` is defined but not yet enforced; enforcement comes in the backend-implementation change.
- [ ] 10.3 Cross-link from `TESTING.md` → new test files for MSW coverage of new endpoints.

## 11. Final validation

- [ ] 11.1 `pnpm api:lint` returns 0. All fixtures validate.
- [ ] 11.2 `pnpm api:types` regen produces no diff vs committed.
- [ ] 11.3 `pnpm api:mocks` regen produces no diff vs committed.
- [ ] 11.4 `tsc --noEmit` clean.
- [ ] 11.5 `pnpm test` all green, new cases counted.
- [ ] 11.6 `pnpm dev:mock` launches, all 12 new operations reachable via fetch from DevTools.
- [ ] 11.7 Root `make test` green.
