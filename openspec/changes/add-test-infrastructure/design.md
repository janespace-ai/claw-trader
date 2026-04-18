## Context

Three components, three ecosystems, one repo:
- `data-aggregator/` (Go + Hertz + pgx + Timescale)
- `backtest-engine/` (Go + Hertz + pgx + Timescale; plus Python sandbox under `sandbox/`)
- `desktop-client/` (Electron + React + Vite + TypeScript; custom ESLint plugin at `eslint-plugin-claw/`)

Constraints the user has already decided:
- No testcontainers; reuse the host's running Timescale via `docker compose up -d timescaledb`.
- No GitHub Actions yet; Makefile is the canonical test entry point.
- Vitest for TS. Pytest for Python. Stdlib `testing` for Go (no testify).
- Playwright is deferred.

What's shared across all three: they all read/write the same Timescale DB (`claw.claw`). That shared DB is both the architectural coupling we want to guard against AND the test fixture we need to set up cleanly per suite.

## Goals / Non-Goals

**Goals:**
- One command (`make test`) runs every Go / TS / Python test in the repo.
- Every DB-touching test runs against a disposable `test_<uuid>` schema — no shared mutable state, parallel-safe.
- Two flagship tests (pipeline-idempotence + shared-schema-contract) ship with the change, not as TODOs.
- Conventions are obvious enough that a new engineer adding a test doesn't need a design doc — they need an example and `TESTING.md`.
- The E2E smoke test exercises the real `docker-compose` wiring end-to-end, so future refactors can't silently break the dev-start-from-zero story.

**Non-Goals:**
- Coverage targets or gates. We are not going to add `--coverage.threshold.lines=80`. Pilot tests seed the pattern; breadth comes from follow-ups.
- Mocking the DB. Timescale features (hypertables, `LEAD` window) must hit real Postgres or the test is a lie.
- Mocking the Python sandbox container in Go tests. Sandbox tests are their own pytest suite; Go tests stub the callback endpoint and assert on the wire format, not the sandbox.
- Hitting real Gate.io from tests. Period. Every external call is served from `testdata/gateio/` via `httptest.Server`.
- Cross-language test orchestration (no "call pytest from Go"). Each runs in its own native harness under its own Makefile target.

## Decisions

### D1. Schema-per-test isolation via pgx, not testcontainers

**Decision.** Every Go test that touches the DB goes through a helper:

```go
// internal/testdb/testdb.go (sketch — not code to copy)
func New(t *testing.T) *store.Store {
    t.Helper()
    dsn := os.Getenv("CLAW_TEST_DSN")  // e.g. postgres://claw:claw@localhost:5432/claw
    if dsn == "" { t.Skip("set CLAW_TEST_DSN to run DB-backed tests") }
    schema := fmt.Sprintf("test_%s", randHex(8))
    pool := mustOpen(dsn)
    mustExec(pool, "CREATE SCHEMA "+schema)
    t.Cleanup(func() { mustExec(pool, "DROP SCHEMA "+schema+" CASCADE"); pool.Close() })
    // point the Store at this schema (config.Schema = schema)
    return store.NewFromPool(pool, schema)
}
```

**Alternatives considered:**
- **testcontainers-go.** Rejected: user explicitly chose the shared-timescale approach. Also: first-run docker pull is a ~300MB surprise on CI boxes.
- **Transactional tests (BEGIN / ROLLBACK per test).** Rejected: Timescale hypertables and migrations are DDL — they don't honor transactional rollback cleanly. Schema-level isolation sidesteps the whole class of problems.
- **One schema per `TestMain`.** Rejected: parallel test execution within a package still collides. Per-`t` schema is only ~10ms of overhead.

**Consequence.** Tests need `CLAW_TEST_DSN` in env. Makefile sets it. Developers running `go test ./internal/gap/...` directly either set it themselves or see a clean skip message.

### D2. `store.Store` gains a constructor that takes an explicit schema

**Decision.** Both services' `store.New(ctx, cfg)` currently take a full config with `cfg.Schema`. The test helper needs to inject a runtime-generated schema name. Two options:

| | Impact | Cost |
|---|---|---|
| Pass full `DatabaseConfig` with overridden `Schema` | No API change | Duplicates pool setup; tests open their own pool |
| Add a thin `NewFromPool(pool, schema)` constructor | Minor API addition | Tests share a pool, cleaner ownership |

