## Why

Contract defines `GET /api/engine/status` — single-endpoint backend metadata feed for the Settings page's Remote Engine card. Currently unimplemented.

Smallest of the backend changes. Independent work.

## What Changes

**New handler** `GET /api/engine/status`:
- Returns `EngineStatus` object defined in contract:
  - `version: string` — backtest-engine semver (from `version.go` or build info)
  - `data_aggregator_version: string | null` — from asking the aggregator via internal HTTP or reading a shared version file; if unavailable, `null`
  - `supported_markets: string[]` — hardcoded `["futures"]` for now
  - `supported_intervals: string[]` — from `model.SupportedIntervals` (already exists)
  - `data_range: { from, to }` — SQL `SELECT MIN(ts), MAX(ts) FROM claw.futures_1h` (query the main table; good approximation)
  - `last_aggregator_sync_at: int | null` — `SELECT MAX(synced_at) FROM claw.sync_state WHERE status='done'`
  - `active_tasks: int` — in-memory count from `BacktestService.running` + `ScreenerService.running` (if exists)
  - `uptime_seconds: int` — `time.Since(processStartTime).Seconds()`

**Version source**:
- `backtest-engine/internal/version/version.go` exposes `Version = "0.1.0"` (commit-injected at build time via `-ldflags`)

**No DB changes**. Purely a read-only aggregator.

## Capabilities

### New Capabilities
- `engine-status-api`: Implementation of the engine status endpoint (contract was defined in `api-contract-new-capabilities`).

### Modified Capabilities
*(None.)*

## Impact

**New files**
- `backtest-engine/internal/version/version.go`
- `backtest-engine/internal/handler/engine.go`
- `backtest-engine/internal/handler/engine_test.go`

**Modified files**
- `backtest-engine/internal/router/router.go` — register route
- `backtest-engine/internal/model/engine.go` — add `EngineStatus` struct

**Depends on**
- `api-contract-new-capabilities` (contract)
- `backtest-engine-align-contract` (canonical response helpers)

**Out of scope**
- Health probing aggregator directly (`/healthz` on aggregator is localhost-only per `headless-data-aggregator` decision)
- Push-based status updates (SSE)
