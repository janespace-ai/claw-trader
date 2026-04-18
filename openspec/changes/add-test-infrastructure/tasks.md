## 1. Migration templating (prereq for schema isolation)

- [ ] 1.1 In `data-aggregator/internal/store/timescale.go`, change `Migrate(ctx)` so each SQL file is rendered through `text/template` with `{"Schema": s.schema}` before execution. Preserve current behavior (same SQL emitted) when `Schema == "claw"`.
- [ ] 1.2 Rewrite `data-aggregator/internal/store/migrations/*.sql`: replace every literal `claw.` that qualifies a table/index/hypertable with `{{.Schema}}.`. Leave comments and non-qualifier occurrences alone. Manually diff the rendered output for `Schema = "claw"` against pre-change SQL to confirm byte equivalence.
- [ ] 1.3 Add `store.NewFromPool(pool *pgxpool.Pool, schema string) *Store` constructor; refactor `New(ctx, cfg)` to use it internally. Keep public API.
- [ ] 1.4 Mirror 1.1–1.3 in `backtest-engine/internal/store/store.go` and `backtest-engine/internal/store/migrations/*.sql`.
- [ ] 1.5 Rebuild + manually `docker compose up -d --build` both services against the current prod DB; verify migrations apply cleanly (they're idempotent, so re-running should be a no-op).

## 2. Go testdb helper (schema-per-test)

- [ ] 2.1 Create `data-aggregator/internal/testdb/testdb.go` exposing `New(t *testing.T) *store.Store`. Reads `CLAW_TEST_DSN` from env; skips test with a clear message if unset. Creates `test_<8-hex>` schema, runs `Migrate` against it, returns a `*store.Store` pointed at that schema, registers `t.Cleanup` to `DROP SCHEMA ... CASCADE`.
- [ ] 2.2 Add `Reap(ctx, pool, maxAge)` in the same package for cleaning up orphaned schemas. Bind to a Makefile target `make db-reap`.
- [ ] 2.3 Add a trivial self-test in `testdb/testdb_test.go`: call `New(t)`, assert the schema exists, let cleanup run, assert it's gone in a subsequent query.
- [ ] 2.4 Mirror steps 2.1–2.3 in `backtest-engine/internal/testdb/`.

## 3. Go testhttp helper (Hertz handler direct-call)

- [ ] 3.1 Create `data-aggregator/internal/testhttp/hertz.go` with a `Call(t, handler, method, path, body, query) (*protocol.Response, int)` helper that constructs a `*app.RequestContext`, invokes the handler, and returns parsed response + status. Handle JSON body + query params as inputs.
- [ ] 3.2 Create a one-off wiring test `data-aggregator/cmd/server/router_wiring_test.go` that boots Hertz on `:0`, hits `/healthz`, and asserts 200 JSON.
- [ ] 3.3 Mirror 3.1 in `backtest-engine/internal/testhttp/`.
- [ ] 3.4 Mirror 3.2 in `backtest-engine/cmd/server/router_wiring_test.go` — include `/healthz` + one `/api/klines` happy-path GET to prove route registration.

## 4. Gate.io golden files + httptest server

- [ ] 4.1 Hand-craft `data-aggregator/testdata/gateio/tickers_top3.json` with 3 contracts (BTC_USDT, ETH_USDT, XYZ_USDT) and realistic `volume_24h_quote` values.
- [ ] 4.2 Hand-craft `data-aggregator/testdata/gateio/candles_BTC_USDT_1h.json` with ~50 bars, including one bar that has a `sum` field and one that does not (to test nullable quote_volume).
- [ ] 4.3 Generate `data-aggregator/testdata/gateio/s3/.../BTC_USDT-202512.csv.gz` and `ETH_USDT-202512.csv.gz` — gzipped, real `[timestamp,volume,close,high,low,open]` CSV rows for ~200 hours each.
- [ ] 4.4 Create a `.404` marker file at `.../XYZ_USDT-202512.csv.gz.404` (empty file; helper returns 404 when marker is present).
- [ ] 4.5 Create `data-aggregator/internal/testfixtures/gateio.go` with `NewServer(t) (*httptest.Server, config.GateioConfig)` that serves from the tree above and returns a `GateioConfig` whose URLs point at it.
- [ ] 4.6 Copy the same three fixture files + helper to `backtest-engine/testdata/gateio/` and `backtest-engine/internal/testfixtures/`. (Don't share across modules — duplication is cheaper than a shared module for now.)
- [ ] 4.7 Write `scripts/refresh-golden-files.sh` (manual-use, not invoked by Make) that fetches current Gate.io responses for a known-good historical month and writes them to `testdata/`. Include a disclaimer comment.

## 5. Go pilot tests — data-aggregator

- [ ] 5.1 `internal/fetcher/s3_fetcher_test.go`: table test for `parseGateS3CSV` covering (a) happy path 5-field row, (b) blank trailing line tolerance, (c) bad numeric field returns error, (d) short record skipped.
- [ ] 5.2 `internal/model/candlestick_test.go`: table test for `IntervalDuration` (every supported + one unsupported returns 0) and `IsSupportedInterval`.
- [ ] 5.3 `internal/gap/repairer_test.go`: table test for `Repairer.ShouldSkip` covering excluded_symbol, excluded_range match / no match, gap_too_old, malformed date string.
- [ ] 5.4 `internal/gap/detector_test.go`: DB-integration test using `testdb.New(t)`. Seed `claw.futures_5m` with a known-gap sequence, call `DetectOne`, assert `missing_bars` and `Completeness` values.
- [ ] 5.5 `internal/service/symbol_service_test.go`: wire to the gateio `httptest.Server`, call `Refresh`, assert top-N clamp + DB rows.
- [ ] 5.6 `internal/store/timescale_test.go`: integration test for `CopyCandles` idempotence — call twice with the same slice, assert row count stays equal to unique `(symbol, ts)` tuples.

## 6. Go pilot tests — backtest-engine

- [ ] 6.1 `internal/store/market_data_test.go`: unit + DB integration. Validate `IsSupportedInterval` (pure) + call `QueryKlines` / `ListActiveSymbols` / `QueryGaps` against a seeded test schema; assert shape of returned rows.
- [ ] 6.2 `internal/handler/kline_test.go`: use `testhttp.Call` to test (a) missing `symbol` → 400, (b) bad `interval` → 400 with `allowed_intervals`, (c) happy path returns JSON array with expected fields, (d) `limit` param trims to last N.
- [ ] 6.3 `internal/handler/symbol_test.go` + `gap_test.go`: handler-level tests for happy path + empty result.

## 7. Flagship #1 — pipeline idempotence

- [ ] 7.1 Add `SyncService.RunBootSync(ctx)` in `data-aggregator/internal/service/sync_service.go` — synchronous variant that does NOT goroutine. Production code still calls `RunBoot(ctx)`.
- [ ] 7.2 Add factory helper `NewSyncServiceForTest(cfg, store) *SyncService` that accepts already-wired `cfg.Gateio` with overridden URLs (pointing at httptest.Server).
- [ ] 7.3 Write `internal/service/sync_service_test.go::TestPipelineIdempotence`: seed 2025-10 + 2025-11 BTC_USDT rows, run `RunBootSync`, assert S3 progress.Total == expected missing-month count, re-run, assert S3 progress.Total == 0.
- [ ] 7.4 Also assert no duplicate rows in DB after re-run (row count stable).

## 8. Flagship #2 — shared-schema contract

- [ ] 8.1 Add Makefile target `sync-aggregator-migrations` that copies `data-aggregator/internal/store/migrations/*.sql` → `backtest-engine/testdata/aggregator-migrations/*.sql` + writes `backtest-engine/testdata/aggregator-migrations/CHECKSUMS` (sha256 of each).
- [ ] 8.2 Run the sync target once to seed the copies.
- [ ] 8.3 Write `backtest-engine/internal/store/contract_test.go`: first step verifies checksum file matches content; if not, fail with "run `make sync-aggregator-migrations`". Then applies migrations to a `testdb.New(t)` schema, then calls each gateway store method; asserts no error.
- [ ] 8.4 Add reflection-based column check: for each handler response struct, assert that every JSON-tagged field is covered by the SELECT statement in the corresponding store method. (Simple regex over the SQL string + struct tag comparison.)

## 9. Python pytest setup + sandbox tests

- [ ] 9.1 Add `backtest-engine/sandbox/requirements-test.txt` with pinned `pytest==8.*`, `pytest-cov==5.*`, `numpy==1.26.*`, `pandas==2.2.*` (pandas/numpy versions match the prod sandbox image).
- [ ] 9.2 Add `backtest-engine/sandbox/pytest.ini` with `testpaths = tests` and sane `addopts`.
- [ ] 9.3 Create `backtest-engine/sandbox/tests/conftest.py` with fixtures: `sample_bars(n=10)` returning a deterministic pandas DataFrame, `make_strategy(signals)` factory.
- [ ] 9.4 Write `backtest-engine/sandbox/tests/test_compliance.py`: one test per entry in `forbidden_builtins` + one per `forbidden_modules` (read from `backtest-engine/config.yaml` at test load time so the test stays in sync with config). Plus one happy-path test per whitelisted module.
- [ ] 9.5 Write `backtest-engine/sandbox/tests/test_metrics.py`: hand-compute Sharpe, max-drawdown, win-rate for a fixed 10-bar sample strategy; commit results to `backtest-engine/sandbox/tests/testdata/golden_metrics.json`; assert computed vs golden within tolerance.
- [ ] 9.6 Write `backtest-engine/sandbox/tests/test_strategy.py` and `test_screener.py` at smoke level — construct a minimal strategy object, run one bar, assert handlers fire in expected order.

## 10. Desktop-client Vitest setup + tests

- [ ] 10.1 Add vitest + jsdom + @vitest/ui (optional) as devDependencies in `desktop-client/package.json`. Add scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.
- [ ] 10.2 Create `desktop-client/vitest.config.ts` — environment: jsdom, globals: true, point at `src/**/*.test.ts?(x)`.
- [ ] 10.3 Create `desktop-client/src/test-setup.ts` — any global mocks (e.g., fake `window.claw` so settings store tests don't blow up on IPC absence).
- [ ] 10.4 Write `desktop-client/src/stores/settingsStore.test.ts` — cover `load()` happy path, `setRemoteBaseURL` persistence, `checkRemoteHealth` error handling.
- [ ] 10.5 Write `desktop-client/src/services/remote/client.test.ts` — table tests for `pollBacktestResult`: running→done, running→failed, abort signal, custom interval.
- [ ] 10.6 Write `desktop-client/eslint-plugin-claw/index.test.js` using ESLint's `RuleTester`: valid + invalid cases for both `claw/no-hex-color` and `claw/no-raw-jsx-string`.
- [ ] 10.7 Confirm `pnpm test` passes; add the command as `make test-desktop` target invocation.

## 11. Makefile + pre-commit hook

- [ ] 11.1 Create root `Makefile` with targets: `test`, `test-aggregator`, `test-backtest`, `test-sandbox`, `test-desktop`, `test-e2e`, `db-up`, `db-down`, `db-reap`, `test-ci` (alias of `test`), `sync-aggregator-migrations`, `help`. Use `.PHONY` on every target.
- [ ] 11.2 `db-up` runs `docker compose -f data-aggregator/docker-compose.yml up -d timescaledb` and waits for `pg_isready`.
- [ ] 11.3 `test-aggregator` and `test-backtest` set `CLAW_TEST_DSN` env before calling `go test ./...`.
- [ ] 11.4 `test-sandbox` manages the Python venv (create if missing, install if `.installed` sentinel missing) and runs `pytest backtest-engine/sandbox/tests/`.
- [ ] 11.5 `test-desktop` runs `cd desktop-client && pnpm test` (falls back to `npx vitest run` if pnpm unavailable).
- [ ] 11.6 Add `scripts/pre-commit` shell hook running `go build` + `go vet` (both modules), `tsc --noEmit`, `eslint`. Do NOT run tests. Make it executable (`chmod +x`).
- [ ] 11.7 Document in TESTING.md how to install the hook via `ln -s`.

## 12. E2E smoke script

- [ ] 12.1 Create `e2e/run.sh`: `set -euo pipefail`, trap for teardown. Steps as in design §D10.
- [ ] 12.2 Wait helper: poll `docker logs claw-data-aggregator 2>&1 | grep -q "finished status=done"` with 300s timeout.
- [ ] 12.3 Use `jq` for JSON assertions (document jq as a prereq in TESTING.md).
- [ ] 12.4 Make the script executable; wire into Makefile `test-e2e` target.
- [ ] 12.5 Manual run on your local stack; capture expected runtime; document in TESTING.md.

## 13. Docs

- [ ] 13.1 Create `TESTING.md` at repo root with sections: Prerequisites, Quick start (`make db-up && make test`), Make target reference, Adding a test (3 templates: pure unit / DB-backed / HTTP handler), Refreshing Gate.io golden files, Optional pre-commit hook, Troubleshooting.
- [ ] 13.2 Add a small "Testing" subsection to each service's README (short pointer to root TESTING.md — no duplication).
- [ ] 13.3 Update the archived `headless-data-aggregator` change's `tasks.md`: mark 5.1 / 5.2 / 5.3 / 5.4 / 5.5 as covered-by-retrospective-reference and link to the new flagship tests + E2E. (Edit in the archive is allowed for retroactive cross-refs.)

## 14. Final validation

- [ ] 14.1 Run `make db-up && make test` on a clean checkout; expect full green.
- [ ] 14.2 Run `make test-e2e` once; expect full green + clean teardown (no leftover containers).
- [ ] 14.3 Run `go build ./...` + `go vet ./...` in each module; confirm no new warnings.
- [ ] 14.4 Run `pnpm typecheck` + `pnpm lint` in desktop-client; confirm no new errors beyond the pre-existing baseline.
- [ ] 14.5 Spot-check `make db-reap` cleanup by running a test with a forced panic, then confirm `test_*` schema exists, then running `make db-reap`, then confirming it's gone.
