## Why

The `backtest-engine` types already declare `BacktestConfig.Symbols []string` and `BacktestResult.PerSymbol map[string]MetricsSet` — the model supports multi-symbol in principle. However:

- The current sandbox invocation likely assumes a single symbol (needs verification)
- `mode: "preview" | "deep"` is in the contract but not implemented as a first-class field driving default lookback
- No aggregation logic for `summary` across symbols
- The worker may not parallelize across symbols

This change implements the multi-symbol + preview/deep runtime so the UI (Workspace Preview / Deep / Multi-Symbol-Grid) has real data.

## What Changes

**Multi-symbol runner**:
- `BacktestService.Submit` accepts `config.Symbols: []string` (1..50)
- For each symbol, spin up an independent sandbox run (concurrency limit via config)
- Collect per-symbol results
- Aggregate into `summary` (equally weighted average of equity curves + aggregated metrics)

**Mode semantics**:
- `mode: "preview"` → if `preview_lookback_days` not set, default to 7 days
- `mode: "deep"` → default 180 days, or caller-overridden
- Validation: reject `mode: "preview"` + `deep_lookback_days` as conflicting

**Per-symbol result structure**:
- `result.per_symbol[sym]` contains `{ metrics, equity_curve, trades, signals }`
- `result.summary` contains aggregated `{ metrics, equity_curve, drawdown_curve, monthly_returns }`

**Validation**:
- `symbols: []` (empty) → `INVALID_SYMBOL` with `details.invalid_symbols: []` (empty array = "no symbols given")
- Any invalid symbol → `INVALID_SYMBOL` + `details.invalid_symbols: ["XYZ_USDT"]`
- Any missing data range → `DATA_UNAVAILABLE` + `details.missing: [{symbol, missing_range}]`
- Validation happens **before** any sandbox starts (no partial runs)

**Concurrency**:
- Config `backtest.max_concurrent_symbols` (default 4)
- Per-symbol results come in as goroutines finish; task progress `{ phase: "backtest", done: N, total: M }`

## Capabilities

### New Capabilities
*(None.)*

### Modified Capabilities
- `backtest-api`: Accepts multi-symbol config + mode enum; result includes summary + per_symbol.

## Impact

**Modified files**
- `backtest-engine/internal/service/backtest_service.go` — `Submit` launches per-symbol runs, aggregates
- `backtest-engine/internal/model/backtest.go` — ensure struct fields match canonical contract (`Summary`, `PerSymbol` as map)
- `backtest-engine/internal/handler/backtest.go` — validate request's symbols + mode
- `backtest-engine/internal/sandbox/manager.go` — may need per-symbol launch pattern if single-symbol is hardcoded
- `backtest-engine/sandbox/framework/claw/engine.py` — verify Python framework accepts multi-symbol data slice (likely already does)
- `backtest-engine/config.yaml` — add `backtest.max_concurrent_symbols: 4`

**New files**
- `backtest-engine/internal/service/aggregate.go` — metrics aggregation across symbols

**Depends on**
- `api-contract-new-capabilities` (contract for multi-symbol shape)
- `backtest-engine-align-contract` (canonical envelope + error codes)

**Out of scope**
- Portfolio backtesting (shared capital across symbols) — different semantic
- Walk-forward / Monte Carlo — different modes, not in current contract
- Per-symbol capital weighting — all symbols equally weighted for summary