**Chose (2).** Exposing `NewFromPool` is small and keeps pool lifecycle in the helper. Internally `New(ctx, cfg)` can call `NewFromPool` so no duplication.

This also incidentally makes it possible later for `data-aggregator` and `backtest-engine` to share a pool inside the E2E test if we want one — but we don't want that now.

### D3. Migrations need to accept a schema name

**Decision.** Both services embed migrations via `//go:embed migrations/*.sql`. The SQL files hardcode `claw.` in table names. For a test schema `test_abc123`, we need to apply the same SQL but pointed at the test schema.

Options (ranked):

1. **Run migrations with `SET search_path TO <schema>` before executing each file.** Works if the SQL files don't qualify with `claw.` explicitly — but they do. Rejected.

2. **Pre-process the SQL at load time: `strings.ReplaceAll(sql, "claw.", schema+".")`.** Ugly but honest. Brittle if a migration mentions `claw.` in a comment. Reject unless nothing better.

3. **Rewrite migrations to reference `{{.Schema}}` and template-render at load time.** Clean, needs a one-time migration rewrite. **Chose this.** It also puts both services on the same footing for future shared-schema testing.

**Consequence.** All existing migration files (both services) get one tiny edit: `claw.` → `{{.Schema}}.`. The `Migrate()` method renders with `text/template` before execution. In prod, `Schema = "claw"` yields identical SQL. In tests, it yields the isolated schema.

**Risk:** a migration file that uses literal `claw` (e.g. as a role name in a GRANT) would be wrongly rewritten. Mitigation: explicit review during the tasks step; the affected files are small (3 + 2).

### D4. Hertz handler testing — direct call, no server

**Decision.** Handler-level tests construct a `*app.RequestContext` manually, invoke the method, and read the response bytes.

```go
// internal/testhttp/hertz.go (sketch)
func Call(t *testing.T, h func(context.Context, *app.RequestContext), req *protocol.Request) *protocol.Response {
    t.Helper()
    c := app.NewContext(16)
    c.Request = *req
    h(context.Background(), c)
    return &c.Response
}
```

A tiny set of **wiring** tests (one per service, maybe two) starts a real Hertz server on `:0` via `server.New(...)` and does `http.Get` to confirm route registration + JSON round-trip. These are not per-handler — they're a single "end-to-end router" smoke.

**Alternatives:** using a full `httptest.NewServer` with a custom `http.Handler` that adapts to Hertz — too much scaffolding for the return. Rejected.

### D5. Gate.io is served from golden files via `httptest.Server`

**Decision.** Every test that exercises `S3Fetcher` or `APIFetcher` or `SymbolService` injects a fake base URL pointing at a local `httptest.Server` that serves bytes from `testdata/gateio/`:

```
data-aggregator/testdata/gateio/
  tickers_top3.json              ← 3-element response for symbol refresh
  candles_BTC_USDT_1h.json       ← ~50 bars, used by API fetcher paging tests
  s3/
    futures_usdt/
      candlesticks_1h/
        202512/
          BTC_USDT-202512.csv.gz ← real gzipped CSV, ~2KB
          ETH_USDT-202512.csv.gz
          XYZ_USDT-202512.csv.gz.404  ← marker file: server returns 404 for this path
```

The helper walks the tree, serving gz bodies as `application/gzip` and JSON as `application/json`. A 404 marker file is honored so we can test `ErrObjectNotFound` paths.

**How files are produced.** One-shot script `scripts/refresh-golden-files.sh` (manual, not run in CI) pulls current real responses from Gate.io, sanitizes them (strip volatile timestamps to fixed dates), and writes. Commit review is the gate on "did the schema drift?".

**Consequence.** Tests run offline. Flakes are impossible from this side. When Gate.io changes their API, the refresh script surfaces a diff in a PR — visible, intentional.

### D6. Flagship test #1 — pipeline idempotence

**Test outline** (in `data-aggregator/internal/service/sync_service_test.go`):

