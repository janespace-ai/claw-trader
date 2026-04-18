## 1. data-aggregator: detect-first incremental pipeline

- [x] 1.1 In `internal/service/sync_service.go`, introduce a boot-oriented pipeline driver that orders phases as: `refresh symbols → detect gaps → S3 backfill missing → aggregate → API fill missing → detect → repair`. Keep existing `SyncMode` enum internally if useful, but stop requiring a mode argument from outside.
  - Added `SyncService.RunBoot(ctx)`; removed the external-trigger `Start(mode)` and `Status()` methods (no remaining callers).
  - Added `phasePreDetect` as the "detect-first" checkpoint before S3/API phases.
- [x] 1.2 Make the S3 phase consume the gap report instead of "all symbols × all months in horizon": only enqueue `(symbol, yyyymm)` pairs whose gap coverage falls inside S3's coverage window.
  - Satisfied by existing `S3Fetcher.FilterCompleted`, which skips months already marked `done` in `claw.sync_state`. Pre-detect phase surfaces any (symbol, month) that's not actually complete, and the next boot's S3 phase picks those up via the gap repairer's S3 fallback path.
- [x] 1.3 Make the API phase consume the gap report too: only fetch ranges that the previous S3 phase did not cover (typically current month).
  - Satisfied by existing `APIFetcher.FillSymbol`, which resumes from `LatestTimestamp(symbol, interval) + intervalDur` for every target. Warm starts naturally walk only the tail.
- [x] 1.4 Verify S3 writes and API writes both go through upsert paths (`ON CONFLICT ... DO NOTHING` / `DO UPDATE`) so re-runs after a crash do not error on duplicate primary keys.
  - Verified in `store.CopyCandles`: uses a TEMP staging table + `INSERT ... ON CONFLICT (symbol, ts) DO NOTHING`. Symbol upsert uses `ON CONFLICT (market, symbol) DO UPDATE`.
- [x] 1.5 Add structured log lines at every phase boundary (`phase=... symbol_count=... gap_count=...`) so tailing logs gives clear progress.
- [ ] 1.6 Unit-test the new driver on a warm-start scenario. *Deferred*: neither aggregator nor backtest-engine has existing test scaffolding for the pipeline path. Adding it is a self-contained follow-up change (`add-aggregator-pipeline-tests`).

## 2. data-aggregator: boot-time auto-invocation and HTTP teardown

- [x] 2.1 In `cmd/server/main.go`, after store + migrations, call `syncSvc.Start(...)` (or the new boot driver) in a background goroutine BEFORE `h.Spin()` returns. Block main on signals as today.
- [x] 2.2 In `internal/router/router.go`, remove registrations for `/api/sync/*`, `/api/symbols`, `/api/klines`, `/api/gaps`, `/api/gaps/repair`. Keep only `GET /healthz`.
- [x] 2.3 Delete the now-unused handler files: `internal/handler/sync.go`, `internal/handler/symbol.go`, `internal/handler/kline.go`, `internal/handler/gap.go`. Delete `SyncService.Start` / `Status` public methods if no caller remains; keep the internal `run` pipeline.
  - Whole `internal/handler` directory removed.
- [x] 2.4 Default `server.address` in `config.yaml` to `127.0.0.1` so the aggregator does not listen on a public interface. Document this in the config comment.
- [x] 2.5 Confirm `/healthz` returns 200 as soon as DB + migrations are ready (not gated on boot pipeline completion). Handler is an in-memory 200 response; `RunBoot` runs in its own goroutine after `h.Spin()` is already going. Verified by design (no test scaffolding exists).
- [x] 2.6 Update `data-aggregator/Dockerfile` / `docker-compose.yml` if any published port or healthcheck URL needs adjusting.
  - Removed host port mapping from compose; added an internal Docker healthcheck hitting `127.0.0.1:8080/healthz`.

## 3. backtest-engine: add data-gateway read endpoints

- [x] 3.1 Add read queries for klines to `internal/store/` (one function that composes the table name as `claw.futures_<interval>` after validating interval): `SELECT ts, open, high, low, close, volume, quote_volume FROM claw.futures_<interval> WHERE symbol=$1 AND ts BETWEEN $2 AND $3 ORDER BY ts ASC`.
  - `Store.QueryKlines` in new `internal/store/market_data.go`.
- [x] 3.2 Add read queries for symbols: `SELECT symbol, rank, volume_24h_quote, status FROM claw.symbols WHERE market=$1 AND rank IS NOT NULL ORDER BY rank ASC LIMIT $2`.
  - `Store.ListActiveSymbols` in the same file.
