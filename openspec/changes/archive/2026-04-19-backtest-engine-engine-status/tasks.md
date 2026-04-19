## 1. Prereqs

- [x] 1.1 `api-contract-new-capabilities` + `backtest-engine-align-contract` landed.

## 2. Version injection

- [x] 2.1 Create `backtest-engine/internal/version/version.go` with `var Version = "dev"` default.
- [x] 2.2 Update `backtest-engine/Dockerfile` to accept `ARG VERSION` + pass to `go build -ldflags "-X .../version.Version=$VERSION"`.
- [x] 2.3 Update `docker-compose.yml` (or Makefile rule) to pass `$(git describe --always --dirty)`.
- [x] 2.4 Smoke-test: dev `go run` → `version.Version == "dev"`; built container → version matches git.

## 3. Store layer

- [x] 3.1 Add `store.DataRange(ctx) (from, to time.Time, err)` — simple `SELECT MIN(ts), MAX(ts) FROM claw.futures_1h`.
- [x] 3.2 Add `store.LastAggregatorSync(ctx) (*time.Time, error)` — `SELECT MAX(synced_at) FROM claw.sync_state WHERE status='done'`.
- [x] 3.3 Unit tests.

## 4. Handler + route

- [x] 4.1 Create `internal/handler/engine.go` with `EngineStatusHandler`.
- [x] 4.2 Handler fetches: version, data range (from store), last sync (from store), aggregator probe (HTTP to localhost:<aggregator-port>/healthz, 500ms timeout), active_tasks (from services' running counts), uptime (time.Since processStartTime).
- [x] 4.3 Compose `EngineStatus` + `RespondOK`.
- [x] 4.4 Register `GET /api/engine/status` in router.

## 5. Process start time + services running count

- [x] 5.1 Capture `processStartTime = time.Now()` in `cmd/server/main.go`, pass to handler.
- [x] 5.2 Add `RunningCount() int` method to `BacktestService` and `ScreenerService` (reads `len(s.running)` under mutex).
- [x] 5.3 When `AnalysisService` lands (separate change), add to the sum.

## 6. Aggregator probe

- [x] 6.1 `internal/handler/engine.go`'s probe:
  - Read `config.aggregator.healthz_url` (new config key, default `http://localhost:8080/healthz`)
  - `http.Client` with 500ms timeout
  - Parse JSON, return version string if present, else null
- [x] 6.2 Config key optional — if unset, skip probe, return null.

## 7. Tests

- [x] 7.1 `handler/engine_test.go` — mock the aggregator via `httptest`; verify happy + timeout + DB-empty cases.
- [x] 7.2 Contract test: ensure response matches `EngineStatus` schema in openapi.

## 8. Final validation

- [x] 8.1 Local: `curl http://localhost:8081/api/engine/status` returns canonical shape.
- [x] 8.2 Settings page's RemoteEngineCard (from UI change #11) renders real data.
