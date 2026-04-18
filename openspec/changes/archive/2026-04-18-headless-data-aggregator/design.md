## Context

Today the `data-aggregator` service in this repo is a Hertz HTTP server (`data-aggregator/cmd/server/main.go`) that:
1. Loads config + opens a Postgres/Timescale pool
2. Runs DB migrations
3. Wires a `SyncService` with S3 + API fetchers, aggregator, gap detector/repairer
4. Registers routes (`/api/sync/*`, `/api/symbols`, `/api/klines`, `/api/gaps`, `/api/gaps/repair`)
5. Blocks until a signal arrives

Nothing is downloaded until a client calls `POST /api/sync/start`. The existing `full` mode is "blind": it re-downloads every in-range S3 CSV, re-aggregates, and then hits the API to top up — regardless of what is already in the DB.

`backtest-engine` is a sibling Hertz service in the same repo, sharing the same TimescaleDB (`claw.claw`). Its `config.yaml` already defines a `readonly` user. It currently serves backtest/screener/strategy routes but does not serve market data.

The desktop client (`desktop-client/`) today talks to the aggregator directly for data; we are cutting that link.

Constraints:
- Single-host deployment: aggregator + backtest-engine + Timescale live on one box; no new infra is acceptable in this change.
- No WebSocket realtime work, no periodic tick — user has explicitly deferred these.
- Boot time cold start will do real work (S3 downloads); the service must not appear unhealthy during this phase.

## Goals / Non-Goals

**Goals:**
- Remove every frontend-reachable HTTP surface from `data-aggregator`.
- Run a self-healing `symbols → detect → S3 backfill → aggregate → API fill → gap repair` pipeline automatically when the aggregator process starts.
- Make the pipeline **idempotent and incremental**: re-running it should only fetch what is missing, not re-download everything.
- Serve klines / symbols / gaps to the desktop-client via `backtest-engine`, reading the shared TimescaleDB.
- Keep the change deployable to a single host with no new services or external scheduler.

**Non-Goals:**
- WebSocket streaming from Gate.io to the aggregator (future change).
- Periodic catch-up scheduler inside the aggregator (future change).
- Cross-service RPC between backtest-engine and aggregator (explicitly rejected in favor of direct DB reads).
- New admin/debug trigger endpoints on the aggregator (none — re-sync = process restart).
- Database schema changes; this change is a wiring/topology refactor, not a data model change.

## Decisions

### D1. Aggregator becomes a headless worker that still stays alive

