## Context

This is a pure hygiene change.  The scope is mechanical — rename one
directory, rename an env-var prefix, move a couple of stray files — but the
blast radius touches ~90 source files across one service plus the shared
Makefile, docker-compose, and READMEs.  The risk is breakage from a missed
reference, not from an incorrect design choice.

Current state after `sandbox-service-and-ai-review`:

```
/
├── api/                    ← OpenAPI contract
├── backtest-engine/        ← Go service; NOT the backtest executor anymore
│   ├── cmd/server/         ← HTTP entry
│   ├── cmd/claw-engine-cli ← ops CLI
│   └── internal/…          ← aireview, compliance, sandboxclient, …
├── sandbox-service/        ← Python service; where backtests ACTUALLY run
├── data-aggregator/        ← k-line ingestion
├── desktop-client/         ← Electron app
├── design/trader.pen       ← lone design file
├── e2e/run.sh              ← lone e2e script
├── internal/version/       ← empty dead dir
├── node_modules/           ← empty dead dir (no root package.json)
├── docs/ openspec/ scripts/ api/
└── LICENSE Makefile README*.md TESTING.md
```

Target state:

```
/
├── api/
├── service-api/            ← was backtest-engine
├── sandbox-service/
├── data-aggregator/
├── desktop-client/
├── docs/
│   └── design/trader.pen   ← moved from design/
├── scripts/
│   └── e2e.sh              ← moved from e2e/run.sh
├── openspec/
└── LICENSE Makefile README*.md TESTING.md
```

Four services (symmetric), four function directories, four top-level files.

## Goals / Non-Goals

**Goals:**

- Name of the Go service directory matches the service's actual job
  (API + orchestration, not backtesting).
- Root tree readable in one `ls`: no empty dirs, no single-file dirs.
- Env-var prefix matches the new service name — no historical confusion.
- Green build + green tests on the renamed tree.
- Preserve git blame via `git mv` (no delete-and-recreate).

**Non-Goals:**

- Change any runtime behaviour.  Endpoints, payloads, DB schema, HTTP
  status codes, OpenAPI: all unchanged.
- Rename business-domain identifiers (Go structs like `BacktestService`,
  `BacktestConfig`; DB tables like `backtest_runs`; openspec capability
  names like `backtest-api`).  The business domain is still "running
  backtests" — only the *service* that orchestrates it changes name.
- Rename the CLI binary (`claw-engine-cli`).  That's a user-facing name,
  and "engine" in context means "the claw stack", not this one service.
- Deprecation aliases for the old env-var prefix.  See Decision 3.

## Decisions

### Decision 1: Target name is `service-api/`, not `api-server/` / `engine` / `claw-api`

Alternatives considered:

| Name | Pros | Cons |
|---|---|---|
| `engine` | Short; parallels `sandbox-service` on symmetry | Too generic — "engine" can mean anything; collides mentally with `claw-engine-cli` |
| `api-server` | Obvious role | Implies "just serves endpoints" — understates the orchestration (Gates 1+2, callback handling) |
| `claw-api` | Readable, namespaced | Introduces a new prefix convention that nothing else uses |
| `orchestrator` | Accurate | Long; not a word anyone grep's for |
| **`service-api`** | Names the role + signals it's one of several services | Slightly redundant (all are "services"); acceptable given the symmetry with `sandbox-service` |

Chosen: `service-api`.  The `*-api` suffix will read naturally to anyone
seeing it next to `sandbox-service` (which does the work) and
`data-aggregator` (which does ingestion).

### Decision 2: `git mv` per file, NOT delete-and-recreate

Preserves blame / `git log --follow`.  One command for the directory itself
(`git mv backtest-engine service-api`) then let `sed -i` handle the
in-file reference edits.  `git log --follow service-api/internal/service/backtest_service.go`
will keep working.

### Decision 3: No deprecation alias for `BACKTEST_*` → `SERVICE_API_*`

Alternatives:

| Approach | Notes |
|---|---|
| Clean cut | Rename everywhere; old env vars silently ignored after restart. Simplest code. |
| Dual-read | For 6 months, `applyEnvOverrides` reads `SERVICE_API_X` first, falls back to `BACKTEST_X`, logs a deprecation warning if the old one was used. |
| Fail loud | Explicitly reject presence of `BACKTEST_*` env vars at startup with a "this was renamed" message. |

Chosen: **clean cut**.  This project has no production deployments yet;
every `.env` lives in someone's local dev tree and is trivial to update.
Dual-read buys back-compat that nobody needs and creates a subtle trap
where a stale var silently wins over an updated one.  Fail-loud is
overkill but OK; clean-cut is chosen for minimum code.

### Decision 4: `internal/` at repo root is dead, remove it