```
given:
  - test schema, migrations applied
  - seed claw.symbols with BTC_USDT rank=1
  - seed claw.futures_1h with BTC_USDT rows covering 2025-10 + 2025-11 (but NOT 2025-12)
  - httptest.Server serving testdata/gateio/
when:
  - svc := NewSyncServiceForTest(cfg pointing at httptest URLs, testStore)
  - svc.RunBoot(ctx) → wait for completion via a test-only hook
then:
  - S3 fetcher progress.Total == 1   (only 2025-12 for BTC_USDT at 1h)
  - S3 fetcher progress.Done == 1
  - DB now has 2025-12 rows for BTC_USDT 1h
when (second run):
  - svc.RunBoot(ctx)
then:
  - S3 fetcher progress.Total == 0   (everything already done in sync_state)
  - no new rows in DB
```

**Unlocks:** this test, if it passes, retroactively discharges tasks 5.1 / 5.2 / 5.3 in the archived `headless-data-aggregator` change.

**Required hook:** `SyncService` currently kicks `go s.runWithContext(...)` and returns. Tests need synchronous completion. Add a package-private `RunBootSync(ctx)` that runs the pipeline inline (no goroutine). Production code continues to call `RunBoot(ctx)`.

### D7. Flagship test #2 — shared-schema contract

**Problem.** `backtest-engine` reads `claw.futures_<interval>`, `claw.symbols`, `claw.gaps`. These tables are created by `data-aggregator`'s migrations. If aggregator renames a column, backtest-engine's SELECT goes `pgcode=42703 column does not exist` at runtime.

**Test** (in `backtest-engine/internal/store/contract_test.go`):

1. Create a test schema.
2. **Apply aggregator's migrations against it.** Two sourcing options:
   - (a) `go:embed` aggregator's migration files from a relative path — requires `replace` directives in backtest-engine's `go.mod` pointing at `../data-aggregator`, which creates a real cross-module coupling.
   - (b) Copy aggregator's migration SQL into `backtest-engine/testdata/aggregator-migrations/*.sql` and maintain with a `make sync-aggregator-migrations` target that copies from `../data-aggregator/internal/store/migrations/`.
   - (c) Run aggregator's binary (or a mini tool) to migrate, then run test.

   **Chose (b).** It keeps modules independent in Go terms; the explicit `make` target makes schema drift visible in diffs. The `contract_test.go` first fails if migrations are out-of-sync (checksum mismatch vs source), reminding the dev to re-run `make sync-aggregator-migrations`.

