## Context

This change is entirely documentation + fixtures + generated code. No backend runtime changes, no new UI screens. It extends `api/openapi.yaml` from the `api-contract-foundation` change by ~12 operations and ~15 component schemas.

The hard decisions are not about **code** but about **schemas**:
- How does a multi-symbol backtest's result pack? One blob vs per-symbol map?
- How should OptimLens surface its improvements so the UI can render them without text parsing?
- Is strategy versioning implicit (`parent_id` chain) or explicit (version numbers)?
- Where does LLM cost go — per-tenant budget, per-task budget, or no budget concept yet?

The UI design mocks anchor us: each schema has to emit the fields that an existing Pencil screen visualizes.

## Goals / Non-Goals

**Goals:**
- Every endpoint the UI refactor roadmap needs has a contract entry.
- Request / response shapes are **concrete enough to render realistic MSW fixtures** — no `type: object, additionalProperties: true` hand-waves for anything the UI touches.
- Consumers of `cremote.*` methods (in future UI changes) get fully typed call-sites.
- Analysis endpoints follow the canonical task envelope where the work is long (OptimLens, SignalReview) and go synchronous where it isn't (`explainTrade`).

**Non-Goals:**
- Implementing any backend handler.
- Deciding the LLM provider used inside backtest-engine for analysis endpoints (that's a later change's concern — the contract just says "returns structured JSON", not how it's produced).
- Deciding storage for strategy versions (DB schema is the follow-up change's problem — contract only cares about wire shape).
- Tracking cost per tenant — we declare the error code `LLM_BUDGET_EXCEEDED` for future enforcement but don't wire enforcement now.

## Decisions

### D1. Multi-symbol backtest: `symbols: string[]` on request, `per_symbol: Record<string, SymbolResult>` on response

**Decision.** `BacktestConfig.symbols` is an array of strings (1..N). The result carries:

```yaml
BacktestResult:
  summary: { metrics: MetricsBlock, equity_curve: Point[], drawdown_curve: Point[], monthly_returns: MonthlyPoint[] }
  per_symbol:
    additionalProperties:
      type: object
      properties:
        metrics: MetricsBlock
        equity_curve: Point[]
        trades: Trade[]
        signals: Signal[]
```

`summary` is aggregated across symbols (equally weighted average). `per_symbol[BTC_USDT]` gives the raw run for BTC. UI's Preview/Deep workspaces filter by clicking a symbol in the left watchlist.

**Alternatives considered.**
- **Separate task per symbol** — simpler backend, but `BacktestResult` would be asymmetric ("which one is 'the result'?"). Rejected.
- **Array of symbol-keyed results** — `per_symbol: [{symbol, metrics, ...}]`. Less ergonomic for random access (`result.per_symbol[sym]` vs `.find`). Rejected.
- **`portfolio` mode that combines equity curves** — out of scope (would be a "one strategy, many symbols, shared capital" concept). Deferred.

### D2. `BacktestMode`: `"preview" | "deep"` as a first-class enum

**Decision.** Request has `mode: BacktestMode`. Backend defaults the lookback to the mode's convention:

- `preview` → 7 days, fewer bars, fast (<30s target). UI: Preview Backtest workspace after "Run Preview" button.
- `deep` → 180 days (configurable), slow, produces the full metrics grid + monthly. UI: Deep Backtest workspace after "Confirm + Run Deep".

The caller CAN override with `preview_lookback_days` / `deep_lookback_days` in `BacktestConfig`, but shouldn't need to.

**Alternatives considered.**
- **No mode; caller just sets lookback days** — doesn't capture intent. Backend defaults help.
- **More modes (e.g. `walk_forward`, `monte_carlo`)** — not in design; YAGNI.

### D3. OptimLens: structured `improvements[]` not free text

**Decision.** `OptimLensResult.improvements` is a typed array:

```yaml
OptimLensImprovement:
  title: string        # "Tighten stop to 2ATR on choppy regime"
  category: "exit" | "entry" | "params" | "filter" | "risk_mgmt"
  rationale: string    # 2-3 sentences, human-readable
  expected_delta:
    sharpe: number     # +0.23
    max_drawdown: number  # -4.2 (i.e. 4.2pp better)
    win_rate: number   # +3
  suggested_change:
    kind: "param_update" | "code_edit"
    payload:           # shape depends on kind
      # For param_update: { param_name, current, suggested }
      # For code_edit:    { unified_diff: string }
```

LLM is instructed to emit JSON matching this schema (structured outputs API or function-calling, depending on provider). If the LLM fails to emit valid JSON, the backend returns `LLM_PROVIDER_FAILED`.

**Alternatives considered.**
- **Free text block** — UI can't render the Pencil mock's itemized cards. Rejected.
- **Markdown** — parseable but still fuzzy; the mock has explicit delta numbers.

**Consequence.** OptimLens's backend impl (separate change) has to be strict about LLM output validation. Contract defines the target.

### D4. OptimLens: param sweep is part of the server task, not the caller's problem

**Decision.** The caller submits the BASE strategy (by `strategy_id`) + a `param_grid: Record<string, Array<number | string>>`. The server:

1. Cross-product the grid → list of param combos (subject to `PARAM_GRID_TOO_LARGE` cap, default 50 combos).
2. Schedule N sub-backtests (same symbols, same lookback).
3. Aggregate per-combo metrics.
4. Pass (base_params, grid_results) to the LLM.
5. Return structured improvements.

The caller polls `getOptimLensResult` just like any other task. The `progress` object reports `{ phase: "sweep" | "synthesize", done, total }`.

**Alternatives considered.**
- **Caller does the sweep** — N × `POST /backtest/start` + collect, then POST to `/analysis/optimlens-synthesize`. Too much orchestration on the client; rejected.

### D5. SignalReview: verdicts are per-signal with coarse labels

**Decision.** Input: `backtest_task_id` (a preview backtest's result). Output:

```yaml
SignalReviewResult:
  signals_total: integer      # how many signals were in the preview
  verdicts:
    - signal_id: string
      symbol: string
      entry_ts: integer       # unix seconds
      verdict: "good" | "questionable" | "bad"
      note: string            # 1 sentence
  summary:
    good: integer
    questionable: integer
    bad: integer
```

Verdict enum is coarse by design — UI renders colored pills; granular probabilities would be noise for an operator-level view.

### D6. TradeExplain: synchronous, small payload

**Decision.** `POST /api/analysis/trade` takes `{ backtest_task_id, symbol, trade_id }` and returns synchronously:

```yaml
TradeExplainResult:
  trade_id: string
  narrative: string                   # 3-5 sentences
  entry_context:
    indicators: Record<string, number>  # RSI, SMA10, SMA30, etc.
    regime: string                    # "trending_up" | "choppy" | "reversal"
  exit_context:
    reason: string                    # "trail_stop_hit" | "signal_flip" | "take_profit"
    indicators: Record<string, number>
```

Why sync: single LLM call, < 3s target, UI needs it inline in Symbol Detail's right panel. Async overhead (task polling) doesn't pay off.

**Risk.** If LLM latency exceeds 10s, the HTTP request times out. Mitigation: document a 20s server-side LLM timeout + return `LLM_PROVIDER_FAILED` on timeout, rather than letting HTTP hang.

### D7. Strategy versions: integer sequence per strategy + optional parent link

**Decision.**

```yaml
StrategyVersion:
  strategy_id: string
  version: integer         # 1, 2, 3, ... (per strategy_id)
  code: string             # the Python source for this version
  summary: string          # user-provided or LLM-synthesized "what changed"
  params_schema: object
  parent_version: integer | null  # null for v1; links chain through edits
  created_at: integer      # unix seconds
```

`parent_version` captures the "this was a fork of v2" case. Usually linear: v2's parent is v1.

Endpoints:
- `GET /api/strategies/{id}/versions` — cursor-paginated list, newest first.
- `POST /api/strategies/{id}/versions` — body `{ code, summary?, params_schema?, parent_version? }`. Server assigns next `version`.
- `GET /api/strategies/{id}/versions/{version}` — single version by number.

**Alternatives considered.**
- **Semver / sha** — premature; a simple integer is enough for the "git log" UI.
- **Edit in place; history is derivative** — contradicts the Strategy Management mock that shows a version tree.

### D8. EngineStatus: single shallow object, cached

**Decision.**

```yaml
EngineStatus:
  version: string                 # "0.1.0" of backtest-engine
  data_aggregator_version: string # optional; undefined if aggregator is unknown
  supported_markets: string[]     # ["futures"]
  supported_intervals: string[]   # ["5m","15m","30m","1h","4h","1d"]
  data_range:
    from: integer                 # earliest ts in any table
    to: integer                   # latest ts
  last_aggregator_sync_at: integer | null
  active_tasks: integer           # in-flight backtest/screener/analysis tasks
  uptime_seconds: integer
```

The Settings card renders subset. One endpoint, no polling needed (UI fetches once, refreshes on focus).

### D9. SymbolMetadata: enrich one symbol without joining tables in the UI

**Decision.**

```yaml
SymbolMetadata:
  symbol: string
  name: string                    # "Bitcoin" — static lookup; initially equals symbol.replace("_USDT","")
  market: string                  # "futures"
  rank: integer | null
  volume_24h_quote: number | null
  last_price: number
  change_24h_pct: number
  first_kline_at: integer
  last_kline_at: integer
  status: "active" | "inactive"
```

Endpoint `GET /api/symbols/{symbol}/metadata`. Symbol Detail workspace's top strip uses this bundle. `last_price` = most recent 1m/5m close; computed server-side to avoid N+1 fetches on the client.

### D10. `explainTrade` is the only sync endpoint; everything else uses the task envelope

**Decision.** Establish the rule: **task envelope for anything that could take > 2 seconds**. `explainTrade` is the exception because it's a single LLM call against a small context.

Endpoints using task envelope in this change: `startOptimLens` / `getOptimLensResult`, `startSignalReview` / `getSignalReviewResult`, plus the existing `startBacktest` / `getBacktestResult` and `startScreener` / `getScreenerResult` from `api-contract-foundation`.

### D11. LLM budget: contract defines the error code, not the enforcement

**Decision.** `LLM_BUDGET_EXCEEDED` is defined as a valid `ErrorCode`. The contract stops there — actual budget tracking (per-user? per-session? per-day?) is a policy decision for the backend-implementation change. Frontend treats the error generically ("Your AI quota is exhausted; try again later").

### D12. No change to `api-contract` capability

**Decision.** This change does not touch the cross-cutting conventions (task envelope shape, pagination, timestamps). It only extends the surface. `api-contract` capability SHALL NOT need a delta from this change.

## Risks / Trade-offs

- **[Design mocks may not precisely dictate schema]** — The Pencil mocks show visuals, not exact field names. We're picking names now; later UI work may find a gap. → Mitigation: every field in a new schema has to trace to something visible on the mock. Where we're guessing (e.g. OptimLens `expected_delta` values), the schema allows `null` so a less-capable backend can omit.

- **[Backend may not actually be able to implement OptimLens cost-effectively]** — N sub-backtests + LLM inference per request can get expensive / slow. Contract must not assume sub-second latency. Task envelope + progress phases give the UI room to show progress. Backend change can choose to cap `PARAM_GRID_TOO_LARGE` at 20 rather than 50 if needed.

- **[LLM provider differences for structured outputs]** — OpenAI has structured outputs; Anthropic has tool use; DeepSeek/Kimi/Gemini vary. Contract assumes valid JSON comes back; backend change picks provider strategy. If no provider can reliably emit OptimLens shape, the feature degrades (fewer improvements rather than wrong ones).

- **[Strategy version schema commits us]** — Integer-sequence versioning is hard to change later. But nothing we're shipping now assumes semver/sha, and there's no public audience yet. Safe.

- **[Synchronous `explainTrade` timeout]** — LLM calls can stall. A 20s server-side ceiling + `LLM_PROVIDER_FAILED` on timeout keeps the HTTP surface healthy, but the user sees a failed explanation. Acceptable first cut.

## Migration Plan

Pure additive. Flow during apply:
1. Add the 12 operations + 15 schemas + 4 error codes to `api/openapi.yaml`.
2. Write the 12 fixture files in `api/examples/`.
3. Add the 4 new entries to `api/errors.md`.
4. Regenerate `src/types/api.d.ts` + `src/mocks/handlers.ts`.
5. Extend `src/services/remote/contract-client.ts` with new typed methods.
6. Add vitest cases for the new MSW handlers.

Rollback is a commit revert. No data changes, no runtime behavior changes.

## Open Questions

- Should `OptimLensImprovement.suggested_change.kind="code_edit"` carry a unified diff or the new full source? Going with diff (compact, reviewable). Re-evaluate if LLMs refuse to emit valid diffs.
- `SignalReview.verdicts` could grow huge (preview with 200 signals × 20 symbols = 4000 verdicts). Cap at top N (say 50) by default? Add a `limit` query param? → Declaring the cap at 100 for v1; future can paginate.
- Should `StrategyVersion.parent_version` default to "previous version" or require explicit? → Explicit, with the UI helper always setting it to the current version. Avoids implicit surprises.
- Do we need `explainTrade` to accept `trade_context: Trade` inline (caller already has the trade, avoids a round-trip) as an alternative to `(backtest_task_id, trade_id)`? → Both. Contract accepts either, caller chooses.
