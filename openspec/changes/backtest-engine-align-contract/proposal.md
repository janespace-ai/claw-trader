## Why

`api-contract-foundation` froze the canonical wire format for every currently-live backtest-engine endpoint (task envelope, error envelope + 15-code dictionary, Unix seconds, cursor pagination), but **did not touch the backend runtime** — that was scoped out so the contract could land without a coordinated PR. The frontend has been running against the canonical shapes via a legacy-adapter layer inside `cremote` that normalizes today's drifted responses.

This change tightens the real backend handlers to emit canonical responses directly, then **deletes the legacy-adapter**. After it lands, the contract is reality on both sides.

## What Changes

**All existing endpoints — switch to canonical shapes**:

- `GET /healthz` — unchanged shape (already canonical)
- `GET /api/klines`, `/api/symbols`, `/api/gaps` — normalize time fields to Unix seconds only, error responses to canonical envelope
- `/api/symbols` response switches from bare array to `{ items, next_cursor }` paginated shape
- `POST /api/strategies`, `GET /api/strategies`, `GET /api/strategies/{id}` — error envelope, timestamp normalization, cursor pagination on list
- `POST /api/backtest/start` — response uses canonical `TaskResponse` envelope
- `GET /api/backtest/status/{task_id}` — response uses canonical `TaskResponse` (not today's flat shape)
- `GET /api/backtest/result/{task_id}` — response uses canonical `TaskResponse<BacktestResult>` wrapper
- `GET /api/backtest/history` — switches to `{ items, next_cursor }` shape
- `POST /api/screener/start` — canonical `TaskResponse`
- `GET /api/screener/result/{task_id}` — canonical `TaskResponse<ScreenerResult>`

**Error-code mapping**:
- Go handler errors currently return `{"error": "some string"}`. Each call site maps to one of the 15 canonical codes:
  - Bad interval → `INVALID_INTERVAL` + `details.allowed_intervals`
  - Unknown symbol → `SYMBOL_NOT_FOUND`
  - Bad date range → `INVALID_RANGE`
  - Compliance fail → `COMPLIANCE_FAILED` + `details.violations`
  - Sandbox timeout → `SANDBOX_TIMEOUT`
  - Sandbox crash → `SANDBOX_ERROR` + `details.logs`
  - Timescale unreachable → `UPSTREAM_UNREACHABLE`
  - Task not found → `TASK_NOT_FOUND` or specific (`BACKTEST_NOT_FOUND` / `SCREENER_NOT_FOUND`)
  - Strategy not found → `STRATEGY_NOT_FOUND`
  - Any unclassified error → `INTERNAL_ERROR`

**Timestamp normalization**:
- All response time fields emit Unix seconds (integers). `created_at`, `updated_at`, `entry_ts`, `exit_ts`, `ts`, `started_at`, `finished_at`, etc.
- Input query params: deprecate `YYYY-MM-DD` acceptance; still accept for one release with a `Warning: deprecated` header.

**Delete legacy-adapter**:
- In `desktop-client/src/services/remote/legacy-adapter.ts`, remove each function whose backend has now aligned.
- Confirm `cremote` still works with no adapter in the middle.

**Contract verification**:
- Add a contract test suite `backtest-engine/internal/handler/contract_test.go` that makes each request against real Go handlers and validates the response against the schema extracted from `api/openapi.yaml`.
- CI/Makefile: `make test-contract` runs this.

## Capabilities

### New Capabilities
*(None.)*

### Modified Capabilities
- `backtest-api`: All endpoints' requirements updated to use canonical shapes.
- `backtest-data-gateway`: Same for klines / symbols / gaps / metadata.
- `strategy-api`: Same for CRUD.
- `screener-execution` or its API analog: Same for screener endpoints.
- `api-contract`: Removes adapter-based hedges from the "deferred alignment" sections — alignment is now real.

## Impact

**Modified files**
- `backtest-engine/internal/handler/*.go` — every handler rewritten to emit canonical shape
- `backtest-engine/internal/model/*.go` — add/modify types to match (e.g. pagination wrapper struct)
- `backtest-engine/internal/errors/errors.go` (new) — typed error-code registry + helper functions
- `desktop-client/src/services/remote/legacy-adapter.ts` — delete after backend migration verified
- `desktop-client/src/services/remote/contract-client.ts` — remove adapter calls

**New files**
- `backtest-engine/internal/errors/errors.go` — code constants + `NewError(code, msg, details)` helper
- `backtest-engine/internal/handler/contract_test.go` — schema-driven integration tests

**Depends on**
- `api-contract-foundation` (contract + types)
- `api-contract-new-capabilities` (extended backtest result shape, multi-symbol; but this change focuses on CURRENT endpoints, not new ones — multi-symbol's backend impl is its own change `backtest-engine-multi-symbol-support`)

**Out of scope**
- New endpoints (those are separate changes per-capability).
- Actually adding `mode: "preview"|"deep"` logic — contract allows the field, `backtest-engine-multi-symbol-support` wires it.
- Performance optimization (separate concern).
