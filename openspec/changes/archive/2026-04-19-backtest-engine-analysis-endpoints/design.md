## Context

Biggest of the backend changes. Three analysis endpoints with very different characteristics:

- **OptimLens** — long-running (N sub-backtests + LLM), async (polling)
- **SignalReview** — medium (single LLM call with structured output), async (polling, mostly for consistency)
- **TradeExplain** — short (one LLM call with context), synchronous

All three require LLM integration inside backtest-engine, which doesn't exist today. Currently LLM calls happen in the desktop-client main process (user's API key). For analysis endpoints, **who pays for the tokens** is a design decision: operator (server-side key) or user (forward request to renderer's LLM)?

## Goals / Non-Goals

**Goals:**
- All three endpoints implemented per contract.
- LLM provider abstraction supports multiple backends (OpenAI first, Anthropic/DeepSeek follow-up).
- Structured outputs enforced where possible (OptimLens JSON shape, SignalReview verdict enum, TradeExplain fields).
- Parameter sweep respects `PARAM_GRID_TOO_LARGE` cap.
- Analysis persistence: `analysis_runs` table, queryable after-the-fact.

**Non-Goals:**
- Budget enforcement (just declare `LLM_BUDGET_EXCEEDED` as a possible response; actual tracking deferred).
- Caching identical requests.
- LLM failover / load balancing.
- Streaming (SSE).
- RAG-based context retrieval — plain prompt + structured JSON in/out.

## Decisions

### D1. LLM token cost is borne by the operator (server key), not forwarded to client

**Decision.** `backtest-engine/config.yaml` declares an LLM provider + API key. Analysis endpoints use this key. Client never sends its API key to the server.

Rationale:
- Simpler contract (no auth headers on analysis endpoints).
- Server-side caching possible in the future.
- Operator bears variable cost but also controls which provider / model is used.

**Alternative considered.** Forward request with client's key: more permissive but requires the contract to accept API keys in requests, which is a security red flag for a shared server.

### D2. OpenAI as the first provider; others as config-swappable

**Decision.** `internal/llm/Provider` interface:

```go
type Provider interface {
    Complete(ctx context.Context, req CompleteRequest) (*CompleteResponse, error)
    // CompleteRequest includes: system, user, schema (for structured outputs)
}
```

Implement `internal/llm/openai.go` first (Chat Completions with `response_format={ type: "json_schema" }` for structured outputs). Others (`anthropic.go`, `deepseek.go`) can be added later as separate changes.

### D3. OptimLens sweep: reuses backtest service's sandbox manager

**Decision.** `sweep.RunGrid(ctx, baseStrategyID, grid, symbols, lookback) → []SweepResult`:

1. For each combo in grid, construct a strategy variant (substitute param defaults in the base code via regex).
2. Call `BacktestService.Submit(...)` for each variant — creates its own `backtest_runs` row.
3. Wait for all sub-backtests to finish (use `semaphore` to cap concurrency, same as multi-symbol).
4. Return per-combo metrics.

**Consequence.** Sweep results live in `backtest_runs` permanently. Visible to users if they browse history. That's fine — can filter by a tag later.

### D4. SignalReview: batch LLM call with all signals

**Decision.** Load all signals from the referenced backtest (`backtest_task_id` param), serialize with indicator context around each entry ts, send to LLM in a single request. Response: JSON array of verdicts.

At max 100 signals (per contract cap), the prompt size stays reasonable (~20KB).

**Alternative considered.** One LLM call per signal: 100× slower, 100× more expensive. Rejected.

### D5. TradeExplain: synchronous handler with 20s server-side timeout

**Decision.** POST handler makes a single LLM call with the trade + surrounding 50 bars of klines. Server applies a 20s timeout; if LLM exceeds, return `504 LLM_PROVIDER_FAILED`.

**Rationale.** One LLM call per user click is fast enough to hold the HTTP connection.

### D6. Structured outputs: JSON schema enforcement per endpoint

**Decision.** For each analysis endpoint, define a JSON schema in `internal/llm/schemas/<endpoint>.json` matching the contract's result shape. Pass to `Provider.Complete` as `schema` param. Providers that support structured outputs (OpenAI, some Anthropic) enforce; others (Kimi, older models) get the schema in the prompt text and we post-validate.

If the LLM returns invalid JSON → `LLM_PROVIDER_FAILED`.

### D7. Analysis runs table

**Decision.** Separate `analysis_runs` table to keep backtests and analyses distinct in queries.

```sql
CREATE TABLE analysis_runs (
  id UUID PRIMARY KEY,
  type TEXT NOT NULL,   -- 'optimlens' | 'signals' | 'trade'
  config JSONB NOT NULL,
  status TEXT NOT NULL,
  progress JSONB,
  result JSONB,
  error JSONB,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);
```

`trade` type runs are synchronous but still logged (audit / debug).

### D8. Progress reporting phases

**Decision.** OptimLens progress `phase` values:
- `"sweep"` — sub-backtests running; `done/total` = sub-backtests finished / total combos
- `"synthesize"` — LLM inference; `done/total = 0/1`

SignalReview:
- `"fetch"` — loading signals from backtest
- `"llm"` — LLM call

### D9. PARAM_GRID_TOO_LARGE enforced server-side

**Decision.** Client-side cap in UI is nice but not authoritative. Server computes `len(grid)` at submit; if > 50, returns `PARAM_GRID_TOO_LARGE` immediately.

### D10. Budget declared, not enforced (v1)

**Decision.** `LLM_BUDGET_EXCEEDED` is a valid `ErrorCode` in the contract. This change **doesn't enforce** any budget — no quota table, no rate limiting. If operator wants to cap spend, that's a follow-up change.

## Risks / Trade-offs

- **[Operator pays for LLM costs]** → Clear in docs. Operator can set a conservative model (e.g. GPT-4o-mini) to keep cost down.

- **[LLM returns malformed JSON despite schema]** → Post-validate with `ajv`-equivalent Go lib. Retry once with reinforced prompt; then fail with `LLM_PROVIDER_FAILED`.

- **[Sandbox resource pressure from sweep]** → 50 combos × 3 symbols × 180d = potentially 150 sandbox launches. Bounded concurrency prevents cluster meltdown, but sweeps take minutes. UI shows progress.

- **[Timeout on sync TradeExplain])** → 20s is generous for most LLMs; slow providers might hit it. Return `LLM_PROVIDER_FAILED`; UI suggests retry.

## Migration Plan

1. DB migration (analysis_runs).
2. LLM provider abstraction + OpenAI impl.
3. Sweep scheduler.
4. Analysis service.
5. Handlers.
6. Tests.

Rollback: schema migration is additive; safe to roll back handlers without DB changes.

## Open Questions

- Should `analysis_runs.config` include the full backtest config snapshot or just the strategy_id + param_grid? → Just the request payload is enough; cross-references to backtest_runs for full context.
- If the LLM provider is mis-configured at startup, do we fail to boot or fall back? → Boot succeeds; analysis endpoints return `LLM_PROVIDER_FAILED` from the first call. Settings page's Remote Engine card will show this if extended.
- Should OptimLens preserve losing combos in the result, or only winners? → Preserve all + let the LLM do the filtering when it synthesizes. More data for the synthesis step.
