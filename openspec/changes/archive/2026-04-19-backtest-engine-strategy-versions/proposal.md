## Why

Contract defines strategy versions (`/api/strategies/{id}/versions` endpoints). DB today: `claw.strategies` table has `id, name, code_type, code, params_schema, created_at, updated_at` — no version tracking. The UI (Strategy Management, Workspace Design auto-save) expects versions to work.

This change adds schema + API impl to support the version lifecycle.

## What Changes

**DB schema migration** (`003_strategy_versions.sql` in backtest-engine migrations):
- New table `{{.Schema}}.strategy_versions`:
  - `strategy_id UUID REFERENCES strategies(id) ON DELETE CASCADE`
  - `version INTEGER NOT NULL`
  - `code TEXT NOT NULL`
  - `summary TEXT`
  - `params_schema JSONB`
  - `parent_version INTEGER` (nullable)
  - `created_at TIMESTAMPTZ`
  - `PRIMARY KEY (strategy_id, version)`
- `strategies` table gains `current_version INTEGER NOT NULL DEFAULT 1`
- Backfill: for each existing row, `current_version = 1`, insert a `strategy_versions` row with version=1 from existing code
- Migration is **destructive on `updated_at`**: after backfill, `updated_at` on `strategies` aligns with latest version's `created_at`

**Endpoint impl**:
- `GET /api/strategies/{id}/versions` — paginated, newest first
- `POST /api/strategies/{id}/versions` — body `{ code, summary?, params_schema?, parent_version? }`; server assigns next `version`; updates parent strategy's `current_version`
- `GET /api/strategies/{id}/versions/{version}` — single version

**Create strategy now creates v1 implicitly**:
- `POST /api/strategies` creates a `strategies` row + a `strategy_versions` row with version=1

**Error codes**:
- `STRATEGY_VERSION_NOT_FOUND` — bad `version` number or bad `parent_version`
- `STRATEGY_NOT_FOUND` — unchanged

## Capabilities

### New Capabilities
*(None.)*

### Modified Capabilities
- `strategy-api`: Implements the version endpoints.

## Impact

**New files**
- `backtest-engine/internal/store/migrations/003_strategy_versions.sql`
- `backtest-engine/internal/store/strategy_versions.go` — CRUD for versions table
- `backtest-engine/internal/handler/strategy_versions.go` — 3 handlers
- Test: `backtest-engine/internal/handler/strategy_versions_test.go`

**Modified files**
- `backtest-engine/internal/store/migrations/001_backtest_tables.sql` — if we make schema changes to strategies table here (otherwise add as a new migration 003)
- `backtest-engine/internal/store/store.go` — add new methods `ListStrategyVersions`, `CreateStrategyVersion`, `GetStrategyVersion`
- `backtest-engine/internal/handler/strategy.go` — Create now also inserts v1; List / Get return `current_version` field
- `backtest-engine/internal/model/strategy.go` — add `CurrentVersion int` to Strategy, add `StrategyVersion` struct
- `backtest-engine/internal/router/router.go` — register 3 new routes

**Depends on**
- `api-contract-new-capabilities` (contract)
- `backtest-engine-align-contract` (envelope + errors)

**Out of scope**
- Tags / labels on versions
- Forking history graph visualization (frontend concern)
- Diff computation (frontend does text diff; backend just stores code)
- Version comparison endpoint (`GET /versions/compare?from=1&to=3`) — future
