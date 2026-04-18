## Why

The repo has **zero automated tests** today. Both Go services and the desktop client compile and run, but there's nothing catching:
- regressions in gap-detection SQL and CSV parsing (silent data corruption)
- schema drift between `data-aggregator` (writer) and `backtest-engine` (reader) — a particularly sharp edge after the `headless-data-aggregator` split
- bypasses in the Python sandbox's AST compliance check (a security surface — user-submitted code)
- quiet breakage of frontend state transitions (settings persistence, polling, i18n)

We just deferred six runtime-validation items (`5.1`–`5.6`) from the last change because there was no test scaffolding to run them through. Before the codebase grows further, we need a minimal but real foundation: one command per platform to run tests, a DB-isolation pattern, and a small set of pilot test cases that prove the stack works and anchor the conventions.

**Explicit decisions the user made during explore:**
- Single big change (not split across services) so conventions are consistent from day one.
- DB-backed tests use the existing shared Timescale plus per-suite schema isolation — no testcontainers.
- TypeScript: Vitest.
- CI: **local only** for now — a `Makefile` at the repo root is the single source of truth; GHA can wrap it later with one file.
- Python sandbox: **in scope** (pytest + pytest-cov). Compliance is a security surface and belongs to the initial foundation.
- Playwright: deferred to a follow-up change.

## What Changes

**Repository root**
- Add `Makefile` with targets: `test`, `test-aggregator`, `test-backtest`, `test-sandbox`, `test-desktop`, `test-e2e`, `db-up`, `db-down`, `test-ci` (alias of `test` — future GHA hook point).
- Add `TESTING.md` documenting how to run tests, add tests, and extend fixtures.
- Add `scripts/pre-commit` hook (optional; developers opt in with `ln -s`) running `go build`, `go vet`, `tsc --noEmit`, `eslint` — fast checks only, no tests.

**data-aggregator**
- New packages:
  - `internal/testdb/` — helper that creates a per-test `test_<uuid>` Postgres schema, runs migrations against it, returns a `*Store`, and drops the schema on cleanup.
  - `internal/testhttp/` — Hertz handler-level helper (construct `*app.RequestContext`, call handler, read response).
  - `testdata/gateio/` — golden-file snapshots of Gate.io responses (tickers JSON, candles JSON, one monthly CSV.gz) served via `httptest.Server` in tests.
- Pilot tests (one representative per category):
  - Unit: `fetcher.parseGateS3CSV`, `model.IntervalDuration`, `gap.Repairer.ShouldSkip`.
  - DB integration: `gap.Detector.DetectOne` against a seeded schema.
  - HTTP integration: `GET /healthz` returns 200 without waiting for pipeline.
- **Flagship test #1 — pipeline idempotence:** seed partial data → run `SyncService.RunBoot` (with Gate.io stub) → assert S3 phase downloads only missing months → re-run → assert S3 phase downloads zero.

**backtest-engine**
- Same `testdb/` + `testhttp/` pattern (mirrored, not shared — avoids cross-module Go dependency).
- Pilot tests:
  - Unit: `store.IsSupportedInterval`, request-parsing helpers.
  - DB integration: `store.QueryKlines`, `store.ListActiveSymbols`, `store.QueryGaps`.
  - HTTP integration: `KlineHandler` rejects bad interval with 400 + `allowed_intervals`; happy-path returns seeded rows.
- **Flagship test #2 — shared-schema contract:** inside `backtest-engine` tests, apply `data-aggregator`'s migration SQL files against the test schema (via `go:embed` of the aggregator migrations — or by fetching the migration files through a test-only build tag), then assert every gateway handler can `SELECT` its columns without type errors. This is the single highest-leverage test in the change.

**backtest-engine/sandbox (Python)**
- Add `backtest-engine/sandbox/tests/` directory with `conftest.py`, `test_compliance.py`, `test_metrics.py`, `test_strategy.py`, `test_screener.py` (pilot).
- Add `backtest-engine/sandbox/pytest.ini` and `backtest-engine/sandbox/requirements-test.txt` (pytest, pytest-cov; installed into an isolated venv created by the Makefile).
- Golden metrics table: hand-computed Sharpe / max-drawdown / win-rate for a fixed 10-bar strategy committed to `testdata/golden_metrics.json`; `test_metrics.py` asserts exact match.
- Compliance coverage: one test per `forbidden_builtins` / `forbidden_modules` entry asserts the AST checker rejects it; at least one smoke test for the `module_whitelist` happy path.

