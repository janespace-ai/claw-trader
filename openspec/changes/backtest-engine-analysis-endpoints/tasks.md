## 1. Prereqs

- [ ] 1.1 `api-contract-new-capabilities`, `backtest-engine-align-contract`, `backtest-engine-multi-symbol-support` all landed (analysis reuses the sandbox + aggregation logic).

## 2. DB migration

- [ ] 2.1 `migrations/004_analysis_runs.sql` — create `analysis_runs` table with `{{.Schema}}` template.
- [ ] 2.2 Indexes on `status`, `type`, `created_at`.
- [ ] 2.3 Migration runs as part of `store.Migrate()`.

## 3. LLM provider abstraction

- [ ] 3.1 `internal/llm/provider.go`:
  - `Provider` interface with `Complete(ctx, req) (*Response, error)`
  - `CompleteRequest{ System string; User string; Schema *JSONSchema; MaxTokens int; Timeout time.Duration }`
  - `Response{ Content string; Usage TokenUsage }`
- [ ] 3.2 `internal/llm/openai.go` — impl using `openai-go` SDK or direct HTTP. Supports `response_format: json_schema` for structured outputs.
- [ ] 3.3 `internal/llm/factory.go` — `New(cfg) (Provider, error)` selects impl by config.
- [ ] 3.4 Unit test with mock HTTP server.

## 4. Prompts

- [ ] 4.1 `internal/llm/prompts/optimlens.go` — system prompt + example output matching `OptimLensResult.improvements` schema.
- [ ] 4.2 `internal/llm/prompts/signal_review.go` — system prompt for verdict classification.
- [ ] 4.3 `internal/llm/prompts/trade_explain.go` — system prompt for per-trade narrative.
- [ ] 4.4 Accompanying JSON schemas in `internal/llm/schemas/`.

## 5. Sweep scheduler

- [ ] 5.1 `internal/service/sweep.go`:
  - `ExpandGrid(grid map[string][]interface{}) [][]Combo` — cross-product
  - `SubstituteParams(code string, combo Combo) (string, error)` — regex-based
  - `RunGrid(ctx, baseStrategyID, symbols, lookback, grid) ([]SweepResult, error)` — launches sub-backtests in parallel, waits for all
- [ ] 5.2 Reuse `BacktestService.Submit` for each variant; collect results via callback.
- [ ] 5.3 Unit tests: expand grid happy + large cap rejection; substitute pattern match + miss.

## 6. Analysis service

- [ ] 6.1 `internal/service/analysis_service.go`:
  - `StartOptimLens(ctx, req) (taskID, error)` — insert analysis_runs row, spawn goroutine
  - OptimLens goroutine: sweep → collect → LLM synthesize → update result
  - `StartSignalReview(ctx, req)` — similar
  - `ExplainTrade(ctx, req) (*TradeExplainResult, error)` — sync; loads context, calls LLM, returns
  - `GetStatus(ctx, taskID, type) (TaskResponse, error)`
- [ ] 6.2 Goroutine error handling: on any step failure, update row to `status=failed`, `error={code, message}`.
- [ ] 6.3 Cancellation via context.
- [ ] 6.4 `RunningCount() int` for engine-status integration.

## 7. Handlers

- [ ] 7.1 `internal/handler/analysis.go`:
  - `POST /api/analysis/optimlens` → `StartOptimLens` + RespondTask
  - `GET /api/analysis/optimlens/:task_id` → `GetStatus(taskID, "optimlens")` + RespondTask
  - `POST /api/analysis/signals` → similar
  - `GET /api/analysis/signals/:task_id` → similar
  - `POST /api/analysis/trade` → synchronous `ExplainTrade` + RespondOK
- [ ] 7.2 Input validation per contract shape.
- [ ] 7.3 PARAM_GRID_TOO_LARGE check at handler level (before service).
- [ ] 7.4 Register routes in `router.go`.

## 8. Store layer

- [ ] 8.1 `internal/store/analysis_runs.go`:
  - `InsertRun(ctx, run AnalysisRun) error`
  - `UpdateProgress(ctx, id, progress)`
  - `UpdateResult(ctx, id, result, status)`
  - `UpdateError(ctx, id, err, status)`
  - `Get(ctx, id) (*AnalysisRun, error)`

## 9. Config

- [ ] 9.1 Extend `backtest-engine/internal/config/config.go` with `LLMConfig { Provider, Model, APIKey, APIKeyEnv, TimeoutSec, MaxTokens }`.
- [ ] 9.2 `config.yaml` example entries + README note about `OPENAI_API_KEY` env.
- [ ] 9.3 Docker compose: pass LLM env vars.

## 10. Tests

- [ ] 10.1 Unit: sweep expansion, substitution, analysis service state transitions (mocked LLM provider).
- [ ] 10.2 Integration: in-memory analysis run against mocked backend — OptimLens happy + LLM invalid JSON + param grid too large.
- [ ] 10.3 Contract tests include all 5 new endpoints.
- [ ] 10.4 Test TradeExplain 20s timeout by passing a slow mock provider.

## 11. Documentation

- [ ] 11.1 Update `api/README.md` — "Analysis endpoints" section with cost notes.
- [ ] 11.2 Update `TESTING.md` — how to test with a mock LLM provider (no API key needed).
- [ ] 11.3 Add `docs/analysis-cost-notes.md` — expected token costs per endpoint, model-dependent.

## 12. Final validation

- [ ] 12.1 All Go tests green.
- [ ] 12.2 `make test-contract` passes including analysis endpoints.
- [ ] 12.3 Against real OpenAI (developer's API key), end-to-end OptimLens + SignalReview + TradeExplain return plausible results.
- [ ] 12.4 Frontend (Deep / Preview / Symbol Detail) — AI panels populate with real data, replacing the "unavailable" fallback.
