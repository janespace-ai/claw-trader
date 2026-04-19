## 1. Prereqs + audit

- [ ] 1.1 `backtest-engine-align-contract` landed (canonical envelope + error codes).
- [ ] 1.2 Audit current `BacktestService.Submit` and sandbox `manager.Start` for single-symbol assumptions.
- [ ] 1.3 Audit the Python framework (`backtest-engine/sandbox/framework/claw/engine.py`) — does it handle one symbol or accept multi? Document findings.

## 2. Config + types

- [ ] 2.1 Add `config.backtest.max_concurrent_symbols` with default 4.
- [ ] 2.2 Ensure `model.BacktestConfig` has: `Symbols []string`, `Mode BacktestMode`, `PreviewLookbackDays *int`, `DeepLookbackDays *int`.
- [ ] 2.3 Ensure `model.BacktestResult` has `Summary SummaryBlock` + `PerSymbol map[string]SymbolResult`.
- [ ] 2.4 Define `SummaryBlock` + `SymbolResult` types.

## 3. Upfront validation

- [ ] 3.1 `service.validateSubmit(cfg BacktestConfig) *errors.HTTPError`: checks symbols exist, interval valid, range has data for each symbol.
- [ ] 3.2 Returns typed `INVALID_SYMBOL`, `INVALID_INTERVAL`, `INVALID_RANGE`, `DATA_UNAVAILABLE`.
- [ ] 3.3 Unit tests (use `testdb`).

## 4. Multi-symbol runner

- [ ] 4.1 `service.Submit(...)` rewrite:
  - validate upfront
  - insert run row
  - for each symbol, acquire semaphore slot → launch sandbox
  - each sandbox reports back via callback (existing `/internal/cb/*` channels)
  - service aggregates when all done
- [ ] 4.2 Callback handler collects per-symbol results into a `map[sym]SymbolResult` keyed by run_id.
- [ ] 4.3 When `done_count == total`, trigger aggregation step.
- [ ] 4.4 Update run row with `status: "done"` + full `BacktestResult`.

## 5. Aggregation module

- [ ] 5.1 `service/aggregate.go`:
  - `aggregateSummary(perSymbol map[string]SymbolResult) SummaryBlock`
  - Time-align all equity curves to common grid (min interval).
  - Equal-weighted mean equity.
  - Compute drawdown curve from summary equity.
  - Compute summary metrics from summary equity + combined trade list.
  - Monthly returns mean.
- [ ] 5.2 Unit tests with hand-computed golden values.

## 6. Progress reporting

- [ ] 6.1 `Status` handler reads current `done_count` from service's in-memory map → returns `progress: { phase: "backtest", done, total }`.
- [ ] 6.2 During aggregation: `progress: { phase: "aggregate", done: 0, total: 1 }`.
- [ ] 6.3 Update `TaskResponse.progress` per the canonical shape.

## 7. Mode-driven lookback

- [ ] 7.1 `resolveLookback(mode, cfg) (from, to int64, err)`:
  - If mode=preview, default from = now - 7d
  - If mode=deep, default from = now - 180d
  - Explicit `preview_lookback_days` / `deep_lookback_days` overrides
  - Conflict (preview + deep_lookback) → INVALID_RANGE

## 8. Tests

- [ ] 8.1 `service/backtest_service_test.go`:
  - 3-symbol preview run: validates, launches, aggregates, emits correct shape.
  - Single-symbol degenerate case.
  - Bad symbol rejection.
  - Data-unavailable rejection.
  - Mode conflict rejection.
- [ ] 8.2 `service/aggregate_test.go` — hand-computed correctness.
- [ ] 8.3 `handler/backtest_test.go` extended with contract checks (already covered by `contract_test.go` from align-contract, but add a multi-symbol scenario).

## 9. Sandbox adjustments (if needed)

- [ ] 9.1 If sandbox manager today launches single containers with a single-symbol env var, adapt to launch per-symbol containers with `CLAW_SYMBOL=<sym>` env.
- [ ] 9.2 Python framework (`engine.py`) — ensure it reads the env and filters to that symbol. Likely already works; confirm.

## 10. Documentation

- [ ] 10.1 Update `openspec/specs/backtest-api/spec.md` (via the sync flow after archive) with the multi-symbol requirements.
- [ ] 10.2 Update `api/README.md` — "Multi-symbol semantics" section.

## 11. Final validation

- [ ] 11.1 Go tests green.
- [ ] 11.2 `make test-contract` validates the new multi-symbol shapes.
- [ ] 11.3 End-to-end: from desktop-client UI (Workspace Preview / Deep), run a multi-symbol backtest against real backend. Verify per_symbol map populated + summary aggregated.