**Decision:** `data-aggregator` keeps running as a long-lived process but stops serving frontend routes. On startup it runs the boot pipeline in a background goroutine (same pattern as today's `go s.run(task)`) and then the main goroutine blocks on a signal channel as it does today.

**Alternatives considered:**
- **One-shot (exit 0 when done).** Rejected: conflicts with the future WS work that will keep the process alive; would force us to re-architect lifecycle twice.
- **Delete the whole HTTP server.** Rejected for now: a localhost-only `/healthz` is worth keeping for container liveness, and the Hertz scaffolding is tiny.

**Consequence:** The aggregator will idle after boot catch-up finishes until the process is restarted. That is acceptable because the user has explicitly deferred periodic sync.

### D2. Detect-first, incremental pipeline

**Decision:** Reorder the pipeline from today's "download everything, then detect" to:

```
1. refresh symbols           (same as today)
2. detect gaps over the configured horizon for every (symbol, interval)
3. S3 phase: for every month × symbol × interval that the gap report shows
   as missing AND that falls in S3's coverage window, download the CSV.
4. aggregate (15m / 30m / etc. derived from 5m) — only for symbols whose
   base data changed in step 3.
5. API phase: for every remaining gap inside the API's coverage window
   (typically current month), fetch via REST.
6. detect again, then run repair for anything still gappy.
```

Steps 3 and 5 use the existing `S3Fetcher` and `APIFetcher`; only the driver (`SyncService.run`) and the input set (gap report rather than "all symbols × all months") change.

**Alternatives considered:**
- Keep `SyncMode=full` verbatim and just trigger it on boot. Rejected: on every restart it would re-download tens of GB of S3 CSVs that are already on disk/DB. Cold-start penalty unacceptable.
- Add a "skip-if-exists" check inside `S3Fetcher.Run`. Rejected as sufficient: S3 download skip helps the S3 phase but doesn't avoid re-hitting the Gate.io REST API for months that are already complete. Detect-first naturally covers both.

**Consequence:** Cold start (empty DB) still does a full download; warm starts are fast and safe.

### D3. Boot pipeline is fire-and-forget; `/healthz` is DB-only

**Decision:** The boot pipeline runs in a background goroutine. `/healthz` returns 200 as soon as the DB pool is up and migrations are done — it does **not** wait for catch-up to complete. Boot pipeline progress is written to logs (and to the existing `sync_tasks`-style in-memory snapshot).

**Alternatives considered:**
- Block startup until catch-up finishes. Rejected: S3 cold start can take hours; Docker/K8s would kill the container.
- Two health endpoints (`/healthz` for liveness, `/readyz` for "data current"). Rejected for this change: no orchestrator is consuming readiness yet, and the user explicitly wants minimal HTTP surface. Can be added later if needed.

**Consequence:** External observers (logs) are the only way to know catch-up progress. That is acceptable for this iteration because there is no operator UI for it anyway.

### D4. Aggregator HTTP routes: delete the frontend-facing ones; keep `/healthz` only

**Decision:**
- Delete handlers for `/api/sync/start`, `/api/sync/status`, `/api/symbols`, `/api/klines`, `/api/gaps`, `/api/gaps/repair`. Delete their routes from `router.Register`.
- Keep a single `GET /healthz` route. Bind the Hertz server to `127.0.0.1` (localhost) by default in `config.yaml` so nothing outside the host can reach it.

**Alternatives considered:**
- Keep `/api/sync/status` as a read-only status endpoint. Rejected: user wants the aggregator interface-less; logs are the source of truth for now.
- Remove the HTTP server entirely. Rejected: `/healthz` has real value for container liveness and costs ~10 lines.

**Consequence:** One-line firewall/reverse-proxy change (drop aggregator's port from any allowlist). Status monitoring = logs.

### D5. `backtest-engine` absorbs the read APIs by direct DB access

**Decision:** Add three handlers to `backtest-engine/internal/handler/` — `kline.go`, `symbol.go`, `gap.go` — that query the shared `claw.klines_*`, `claw.symbols`, `claw.gaps` tables via the existing `Store` pool. Register them on the main API group in `backtest-engine/internal/router/router.go`. Request/response shapes stay 1:1 compatible with the aggregator's current responses so the desktop-client only has to change its base URL.

**Alternatives considered:**
- **Reverse proxy** from backtest-engine to aggregator. Rejected: keeps the aggregator HTTP surface alive, adds a hop, doubles failure modes.
- **Shared `data-access` Go module** imported by both services. Rejected as premature: two callers is not enough to justify the module extraction overhead now. Revisit if a third consumer appears.
- **Use the existing `readonly` DB user for the new handlers.** Accepted where trivial; default to the main pool otherwise to avoid config churn in this change. Can be tightened later.

**Consequence:** `backtest-engine` is now a dual-purpose service (compute + data gateway). We accept this name/scope drift for now; a rename or split can be a separate change when/if a dedicated BFF service materializes.

### D6. No new manual-trigger mechanism

**Decision:** There is no replacement for `POST /api/sync/start` or `POST /api/gaps/repair`. If an operator wants to re-run the pipeline, they restart the aggregator process.

**Alternatives considered:**
- `SIGUSR1` handler to re-kick the pipeline. Rejected as scope creep; no one is asking for it, and restart is cheap on one box.
- A debug-only localhost HTTP trigger. Rejected: contradicts the "no interface" goal; adds a surface that will silently drift.

**Consequence:** Operators treat the aggregator like a cron job whose trigger is "restart the container". This is acceptable on a single host with systemd / docker restart policy.

## Risks / Trade-offs

- **Cold-start latency is invisible from outside.** → Mitigation: structured logs at every phase boundary (`[sync] phase=s3_download symbol=BTC_USDT...`) so tailing logs gives clear progress. `/healthz` stays green throughout so orchestrators don't flap.

- **Data goes stale between restarts** (no periodic tick in this change). → Mitigation: documented Non-Goal. If stale data becomes painful before WS lands, add a periodic tick as a follow-up change.

- **Top-300 symbol list freezes between restarts.** → Same mitigation as above; refresh happens at each boot.

- **Partial failure mid-pipeline leaves the DB "mostly filled".** → Mitigation: the pipeline is already designed for this (gap repair runs last; errors are logged per-phase without aborting downstream phases). Detect-first makes the *next* boot naturally resume from where the last one got stuck.

- **backtest-engine now has two very different responsibilities** (compute backtests + serve market data reads). → Mitigation: keep the new handlers in their own files, flag it in the proposal as intentional, plan a split if a third consumer appears.

- **Single-host deployment means one crash = everything down.** → Accepted; this is a cost decision the user has already made. Not addressed here.

- **Desktop-client breaking change requires coordinated release.** → Mitigation: tasks include a desktop-client task to update the base URL. Ship all three services together. No backwards-compat shim on the aggregator — once the routes are gone, old desktop clients will 404; the user has signed off on this.

## Migration Plan

1. **Land the change behind a feature-flagged config toggle? No.** The user prefers a clean cut over a dual-mode period; single-host deploy keeps coordination cost low.
2. **Deploy order (single host):**
   a. Deploy new `backtest-engine` first (it gains routes; old aggregator still works).
   b. Deploy new `desktop-client` pointing at `backtest-engine` (still works because aggregator routes are a superset).
   c. Deploy new `data-aggregator` (removes old routes; boot pipeline starts).
3. **Rollback:** redeploy the previous three binaries. No DB schema change means rollback is a simple binary swap.

## Open Questions

- Should `/healthz` on the aggregator also report "boot catch-up state" (running / done / failed) in its JSON body? Not required for liveness; deferred as a nice-to-have.
- Do we want a `readonly` Postgres user on the backtest-engine side for the new read handlers, or is the existing pool fine? Default to existing pool in this change; can tighten later.
