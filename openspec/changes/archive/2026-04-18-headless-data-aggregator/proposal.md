## Why

`data-aggregator` today is a long-running HTTP service whose data pipeline only runs when something calls `POST /api/sync/start`. In practice this service is a pure data worker — it does not need to (and for security reasons should not) be reachable by the desktop frontend, and operators do not want to trigger it manually on every boot. We want `data-aggregator` to behave like a self-healing worker: when it starts, it checks what data is already on disk/DB, figures out what is missing, and backfills it — first from S3 CSVs, then from the Gate.io REST API. No external trigger. No HTTP surface exposed to the frontend.

At the same time, removing the aggregator's HTTP surface forces us to move the frontend-facing read APIs (klines, symbols, gaps) into `backtest-engine`, which already connects to the same TimescaleDB. This gives us a clean write/read split: `data-aggregator` owns writes, `backtest-engine` owns reads. Desktop-client stops talking to the aggregator entirely.

WebSocket realtime streaming and periodic catch-up ticks are **explicitly out of scope** for this change; they will come later.

## What Changes

**data-aggregator**
- **BREAKING**: Remove all HTTP routes consumed by the frontend: `POST /api/sync/start`, `GET /api/sync/status`, `POST /api/gaps/repair`, `GET /api/symbols`, `GET /api/klines`, `GET /api/gaps`.
- Keep only `GET /healthz` bound to localhost (for container liveness; optional).
- Add **boot-time auto-sync**: on process start, after DB migrations, the service runs a pipeline `refresh symbols → detect gaps → S3 backfill missing → aggregate → API fill missing → detect → repair` in a background goroutine. Pipeline is **detect-first** and **incremental** (only downloads what is missing), instead of today's blind full-download.
- After boot catch-up finishes, the process stays alive but idle (no periodic tick in this change; placeholder for future WS work).

**backtest-engine**
- Add read-only data-gateway endpoints served directly from TimescaleDB: `GET /api/klines`, `GET /api/symbols`, `GET /api/gaps`. These replace the aggregator's removed endpoints 1:1 in request/response shape.
- Reuse existing `Store` pool and the `readonly` DB user already configured in `backtest-engine/config.yaml`.

**desktop-client**
- **BREAKING**: Redirect all data-layer calls (symbols, klines, gaps if used) from the aggregator base URL to the backtest-engine base URL. Remove any reference to the aggregator host.

**Deployment**
- Aggregator and backtest-engine continue to share a single host/DB to keep cost low.
- Aggregator no longer needs to expose any public port; desktop-client only talks to backtest-engine.

## Capabilities

### New Capabilities
- `aggregator-bootstrap`: Boot-time auto-sync lifecycle of the `data-aggregator` process — how it self-checks data completeness and backfills without external triggers.
- `backtest-data-gateway`: Read-only HTTP endpoints on `backtest-engine` that serve klines, symbols, and gap info to the desktop-client, sourced directly from TimescaleDB.

### Modified Capabilities
- `sync-api`: All HTTP-trigger and HTTP-query requirements are removed. Trigger semantics move under `aggregator-bootstrap`; read APIs move under `backtest-data-gateway`.
- `symbol-management`: Symbol refresh is triggered as phase 1 of the boot pipeline, not as a side effect of `POST /api/sync/start`.

## Impact

**Affected code**
- `data-aggregator/cmd/server/main.go`: invoke the boot pipeline after store + migrations, before (or instead of) starting the HTTP server.
- `data-aggregator/internal/router`, `internal/handler/*`: delete handlers/routes for the removed endpoints; keep only `healthz`.
- `data-aggregator/internal/service/sync_service.go`: reorder pipeline to detect-first + incremental; keep S3/API fetchers idempotent so re-boots don't redo completed work.
- `backtest-engine/internal/handler/`: add `kline.go`, `symbol.go`, `gap.go` (or similar) read handlers.
- `backtest-engine/internal/router/router.go`: register the new `/api/klines`, `/api/symbols`, `/api/gaps` routes.
- `backtest-engine/internal/store/`: add read queries for klines/symbols/gaps against the shared `claw.*` tables (using the `readonly` user where possible).
- `desktop-client/*`: swap aggregator base URL → backtest-engine base URL for data calls.

**Affected APIs**
- **Removed from aggregator**: `/api/sync/*`, `/api/symbols`, `/api/klines`, `/api/gaps`.
- **Added to backtest-engine**: `/api/klines`, `/api/symbols`, `/api/gaps` (shape-compatible replacements).

**Dependencies / infra**
- No new infrastructure. Both services already target the same TimescaleDB (`claw.claw`).
- Aggregator port can be removed from any reverse proxy / firewall allowlist.

**Out of scope (deferred)**
- WebSocket subscription to Gate.io for realtime K-lines.
- Periodic catch-up scheduler inside the aggregator (tick every N minutes).
- Any new manual/admin trigger mechanism (no SIGUSR1 hook, no localhost debug endpoint). Re-sync = restart the process.
