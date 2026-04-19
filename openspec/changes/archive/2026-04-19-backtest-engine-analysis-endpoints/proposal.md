## Why

Three contract endpoints exist but are unimplemented:
- `POST /api/analysis/optimlens` + `GET /api/analysis/optimlens/{task_id}` — parameter sweep + LLM-synthesized improvements
- `POST /api/analysis/signals` + `GET /api/analysis/signals/{task_id}` — AI verdicts on each backtest signal
- `POST /api/analysis/trade` — synchronous per-trade narrative

These are the **AI-driven** analyses that power Deep Backtest's OptimLens cards, Preview Backtest's Signal Review pills, and Symbol Detail's Trade Analysis narrative. Without them, three UI screens fall back to "unavailable" states.

This is the biggest of the 6 backend changes because it introduces **server-side LLM integration**, a **parameter sweep scheduler**, and **structured output parsing** — none of which exist today in backtest-engine.

## What Changes

**New service**: `backtest-engine/internal/service/analysis_service.go`
- `StartOptimLens(req)` — schedules N sub-backtests, collects metrics, calls LLM for synthesis
- `StartSignalReview(req)` — loads backtest signals, calls LLM per-signal (or batch), returns verdicts
- `ExplainTrade(req)` — synchronous LLM call with trade + indicator context

**LLM integration** `backtest-engine/internal/llm/`:
- Provider abstraction (`Provider` interface) with initial OpenAI impl (Anthropic/DeepSeek/Kimi/Gemini via config)
- Structured outputs where supported (OpenAI JSON mode, Anthropic tool use)
- Token budget tracking (declared; not enforced yet — see D11 of api-contract-new-capabilities)

**Parameter sweep scheduler** `internal/service/sweep.go`:
- Given base strategy + param grid, generate N combos (cross-product)
- Cap at `PARAM_GRID_TOO_LARGE` (default 50)
- Launch N sub-backtests in parallel (bounded, reuses multi-symbol concurrency limit)
- Collect metrics into a comparison matrix

**DB**: new `analysis_runs` table parallel to `backtest_runs`:
- `id, type ("optimlens" | "signals" | "trade"), config, status, progress, result, error, started_at, finished_at`

**Endpoints**:
- 3 POST handlers (start) + 2 GET (poll; trade is sync)
- All use canonical TaskResponse envelope where applicable

**New error codes used**:
- `PARAM_GRID_TOO_LARGE`
- `LLM_PROVIDER_FAILED`
- `LLM_BUDGET_EXCEEDED` (declared but not enforced)

## Capabilities

### New Capabilities
- `analysis-api`: The actual backend implementation of OptimLens / SignalReview / TradeExplain.

### Modified Capabilities
*(None.)*

## Impact

**New files**
- `backtest-engine/internal/service/analysis_service.go`
- `backtest-engine/internal/service/sweep.go` — param sweep scheduler
- `backtest-engine/internal/service/analysis_synthesize.go` — glue between sweep + LLM
- `backtest-engine/internal/llm/provider.go` — interface
- `backtest-engine/internal/llm/openai.go` — default provider impl
- `backtest-engine/internal/llm/prompts/optimlens.go` — system prompt
- `backtest-engine/internal/llm/prompts/signal_review.go`
- `backtest-engine/internal/llm/prompts/trade_explain.go`
- `backtest-engine/internal/handler/analysis.go` — 5 handlers
- `backtest-engine/internal/store/migrations/004_analysis_runs.sql`
- `backtest-engine/internal/store/analysis_runs.go`
- Tests for each

**Modified files**
- `backtest-engine/internal/router/router.go` — register 5 routes
- `backtest-engine/config.yaml` — add `llm` section (provider, api_key, model, timeout)
- `backtest-engine/internal/model/analysis.go` — AnalysisRun, OptimLensRequest/Result, etc.

**Depends on**
- `api-contract-new-capabilities` (contract)
- `backtest-engine-align-contract` (canonical envelope)
- `backtest-engine-multi-symbol-support` (OptimLens sweep reuses multi-symbol scheduler pattern)

**Out of scope**
- LLM budget enforcement (contract declared; enforcement is a follow-up)
- Streaming analysis (SSE) — polling only
- Caching analysis results (each request re-runs)
- Multi-provider load balancing / fallback
- Fine-tuning / RAG — plain prompt-based LLM calls