The Go convention `internal/` applies *inside a module*, not across
modules.  Each service already has its own `*/internal/…` under its own
`go.mod`.  The root-level `internal/version/` is an empty folder with no
files and no imports.  Delete outright.

### Decision 5: Move one-file dirs (`design/`, `e2e/`) into existing homes

`docs/design/` is the natural home for product-design artifacts; `docs/`
already contains `design-alignment.md` and `screenshots/`.  `scripts/` is
already where helper scripts live (`pre-commit`, `refresh-golden-files.sh`),
so `scripts/e2e.sh` fits.  A single file in its own top-level dir costs
a mental slot and earns nothing.

If either category grows (multiple design files, multiple e2e scripts),
promote back to a top-level directory — cheap to reverse.

### Decision 6: Business-domain names stay, service-layer names go

Renamed (service-layer):

- Directory, Go module path, Docker image, container name, env prefix,
  callback URL host, sandbox-service allowlist entry.

**Not** renamed (business-domain):

- `backtest_runs`, `screener_runs` DB tables
- `BacktestService`, `ScreenerService`, `BacktestConfig` Go types
- `backtest-api`, `backtest-workflow`, `backtest-data-gateway`,
  `backtest-metrics`, `strategy-backtest` openspec capabilities
- `/api/backtest/start`, `/api/screener/start` HTTP endpoints

Rationale: a backtest is a backtest regardless of where the HTTP handler
is hosted.  The *name* of the domain concept is stable; the *location*
of the orchestrator changed.  Renaming the domain would cascade into
every call site without carrying any signal value.

### Decision 7: OpenAPI contract is unchanged

No endpoint paths, payload shapes, or error codes move.  Desktop-client
types don't regenerate.  Only thing that changes is which container
URL the desktop's remote-engine setting points at (`claw-backtest-engine`
→ `claw-service-api`), and that's a user-facing config value not a spec.

### Decision 8: Apply the rename with sed + verify with `go build` + `go test` + vitest

No semantic edits — just mechanical substitutions.  The quality gate is:

1. `go build ./...` clean (catches missed import path updates)
2. `go vet ./...` clean
3. `go test ./... -short` green (catches missed config-key / env-key refs)
4. Desktop `npx vitest run` green
5. `grep -r 'backtest-engine\|BACKTEST_'` returns zero hits outside the
   openspec archive and historical markdown (hall monitor step)

Steps 1-4 are the authoritative checks; step 5 is the human-readable
one for peace of mind.

## Risks / Trade-offs

- **[Missed reference]** → `grep` sweep + build check.  An untested code
  path could still hide a string like `"backtest-engine"` that the build
  won't catch (e.g., a log message, a docker-compose service that
  somewhere pulls by name string).  Mitigation: the exhaustive grep at
  the end of the rename, limited to non-archive paths.

- **[Coordinated deploy]** → Mitigation: both services always deploy
  together via the root compose; no one runs `service-api` and
  `sandbox-service` independently.  The sandbox-service callback
  allowlist (`["backtest-engine", ...]` → `["service-api", ...]`) is a
  config change inside sandbox-service's own file.

- **[Git blame fragmentation on sed edits]** → Mitigation: accept it.
  `git mv` preserves file-level blame; per-line blame on pure text
  replacements is a known trade-off of any rename.  `git log --follow`
  still works.  For tricky archaeology, `git log -p --all -- service-api/…
  backtest-engine/…` spans both names.

- **[Developer IDE / running processes]** → Mitigation: after the merge,
  everyone runs `make test-ci` once.  Go language servers auto-heal on
  next build; IDE workspaces that hard-coded the old path need manual
  fix (one-time cost).

- **[Operator forgets to rename `.env`]** → Mitigation: document the env
  rename prominently in the PR description and the release notes.  The
  clean-cut decision means old vars are silently ignored, so the
  symptom is "config didn't take effect" rather than a crash — annoying
  but not data-destructive.  Could add a fail-loud startup check for
  the presence of any `BACKTEST_*` env var as a follow-up hardening
  task, but not required for this change.

## Migration Plan

Single PR, single commit (or small series of commits if preferred for
review clarity).  Merged all-at-once; no phased rollout needed because:

1. Both services are always deployed together from the root compose.
2. No persistent state (DB rows, on-disk queues) encodes the old name.
3. No API consumers care about the service name — they hit HTTP endpoints
   that don't change.

Post-merge: anyone pulling the rename must `cp backtest-engine/.env.example
service-api/.env && sed -i '' 's/BACKTEST_/SERVICE_API_/' service-api/.env`
to migrate their local env file.  Documented in the PR body.

No rollback strategy beyond `git revert`; the change is atomic.

## Open Questions

- None.  All decisions above are final subject to user green-light on the
  name `service-api` (already given) and the clean-cut env-var
  approach (already given).
