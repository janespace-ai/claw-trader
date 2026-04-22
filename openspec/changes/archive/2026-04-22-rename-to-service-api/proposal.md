## Why

After the `sandbox-service-and-ai-review` change landed, the `backtest-engine/`
directory no longer runs any backtests — all user-code execution now lives in
the long-lived `sandbox-service/`.  The old name is now misleading: the
service is actually an API gateway plus Gate 1 (AST) and Gate 2 (AI review)
orchestrator, fronting both backtest and screener workflows (plus market-data
read endpoints, strategy CRUD, analysis, etc.).

Separately, the repo root has accumulated two empty directories (`internal/`,
`node_modules/`) and two single-file directories (`design/trader.pen`,
`e2e/run.sh`) that add visual noise without carrying their weight.  Fresh eyes
landing in this repo have to mentally skip past this clutter.

Both problems are repo hygiene — no user-facing behaviour changes — so the
best time to fix them is now, before further code lands on the stale
structure.

## What Changes

- **Rename `backtest-engine/` → `service-api/`.**  This touches the Go module
  path, 90 files with ~336 references (outside the openspec archive), Docker
  image name (`claw-backtest-engine` → `claw-service-api`), container name,
  callback URLs, sandbox-service's callback allowlist (`"backtest-engine"` →
  `"service-api"`), and the Dockerfile-built binary name.
- **Rename env-var prefix `BACKTEST_*` → `SERVICE_API_*`.**  No deprecation
  alias — this is a single-user, pre-deployment codebase; clean cut is
  simpler than carrying two prefixes forever.  **BREAKING** for anyone
  holding an existing `.env`.
- **Root directory cleanup**:
  - Delete empty `internal/` (dead legacy — Go's internal/ convention lives
    *inside* each service, not at the repo root).
  - Delete empty `node_modules/` (no `package.json` at root; this is
    residue from an ancient mistake).
  - Move `design/trader.pen` → `docs/design/trader.pen` and delete the now
    empty `design/`.
  - Move `e2e/run.sh` → `scripts/e2e.sh` and delete the now empty `e2e/`.
- **Left alone** (business-domain names, not service-layer): openspec
  capability names (`backtest-api`, `backtest-workflow`,
  `backtest-data-gateway`, `backtest-metrics`), DB tables (`backtest_runs`,
  `screener_runs`), Go struct names (`BacktestService`, `BacktestConfig`),
  and the CLI binary name (`claw-engine-cli`).

## Capabilities

### New Capabilities

<!-- None — this change renames directories and variables without
     introducing, removing, or altering any capability's requirements. -->

### Modified Capabilities

<!-- None — no spec-level behaviour changes.  The service at `service-api/`
     serves exactly the same endpoints, returns exactly the same bodies,
     and enforces exactly the same rules as `backtest-engine/` did.

     The archive command will skip spec updates via `--skip-specs`. -->

## Impact

- **Go module path**: `github.com/janespace-ai/claw-trader/backtest-engine`
  → `.../service-api`.  Every import statement inside the service updates.
- **Docker images / containers / docker-compose service names**: all refs
  from `claw-backtest-engine` / `backtest-engine` → `claw-service-api` /
  `service-api`.
- **Env vars** (BREAKING): `BACKTEST_DATABASE_HOST`, `BACKTEST_SANDBOX_SERVICE_URL`,
  `BACKTEST_AI_REVIEW_ENABLED`, etc. → `SERVICE_API_*`.  Operators must update
  their `.env` files.
- **Callbacks**: sandbox-service's `callback.allowlist_hosts` config and
  hardcoded callback URLs (`http://claw-backtest-engine:8081`) update to
  the new host name.  Coupled: both services must redeploy together, but
  deployment is already a single docker-compose action.
- **Makefile**: all `backtest-engine/…` paths update to `service-api/…`;
  targets keep their names (they were named after functions, not services).
- **Root-level READMEs**: descriptions updated, directory listings updated.
- **Not impacted**: OpenAPI contract (no endpoint changes), desktop-client
  code (talks via OpenAPI, doesn't reference service paths), DB schema,
  openspec archive (historical — left untouched).
