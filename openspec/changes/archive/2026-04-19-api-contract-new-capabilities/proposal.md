## Why

`api-contract-foundation` established the machine-readable contract for every endpoint the backend **already exposes**. The upcoming UI refactor (`ui-foundation` → 8 workspace/screen changes) needs **10 new or extended endpoints** that don't exist yet:

- **Multi-symbol + preview/deep** backtest extensions (design requires running a strategy over N symbols and distinguishing a 7-day preview run from a 180-day deep run).
- **Three AI-analysis endpoints** — OptimLens (param sweep + LLM synthesis), Signal Review (per-signal commentary on preview results), Trade Analysis (per-trade narrative). These power the specialized AI personas in Workspace/Symbol Detail screens.
- **Strategy version history** — Strategy Management page draws a git-log-style version tree; needs `GET/POST /api/strategies/{id}/versions`.
- **Engine status** — Settings page's Remote Engine card shows version, supported markets/intervals, data range, last sync time.
- **Symbol metadata** — Symbol Detail page header needs last price, 24h change, rank, name; currently no single endpoint returns this bundle.

This change freezes the **contract** for all ten, following the conventions from `api-contract-foundation` (task envelope, error codes, Unix seconds, cursor pagination). It does **NOT** implement any backend behavior — that work is split into two follow-up changes: `backtest-engine-analysis-endpoints` (real OptimLens/Signal/Trade impl, including LLM integration and param sweep scheduling) and `backtest-engine-align-contract` (tighten existing endpoints to canonical shape).

Once this lands, every UI screen in the refactor roadmap can develop against MSW fixtures with confidence that the shape it sees matches the eventual real backend response.

## What Changes

**OpenAPI additions** (`api/openapi.yaml`)

| Operation | Method | Path | Capability |
|---|---|---|---|
| `getSymbolMetadata` | GET | `/api/symbols/{symbol}/metadata` | `backtest-data-gateway` (modified) |
| `startBacktest` (extended) | POST | `/api/backtest/start` | `backtest-api` (modified) |
| `getBacktestResult` (extended) | GET | `/api/backtest/result/{task_id}` | `backtest-api` (modified) |
| `listStrategyVersions` | GET | `/api/strategies/{id}/versions` | `strategy-api` (new) |
| `createStrategyVersion` | POST | `/api/strategies/{id}/versions` | `strategy-api` (new) |
| `getStrategyVersion` | GET | `/api/strategies/{id}/versions/{version}` | `strategy-api` (new) |
| `startOptimLens` | POST | `/api/analysis/optimlens` | `analysis-api` (new) |
| `getOptimLensResult` | GET | `/api/analysis/optimlens/{task_id}` | `analysis-api` (new) |
| `startSignalReview` | POST | `/api/analysis/signals` | `analysis-api` (new) |
| `getSignalReviewResult` | GET | `/api/analysis/signals/{task_id}` | `analysis-api` (new) |
| `explainTrade` | POST | `/api/analysis/trade` | `analysis-api` (new) — synchronous |
| `getEngineStatus` | GET | `/api/engine/status` | `engine-status-api` (new) |

**New schemas in `api/openapi.yaml`**

- `BacktestMode` enum: `"preview" | "deep"`
- `BacktestConfig` extended with `symbols: string[]`, `mode: BacktestMode`, `preview_lookback_days?`, `deep_lookback_days?`
- `BacktestResult` extended with `per_symbol: Record<string, SymbolResult>`, richer `metrics` (Sharpe / Sortino / Calmar / profit_factor / win_rate / avg_trade / avg_hours_in_trade / positive_days_ratio / max_drawdown), `equity_curve`, `drawdown_curve`, `monthly_returns`
- `StrategyVersion` with `version: integer`, `code`, `summary`, `created_at`, `parent_version?`
- `OptimLensRequest` / `OptimLensResult` — params passed, variants tried, LLM-generated improvements (`[{action, why, expected_delta}]`)
- `SignalReviewRequest` / `SignalReviewResult` — signals classified (`good | questionable | bad`) with per-signal reasoning
- `TradeExplainRequest` / `TradeExplainResult` — entry/exit reasoning, indicator context, P/L narrative
- `EngineStatus` — `version`, `supported_markets[]`, `supported_intervals[]`, `data_range: { from, to }`, `last_sync_completed_at`, `active_tasks: integer`
- `SymbolMetadata` — `symbol`, `name`, `rank`, `last_price`, `change_24h`, `volume_24h_quote`, `first_kline_at`, `last_kline_at`

**New error codes** added to `ErrorCode` enum:

