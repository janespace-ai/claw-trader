# Testing

How to run tests, add new ones, and keep the infrastructure healthy.

## Prerequisites

- Docker (for the Timescale container used by DB-backed tests)
- Go 1.22+ — aggregator and backtest-engine
- Python 3.9+ — sandbox tests (any venv-capable Python)
- Node 20+ — desktop-client
- `jq` — used by the E2E runner (`brew install jq` on macOS)

## Quick start

```sh
make db-up   # starts Timescale at localhost:5432 (shared with dev)
make test    # runs every Go / Python / TS suite
```

First `make test` takes ~90s (pytest creates a venv). Subsequent runs are fast.

## Make target reference

| Target | What it runs |
|---|---|
| `make test` | Default: aggregator + backtest + sandbox + desktop |
| `make test-ci` | Alias of `test` — future GHA hook point |
| `make test-aggregator` | `go test ./...` in data-aggregator |
| `make test-backtest` | `go test ./...` in backtest-engine (auto-syncs aggregator migrations first) |
| `make test-sandbox` | pytest against the Python sandbox framework |
| `make test-desktop` | `npx vitest run` in desktop-client |
| `make test-e2e` | docker-based end-to-end smoke; **not** part of `make test` |
| `make db-up` / `make db-down` | Start / stop shared Timescale |
| `make db-reap` | Drop orphan `test_*` schemas (left by panicked tests) |
| `make sync-aggregator-migrations` | Copy aggregator migrations into backtest-engine testdata + refresh CHECKSUMS |
| `make help` | Print the menu |

## Environment

DB-backed tests read `CLAW_TEST_DSN`; the Makefile sets a sensible default (`postgres://claw:claw@localhost:5432/claw?sslmode=disable`). Override only when pointing at a non-standard Timescale:

```sh
CLAW_TEST_DSN=postgres://user:pw@otherhost:5432/db?sslmode=disable make test
```

Running `go test ./...` directly (outside Makefile) with `CLAW_TEST_DSN` unset will **skip** DB tests rather than fail them — so IDE test runs stay friendly.

## Adding a test

### Pure unit test (no DB)

```go
// data-aggregator/internal/foo/bar_test.go
package foo

import "testing"

func TestDoubleIt(t *testing.T) {
    if DoubleIt(3) != 6 { t.Fatal("math broke") }
}
```

### DB-backed test

```go
// data-aggregator/internal/service/x_test.go
package service

import (
    "context"
    "testing"
    "github.com/janespace-ai/claw-trader/data-aggregator/internal/testdb"
)

func TestSomething(t *testing.T) {
    st := testdb.New(t)   // gets a fresh test_<uuid> schema, auto-cleaned
    ctx := context.Background()
    // use st normally — all SQL hits the per-test schema
    _ = ctx
}
```

For **backtest-engine**, `testdb.New(t)` also applies a snapshot of aggregator's migrations so shared tables (`futures_*`, `symbols`, `gaps`) exist — run `make sync-aggregator-migrations` if you ever see a "snapshot out of sync" failure from the contract test.

### HTTP handler test (Hertz)

```go
// backtest-engine/internal/handler/x_test.go
package handler

import (
    "testing"
    "github.com/janespace-ai/claw-trader/backtest-engine/internal/testdb"
    "github.com/janespace-ai/claw-trader/backtest-engine/internal/testhttp"
)

func TestMyHandler(t *testing.T) {
    st := testdb.New(t)
    h := NewMyHandler(st)
    resp := testhttp.Call(t, h.Do, "GET", "/api/x",
        testhttp.MustQuery("a", "b"), nil)
    if testhttp.Status(resp) != 200 {
        t.Fatalf("got %d: %s", testhttp.Status(resp), testhttp.Body(resp))
    }
}
```

### Python (sandbox) test

Tests go under `backtest-engine/sandbox/tests/`. `conftest.py` already wires the framework into `sys.path` so you can `from claw.metrics import compute`. Run `make test-sandbox` (creates a venv on first run).

### TypeScript (desktop-client) test

Co-locate `*.test.ts` next to the source file. Vitest uses `jsdom` — zustand stores work without setup. Global `window.claw` is stubbed in `src/test-setup.ts`; per-test DB resets are explicit in each test's `beforeEach`.

## Gate.io golden files

External fetcher tests run offline, served from `data-aggregator/internal/testfixtures/testdata/gateio/`. When Gate.io changes the API (rare) or you need to capture a different sample:

```sh
scripts/refresh-golden-files.sh
```

Review the diff carefully — any test pinned to exact values will need an update.

## Optional pre-commit hook

Fast sanity checks (go build + vet, tsc, eslint) on every commit:

```sh
ln -s ../../scripts/pre-commit .git/hooks/pre-commit
```

The hook does NOT run tests (too slow). Bypass a single commit with `git commit --no-verify`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "skipping DB-backed test: set CLAW_TEST_DSN" | Run `make db-up` and use `make test-*` (the Makefile sets DSN). |
| Contract test: "snapshot is out of sync" | `make sync-aggregator-migrations` |
| `test_*` schemas piling up in psql | `make db-reap` |
| Sandbox tests fail with `ModuleNotFoundError: claw` | Run via `make test-sandbox`; don't invoke pytest directly |
| Vitest can't find jsdom | `npm install` in `desktop-client/` |

## What runs where

```
.
├── Makefile                      ← canonical entry point
├── data-aggregator/              ← Go: stdlib testing, schema-isolated testdb
├── backtest-engine/              ← Go: same pattern + shared-schema contract
├── backtest-engine/sandbox/      ← Python: pytest in a private .venv
├── desktop-client/               ← TS: Vitest + jsdom
├── e2e/run.sh                    ← bash: real docker stack, real Gate.io
└── scripts/
    ├── pre-commit                ← opt-in fast checks
    └── refresh-golden-files.sh   ← manual Gate.io fixture re-capture
```
