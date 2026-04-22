# data-aggregator

Headless worker that keeps the shared TimescaleDB populated with Gate.io
futures K-line data. It has no frontend-facing API; the desktop client reads
market data through `service-api`, which queries the same database.

## What it does on startup

When the process starts, after the DB pool is up and migrations have run, it
kicks off a background pipeline:

1. **Refresh symbols** — pull the top-N USDT futures tickers from Gate.io and
   upsert into `claw.symbols`.
2. **Pre-detect gaps** — scan every `(symbol, interval)` over the configured
   horizon. Purely informational: the log line tells you how much work the
   next phases are about to do.
3. **S3 backfill** — download monthly CSVs from Gate.io's public S3 bucket
   for months not already marked `done` in `claw.sync_state`. Warm restarts
   skip months already fully ingested.
4. **Aggregate** — derive 15m / 30m tables from 5m where configured.
5. **API fill** — use the Gate.io REST API to cover the tail that S3 doesn't
   publish yet (typically the current month). Resumes from the latest DB
   timestamp per `(symbol, interval)`.
6. **Detect + repair** — run detection again, repair remaining gaps using
   whichever source the range calls for.

`/healthz` returns 200 as soon as step 0 (DB + migrations) succeeds. It does
**not** wait for the pipeline to complete — cold-start downloads can take
hours and would otherwise flap the container's liveness check.

## Triggering a re-sync

There is **no external trigger**. Restart the process to re-run the pipeline.
The fetchers are idempotent — re-runs after a crash only touch data that is
still missing.

```sh
docker restart claw-data-aggregator
# or
docker compose up -d --force-recreate data-aggregator
```

## What it exposes

Only `GET /healthz`, bound to `127.0.0.1` by default. No `/api/*` routes.
Every frontend-facing read now lives on `service-api`:

| Old route (aggregator)     | New route (service-api) |
|----------------------------|-----------------------------|
| `GET /api/klines`          | `GET :8081/api/klines`      |
| `GET /api/symbols`         | `GET :8081/api/symbols`     |
| `GET /api/gaps`            | `GET :8081/api/gaps`        |
| `POST /api/sync/start`     | — (restart the container)   |
| `GET /api/sync/status`     | — (tail container logs)     |
| `POST /api/gaps/repair`    | — (restart the container)   |

## Observability

Phase boundaries emit structured log lines:

```
[sync] phase=symbols task=<id> refreshing top-300
[sync] phase=symbols task=<id> done symbol_count=300
[sync] phase=pre_detect task=<id> done reports=1200 gap_count=34 missing_bars=128
[sync] phase=s3_download task=<id> done ok=14400 failed=12 total=14412
[sync] phase=aggregate task=<id> done
[sync] phase=api_fill task=<id> done ok=1800 failed=0 total=1800
[sync] phase=gap_repair task=<id> done repaired=28 skipped=6
[sync] task <id> finished status=done duration=... s3=... api=...
```

## Out of scope / coming next

- **WebSocket realtime** — subscribing to Gate.io's WS streams so recent bars
  land in Timescale with sub-minute latency. Planned as a separate change
  (`ws-realtime-sync`).
- **Periodic catch-up tick** — between process restarts, the top-300 list
  freezes and new bars don't land until the next reboot. A lightweight
  in-process scheduler could close this gap; deferred until the need is
  concrete.
- **Admin/debug trigger** — no localhost debug endpoint or SIGUSR1 hook.
  If "restart the container" becomes painful, that's the signal to add one.