- `STRATEGY_VERSION_NOT_FOUND`
- `PARAM_GRID_TOO_LARGE` (OptimLens safety — cap on total combinations)
- `LLM_PROVIDER_FAILED` (analysis endpoints; the AI-provider call itself failed)
- `LLM_BUDGET_EXCEEDED` (per-user or per-task token budget exhausted)

**New fixtures** in `api/examples/`

- `getSymbolMetadata.json`
- `startBacktest-multi.json` (multi-symbol happy path)
- `getBacktestResult-deep.json` (deep-mode full result with per-symbol + drawdown + monthly)
- `listStrategyVersions.json`
- `createStrategyVersion.json`
- `getStrategyVersion.json`
- `startOptimLens.json`
- `getOptimLensResult-running.json` + `getOptimLensResult-done.json` (task envelope at different phases)
- `startSignalReview.json`
- `getSignalReviewResult-done.json`
- `explainTrade.json` (sync response)
- `getEngineStatus.json`

**Regenerated artifacts** (outputs of `pnpm api:types` + `api:mocks`)

- `desktop-client/src/types/api.d.ts` — new types surface
- `desktop-client/src/mocks/handlers.ts` — new handlers matching new operations
- `desktop-client/src/services/remote/contract-client.ts` — new typed methods on `cremote` (e.g. `cremote.startOptimLens({...})`)

**No UI code yet.** The UI refactor changes consume these types; this change just freezes them.

## Capabilities

### New Capabilities

- `analysis-api`: HTTP endpoints that run AI-driven analysis on backtest artifacts — OptimLens (parameter improvement suggestions), Signal Review (verdicts on individual entries/exits), Trade Explain (per-trade narrative). All use the canonical task envelope except `explainTrade` which is synchronous (small payload, no sweep).
- `strategy-api`: First-class CRUD + version history for strategy records. Supersedes scattered strategy references in earlier specs; documents `POST /api/strategies`, `GET /api/strategies`, `GET /api/strategies/{id}`, and the new `/versions` operations.
- `engine-status-api`: A single read endpoint (`GET /api/engine/status`) exposing backend self-description (version, supported intervals, data range, active task count). Drives the Settings page's Remote Engine card.

### Modified Capabilities

- `backtest-api`: Extends `BacktestConfig` with `mode` and makes `symbols: string[]` explicit; extends `BacktestResult` with per-symbol breakdown and richer metrics. Adds new error codes related to multi-symbol and sandbox failures.
- `backtest-data-gateway`: Adds `GET /api/symbols/{symbol}/metadata`. Other endpoints unchanged.

## Impact

**Affected code**
- `api/openapi.yaml` — +12 operations, +15 schemas, +4 error codes. Roughly doubles in size.
- `api/examples/` — +12 fixture files.
- `api/errors.md` — +4 entries.
- `desktop-client/src/types/api.d.ts` — regenerated.
- `desktop-client/src/mocks/handlers.ts` — regenerated.
- `desktop-client/src/services/remote/contract-client.ts` — adds typed methods for each new operation.
- No production code in `backtest-engine/` or `data-aggregator/`. Zero backend runtime change.

**Consumers**

- The UI refactor roadmap (`ui-foundation` + 8 screen changes) can now stand up full screens against MSW fixtures: OptimLens panel, Signal Review list, Trade Analysis narrative, Engine Status card, Strategy version tree, multi-symbol watchlists — all have realistic typed fixtures to bind to.

**Follow-up backend changes (NOT this change)**

- `backtest-engine-analysis-endpoints` — real OptimLens / Signal Review / Trade Analysis implementation. Will need: parameter sweep scheduler (how do we run N sub-backtests concurrently?), LLM provider integration inside backtest-engine (currently LLMs run in the renderer), per-task token budget. Design scope that's explicitly outside this contract change.
- `backtest-engine-align-contract` — tighten existing endpoints to the canonical shape; remove the legacy-adapter layer in `cremote`.
- `backtest-engine-multi-symbol-support` — if the current runner doesn't support running one strategy across multiple symbols in one task, this change writes the scheduler. Needs verification first.
- `backtest-engine-strategy-versions` — schema change (new columns or new table) + API impl for strategy version endpoints.
- `backtest-engine-engine-status` — trivial handler + DB queries for `/api/engine/status`.

**Out of scope (deferred)**

- Any runtime implementation of the 12 new endpoints.
- SSE / WebSocket-based streaming for OptimLens long jobs — deferred to a future change.
- Billing / quota enforcement for LLM-backed endpoints — `LLM_BUDGET_EXCEEDED` is defined as a shape but no enforcement is built yet.
- Multi-strategy / portfolio backtest (running different strategies on different symbols simultaneously). Current scope is one strategy × multiple symbols.
- Internationalization of LLM outputs (OptimLens / Signal Review / Trade Explain return English by default; i18n strategy deferred).