3. For each gateway handler (`QueryKlines` / `ListActiveSymbols` / `QueryGaps`), execute the actual SQL against the schema (may return zero rows — that's fine). Assertion: **no error**.
4. Additionally, parse each handler's struct tags and assert every JSON field has a matching SELECTed column. Cheap reflection, huge safety net.

**Consequence.** Any migration PR that renames/drops a column breaks backtest-engine tests, loudly. The copy-drift is caught by the checksum check in step 2. This is the single most leveraged test in the whole change.

### D8. Python pytest runs under its own venv, managed by Make

**Decision.** `make test-sandbox` does:

```
python3 -m venv backtest-engine/sandbox/.venv
backtest-engine/sandbox/.venv/bin/pip install -q -r backtest-engine/sandbox/requirements-test.txt
backtest-engine/sandbox/.venv/bin/pytest backtest-engine/sandbox/tests/
```

First run is slow (pip install); subsequent runs skip install (`.venv/.installed` sentinel file). The prod sandbox Docker image is untouched; test deps do not bloat the production container.

**`requirements-test.txt`** pins:
```
pytest==8.*
pytest-cov==5.*
numpy==1.26.*
pandas==2.2.*
```
— same pandas/numpy versions as the prod sandbox image so metrics golden values stay reproducible.

### D9. Vitest setup

**Decision.** `desktop-client/vitest.config.ts` points at `jsdom` environment (for zustand + any DOM-touching util) and uses `vitest`'s default TypeScript handling via the project's existing Vite config. Add `"test": "vitest run"` and `"test:watch": "vitest"` to `package.json` scripts.

**Not adding:** React Testing Library, jsdom event simulation for charts, MSW. Those are for follow-ups when component tests land.

### D10. E2E runner is a shell script, not a Go program

**Decision.** `e2e/run.sh`:
1. Trap for teardown on exit.
2. `docker compose -f data-aggregator/docker-compose.yml -f data-aggregator/docker-compose.test.yml up -d --build timescaledb data-aggregator`
3. Poll aggregator container log for `[sync] task ... finished status=done` (timeout 300s).
4. `docker compose -f backtest-engine/docker-compose.yml up -d --build backtest-engine`
5. Poll backtest-engine `/healthz`.
6. `curl -fsS http://localhost:8081/api/symbols?limit=2` → `jq length` asserts 2.
7. `curl -fsS http://localhost:8081/api/klines?symbol=BTC_USDT&interval=1h&from=<7d ago>&to=now` → assert non-empty.
8. Teardown: `docker compose down -v`.

**Why shell over Go:** the work is mostly "run command, parse stdout, curl, assert." Go would need a bunch of exec wrapping that adds no value. Shell is closer to what a human would type.

**When to run:** `make test-e2e` only. Not in `make test`, because it's slow, stateful, and has external S3 dependency.

### D11. Pre-commit hook is opt-in

**Decision.** Commit `scripts/pre-commit` to the repo. Do NOT auto-install (can't without a hook management tool like husky, which we're not adding for one file). Document in TESTING.md:

```sh
ln -s ../../scripts/pre-commit .git/hooks/pre-commit
```

Hook contents: run `go build` + `go vet` for each module, `tsc --noEmit` + `eslint` for desktop-client. Skip tests (too slow). Emit a reminder: "run `make test` before PR."

## Risks / Trade-offs

- **[Migration template rewrite may break a subtle case]** → Mitigation: audit the ~8 migration files manually during implementation (task group 2). A one-off grep for `claw\b` in non-table-name contexts catches most issues.

- **[Shared-schema contract test's migration-copy can fall out of sync silently if the `make sync-aggregator-migrations` isn't run]** → Mitigation: the test itself computes checksums of source vs copied files and fails with a "run `make sync-aggregator-migrations`" message before running anything else.

- **[Golden Gate.io fixtures go stale as Gate.io evolves]** → Mitigation: manual `scripts/refresh-golden-files.sh` + review-gate on commits. Not a silent-drift risk because prod calls still hit the real API; any incompat surfaces in runtime before tests.

- **[Makefile portability]** → Targets should work on macOS bash and Linux bash without gmake-isms. Keep it simple (no `%:` pattern rules, no `.SECONDEXPANSION:`). No `set -o pipefail` inside recipes (not all Make shells support it the same way); use `bash -c` for that.

- **[Python venv creation is slow and noisy on first run]** → Mitigation: `.installed` sentinel skip; TESTING.md documents `make test-sandbox` first-run expectation.

- **[Tests that require `CLAW_TEST_DSN` silently skip when env is missing]** → Mitigation: Makefile sets the env explicitly; `go test` invoked outside Makefile prints a clear "skipped — set CLAW_TEST_DSN" line. Consider failing hard in CI (future GHA wrapper can set `CLAW_TEST_STRICT=1` to flip skip→fail).

- **[No CI = nothing enforces testing]** → Accepted. Counter-mitigation is the pre-commit hook and `make test-ci` alias that future GHA wraps. Documented in proposal as a known trade-off of the user's decision.

## Migration Plan

This change is additive. No runtime code paths change. Rollback = revert the commit.

**Sequencing during implementation:**
1. Land migration templating (D3) first — both services start using `{{.Schema}}.` with `Schema = "claw"` in prod. Prove equivalence by hand before touching tests.
2. Land `testdb` + `testhttp` helpers next.
3. Land pilot unit tests (no DB) for both Go services and desktop-client.
4. Land DB integration tests.
5. Land flagship #1 (pipeline idempotence).
6. Land Python pytest setup + compliance tests.
7. Land flagship #2 (shared-schema contract). This is last because it depends on D3 being solid in both services.
8. Land E2E shell runner.
9. TESTING.md + pre-commit hook.

## Open Questions

- Should `make test` run suites in parallel (`make -j`) or serially? Defaulting to serial in tasks.md; parallel is a one-line change later.
- Do we want `pytest-xdist` for sandbox test parallelism? Probably not at this scale; skip for now.
- Should the golden-files refresh script be committed now (empty/stub) or when first needed? Committing now with a minimal first set of fixtures is cleaner.
