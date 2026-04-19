## Context

The Go types already declare multi-symbol support, but the runtime wiring (service + sandbox invocation + aggregation) needs to actually implement it. This change is the "do what the types claim" task.

## Goals / Non-Goals

**Goals:**
- One backtest submission with `symbols: ["BTC_USDT", "ETH_USDT", "SOL_USDT"]` yields one `task_id`, eventually one result containing per-symbol results + aggregate summary.
- `mode: "preview"` vs `"deep"` differs in default lookback.
- Per-symbol runs parallelized (bounded).
- Validation happens upfront — no partial task state from a bad symbol.

**Non-Goals:**
- Portfolio (shared capital) backtests.
- Custom per-symbol weighting.
- Walk-forward / Monte Carlo.
- Cross-symbol strategies (e.g. BTC-based signals trading ETH).

## Decisions

### D1. One task, multiple sandbox runs, aggregated when all done

**Decision.** `BacktestService.Submit({ code, symbols, mode, ... })`:

1. Validate symbols (all exist in DB) + mode → errors upfront
2. Insert one `backtest_runs` row with `status: pending`, `config.symbols`
3. Launch N sandbox containers (bounded by `max_concurrent_symbols`)
4. Each reports progress via callback to main service
5. When all N complete, aggregate summary + store full result
6. Update run row to `status: done` with the combined result

Task progress reported as `{ phase: "backtest", done: N_finished, total: N_total }`.

### D2. Aggregation: equally weighted, equity curves time-aligned

**Decision.** For the `summary` block:

- `equity_curve`: for each timestamp t, `summary.equity[t] = mean(per_symbol[sym].equity[t] for each sym)`. Time alignment: resample each symbol's curve to a common grid (the lowest-resolution interval used in the strategy).
- `drawdown_curve`: compute from summary equity.
- `monthly_returns`: mean of per-symbol monthly returns.
- `metrics`: recompute from summary equity (not averaged from per-symbol metrics — that's mathematically different).

Why equal weighting: simplest; caller expecting different weights should run separate backtests per weight scheme.

### D3. Per-symbol concurrency bounded by config

**Decision.** `config.backtest.max_concurrent_symbols` (default 4). Implementation: `golang.org/x/sync/semaphore` or channel-based worker pool.

4 is conservative; per-symbol sandbox uses ~1 CPU + 512MB RAM, so 4 parallel fits a 4-core dev machine. Tune later.

### D4. Mode-driven lookback defaults

**Decision.** When `mode: "preview"` and no explicit lookback:
- `from = now - 7 days`
- `to = now`

When `mode: "deep"` and no explicit lookback:
- `from = now - 180 days`
- `to = now`

Explicit `preview_lookback_days` / `deep_lookback_days` overrides.

### D5. Upfront validation — never create partial run

**Decision.** Validate all symbols + interval + range before inserting the `backtest_runs` row. If any fails:

- `INVALID_SYMBOL` with `details.invalid_symbols: [the bad ones]`
- `INVALID_INTERVAL`
- `INVALID_RANGE`
- `DATA_UNAVAILABLE` if any symbol lacks data in the requested range

Return error to caller; no DB writes.

### D6. Progress reporting

**Decision.** While N sandboxes run, the service's `Status` handler returns:

```
{
  task_id, status: "running",
  progress: { phase: "backtest", done: k, total: N },
  started_at
}
```

When all done, aggregation phase briefly shows `{ phase: "aggregate", done: 0, total: 1 }` before final done.

## Risks / Trade-offs

- **[Per-symbol timestamps may not align]** → Resample to common grid; fill gaps forward. Document the resampling scheme in the aggregation module.

- **[Aggregation from per-symbol metrics is mathematically wrong]** → Summary metrics always computed from summary equity curve, not from averaging per-symbol metrics. Tested against hand-computed expected values.

- **[Cascading failures — one bad symbol fails everything]** → Ship with fail-fast: if any sandbox fails after start, the whole task fails. Alternative (partial success) is complex UX and not worth it in v1.

- **[Storage grows: per-symbol trades for 10 symbols × 180 days]** → Acceptable; backtest_runs.result is jsonb, postgres handles it. If it gets unwieldy, split into a separate table.

- **[Sandbox containers pool pressure]** → Mitigation: bounded concurrency; queue additional symbols beyond limit.

## Migration Plan

1. Implement upfront validation.
2. Refactor `Submit` to loop sandboxes.
3. Implement aggregation module.
4. Deploy; UI (Preview + Deep workspaces) can now use real multi-symbol results.

## Open Questions

- Should validation check that ALL symbols have data in the range, or just that at least ONE does? → All. If one lacks data, fail the whole task with `DATA_UNAVAILABLE`. Per-symbol-partial is out of scope.
- What happens if `symbols.length = 1`? → Degenerate case: single sandbox, `per_symbol[sym] == summary` semantically. Still wrap as N=1.
- Do we want to expose the individual sandbox logs in the result for debugging? → No; logs go to service-side logging, not the API response.