**desktop-client**
- Add Vitest: `vitest.config.ts`, `@vitest/ui` optional, `src/test-setup.ts`.
- Pilot tests:
  - `src/stores/settingsStore.test.ts` — zustand transitions (load → setRemoteBaseURL → persisted).
  - `src/services/remote/client.test.ts` — `pollBacktestResult` with a fake status function (retries, done, failed, abort).
  - `eslint-plugin-claw/index.test.js` — ESLint `RuleTester` coverage for both custom rules.
- No coverage threshold enforced yet (treat pilot as the seed, not the ceiling).

**Docker E2E smoke**
- Reuse existing `data-aggregator/config.test.yaml` + `docker-compose.test.yml` as a base.
- Add `e2e/` at repo root: a small Go test program (or shell script — to be decided in design.md) that:
  1. `docker compose -f data-aggregator/docker-compose.yml -f data-aggregator/docker-compose.test.yml up -d --build`
  2. waits for aggregator `/healthz` + waits for pipeline `phase=done` in logs (timeout 5 min)
  3. `docker compose up -d` backtest-engine (rebuilt with test changes)
  4. `curl /api/symbols?limit=2` → assert JSON has 2 rows
  5. `curl /api/klines?symbol=BTC_USDT&interval=1h&from=...&to=...` → assert non-empty
  6. `docker compose down -v`
- Invoked by `make test-e2e`; intentionally NOT part of `make test` (slow, mutates Docker state).

## Capabilities

### New Capabilities
- `test-infrastructure`: The conventions and shared utilities that make tests possible across the repo — DB schema isolation, Hertz handler helpers, Gate.io golden files, Makefile entry points, TESTING.md usage guide. Downstream changes add more tests; this capability defines the shape.

### Modified Capabilities
*(None. This change adds scaffolding and pilot coverage; it does not modify product requirements.)*

## Impact

**Affected code (new):**
- `Makefile`, `TESTING.md`, `scripts/pre-commit` — repo root
- `data-aggregator/internal/testdb/*.go`, `data-aggregator/internal/testhttp/*.go`
- `data-aggregator/testdata/gateio/*` (golden files)
- `data-aggregator/**/*_test.go` (pilot tests)
- `backtest-engine/internal/testdb/*.go`, `backtest-engine/internal/testhttp/*.go`
- `backtest-engine/testdata/gateio/*`
- `backtest-engine/**/*_test.go` (pilot tests + flagship shared-schema test)
- `backtest-engine/sandbox/tests/**`, `pytest.ini`, `requirements-test.txt`
- `desktop-client/vitest.config.ts`, `desktop-client/src/test-setup.ts`, `desktop-client/**/*.test.ts`
- `e2e/` (smoke test runner)

**Affected code (modified):**
- `data-aggregator/go.mod`, `backtest-engine/go.mod` — no new runtime deps; test code uses stdlib only (no testify, no testcontainers).
- `desktop-client/package.json` — add `vitest`, `@vitest/ui`, `jsdom` as devDependencies; add `"test"` script.
- `data-aggregator/internal/store/timescale.go` — may expose a `Migrate(ctx, schema)` variant that targets a specific schema, if the current `Migrate` hardcodes `claw`. (Investigated in design.md.)

**Follow-ups this change bought us:**
- `headless-data-aggregator` runtime-validation tasks 5.1 / 5.2 / 5.3 / 5.5 are effectively covered by the pipeline-idempotence flagship test + the E2E smoke. Once this change lands, those boxes can be retroactively ticked in the archive notes.

**Out of scope (explicitly deferred):**
- Playwright UI E2E (follow-up: `add-ui-e2e-tests`).
- GitHub Actions CI workflow (follow-up: `add-github-actions-ci` — should be a single file wrapping `make test-ci`).
- Comprehensive coverage sweep (this change establishes the pattern and one test per category; real breadth comes later, driven by bugs found in prod).
- Performance / load tests.
- Mutation testing, property-based testing (could be layered in later if the need arises).
