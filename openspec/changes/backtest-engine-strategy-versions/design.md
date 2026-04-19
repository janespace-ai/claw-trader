## Context

Strategy versioning is straightforward in concept but has one tricky migration moment: existing `strategies` rows need to be treated as v1 without losing their code.

## Goals / Non-Goals

**Goals:**
- Separate `strategy_versions` table stores full version history.
- `strategies` becomes the "latest pointer": `current_version` + other mutable fields (name, is_favorite, status).
- Backward-compatible migration: existing strategies get v1 auto-generated from their current code.
- All three endpoints implemented with contract-shape responses.

**Non-Goals:**
- Computing diffs server-side.
- Fork / merge graph visualization.
- Rollback UI (frontend handles via "Revert" → create new version with old code).

## Decisions

### D1. Separate versions table, not a `version` column on strategies

**Decision.** `strategy_versions` table keyed by `(strategy_id, version)`. Strategies table becomes the mutable "head" pointer:

```sql
strategies (id, name, code_type, current_version, status, is_favorite, tags, created_at, updated_at)
strategy_versions (strategy_id, version, code, summary, params_schema, parent_version, created_at)
```

Rationale: clean separation between mutable metadata (name, favorite) vs. immutable snapshots (code).

### D2. Remove `code` + `params_schema` from `strategies` table at migration

**Decision.** After backfilling v1 for each existing row, **drop** `code` and `params_schema` columns from `strategies`. They live only in versions now. `GET /api/strategies/{id}` response composes `strategy + latest version` via join.

Alternative: keep `strategies.code` as a denormalized mirror of the latest version's code. Rejected: drift risk.

### D3. Migration: backfill v1 transactionally

**Decision.** Migration 003 does:

```sql
BEGIN;

ALTER TABLE {{.Schema}}.strategies
  ADD COLUMN current_version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE {{.Schema}}.strategy_versions (
  strategy_id UUID NOT NULL REFERENCES {{.Schema}}.strategies(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  code TEXT NOT NULL,
  summary TEXT,
  params_schema JSONB,
  parent_version INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (strategy_id, version)
);

-- Backfill v1 for each existing strategy
INSERT INTO {{.Schema}}.strategy_versions (strategy_id, version, code, summary, params_schema, created_at)
SELECT id, 1, code, 'Initial version', params_schema, created_at
FROM {{.Schema}}.strategies;

ALTER TABLE {{.Schema}}.strategies DROP COLUMN code;
ALTER TABLE {{.Schema}}.strategies DROP COLUMN params_schema;

COMMIT;
```

Idempotent on re-run? Not automatically; wrap in a "migration version" check if the migrations runner doesn't already track which have run (it does — text/template approach from `test-infrastructure` change handles this).

### D4. Create strategy flow: atomic insert of row + v1

**Decision.** `CreateStrategy(ctx, s) -> id` wraps two inserts in a transaction: strategies row + strategy_versions v1. `current_version = 1`.

If transaction fails mid-way, both are rolled back.

### D5. Create version: assigns next integer, updates current

**Decision.** `CreateStrategyVersion(ctx, strategyID, payload)`:

```sql
BEGIN;
  SELECT current_version FROM strategies WHERE id = $1 FOR UPDATE;  -- lock
  -- new_version = current_version + 1
  INSERT INTO strategy_versions (strategy_id, version, code, summary, parent_version, ...)
    VALUES ($1, $2, ...);
  UPDATE strategies SET current_version = $2, updated_at = now() WHERE id = $1;
COMMIT;
```

`FOR UPDATE` lock prevents concurrent version conflicts (two simultaneous `POST /versions` requests).

### D6. parent_version defaults to current_version (linear history)

**Decision.** If `payload.parent_version == nil`, set to `current_version`. Explicit non-current value creates a fork. Both are fine.

If `payload.parent_version > current_version` or refers to non-existent version → `STRATEGY_VERSION_NOT_FOUND`.

## Risks / Trade-offs

- **[Migration drops columns — irreversible forward move]** → Standard DB migration risk. Rollback = restore from backup. Tests validate backfill before commit.

- **[Two-way read: get strategy includes latest version code]** → Slightly more complex query (join) but postgres handles trivially.

- **[Race condition on concurrent inserts]** → `FOR UPDATE` lock handles it. Tested with a concurrent-insert integration test.

## Migration Plan

1. Land schema migration (backfill v1 for all existing).
2. Land handlers.
3. Backend now serves version endpoints; frontend Strategy Management can consume.

Rollback: revert schema migration (requires manual DB op since column drops are in forward direction).

## Open Questions

- Should `DELETE /api/strategies/{id}/versions/{version}` be supported? → No. Immutable history.
- Should listing versions include the code inline or only metadata + a separate fetch? → Include code. UI renders diff inline; fetch overhead negligible for short code.
- What about a "favorite version" concept? → No; current_version is the only pointer.