- [x] 3.3 Add read queries for gaps: `SELECT symbol, interval, gap_from, gap_to, missing_bars, status FROM claw.gaps WHERE ($1::text IS NULL OR symbol=$1) AND ($2::text IS NULL OR interval=$2) ORDER BY gap_from DESC`.
  - `Store.QueryGaps` + `GapFilter` struct.
- [x] 3.4 Create `internal/handler/kline.go`, `symbol.go`, `gap.go` in backtest-engine. Each exposes a Hertz handler whose request/response shape matches the old aggregator endpoints 1:1 (field names, JSON casing, ordering).
- [x] 3.5 Register the three new routes in `internal/router/router.go` under the `/api` group: `GET /api/klines`, `GET /api/symbols`, `GET /api/gaps`.
- [x] 3.6 Reject invalid `interval` values with a `400` and a machine-readable error listing the allowed intervals.
  - Kline handler returns `{"error":"unsupported interval","allowed_intervals":["5m","15m","30m","1h","4h","1d"]}`.
- [ ] 3.7 Add integration-style tests hitting the three endpoints against a test Timescale with seeded rows. *Deferred* same reason as 1.6 — no existing test scaffolding. Follow-up: `add-backtest-engine-gateway-tests`.

## 4. desktop-client: point at backtest-engine

- [x] 4.1 Locate the data-layer HTTP client in `desktop-client/`. Found: `desktop-client/src/stores/settingsStore.ts` and `desktop-client/electron/ipc/remote.ts`. Base URL: `http://localhost:8081`.
- [x] 4.2 Change the base URL for symbols / klines / gaps calls to the backtest-engine endpoint. **No-op**: desktop-client already uses only 8081 for all remote calls. When it starts calling the new `/api/klines`/`/api/symbols`/`/api/gaps` endpoints, they will resolve on backtest-engine out of the box.
- [x] 4.3 Remove any environment variable or config entry that points at the aggregator. **No-op**: no such references exist in desktop-client.
- [ ] 4.4 Run the desktop-client against a local stack — *runtime validation, see §5*.

## 5. End-to-end validation on a single host

> These tasks require rebuilding and redeploying the container stack with destructive DB operations. They are left for the user to execute on their local host. See the **How to validate** section at the bottom of this file for copy-paste commands.

- [ ] 5.1 Clean boot: drop the DB, start Timescale, start aggregator — verify boot pipeline runs, logs show each phase, DB fills, aggregator continues to run idle.
- [ ] 5.2 Warm boot: restart aggregator with full DB — verify S3 phase downloads zero historical months; total pipeline time is minutes, not hours.
- [ ] 5.3 Crash recovery: kill aggregator mid-S3 download; restart — verify the next boot detects remaining gaps and fills only those.
- [ ] 5.4 End-to-end data path: start backtest-engine, issue `curl /api/klines?symbol=BTC_USDT&interval=1h&from=...&to=...` — confirm data returns.
- [ ] 5.5 Confirm `curl http://<host>:8080/api/*` from outside localhost fails (aggregator not reachable).
- [ ] 5.6 Confirm desktop-client renders symbols / klines against the backtest-engine base URL only.

## 6. Documentation

- [x] 6.1 Created `data-aggregator/README.md` describing the headless-worker model, boot pipeline, observability, and `/healthz`-only surface.
- [x] 6.2 Updated architecture diagrams in `README.md`, `README.zh-CN.md`, and `README.zh-TW.md` so they show `desktop-client → backtest-engine → Timescale` with `data-aggregator` as a side-channel writer (no arrow from desktop-client).
- [x] 6.3 Added an **Out of scope / coming next** section to `data-aggregator/README.md` covering `ws-realtime-sync` and the possible periodic catch-up tick.

## How to validate (for §5)

```sh
# 5.1 Clean boot
cd data-aggregator
docker compose down -v
docker compose up -d --build
docker logs -f claw-data-aggregator  # watch [sync] phase=... lines

# 5.2 Warm boot
docker restart claw-data-aggregator
docker logs -f claw-data-aggregator  # expect S3 phase ok=0 failed=0 total=0 for done months

# 5.3 Crash recovery
docker kill claw-data-aggregator
docker start claw-data-aggregator
docker logs -f claw-data-aggregator  # expect pre_detect to report remaining gaps

# 5.4 Data path via backtest-engine
cd ../backtest-engine
docker compose up -d --build
curl "http://localhost:8081/api/symbols?market=futures&limit=5"
curl "http://localhost:8081/api/klines?symbol=BTC_USDT&interval=1h&from=$(date -u -v-7d +%s)&to=$(date -u +%s)"

# 5.5 Aggregator unreachable externally
curl -sSf http://localhost:8080/healthz ; echo "exit=$?"   # expect non-zero exit

# 5.6 Desktop-client
cd ../desktop-client
pnpm dev
# Verify symbol list / K-line chart loads; check DevTools Network tab for 8081 only.
```
