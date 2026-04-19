-- Migration 003: strategy versioning.
-- Adds a `strategy_versions` history table so the app can track
-- evolution of each strategy over time, and teaches the `strategies`
-- table which version is current.
--
-- Back-compat: after this migration the legacy `strategies.code` and
-- `strategies.params_schema` columns are dropped. Callers that still
-- need them should read from the joined `strategy_versions` row for
-- `current_version`. The `GetStrategy` Go helper does this join.
--
-- Idempotent: IF NOT EXISTS on the new table + ADD COLUMN IF NOT
-- EXISTS on `strategies`, backfill guarded by `WHERE NOT EXISTS`.

BEGIN;

-- 1. New table: one row per version per strategy.
CREATE TABLE IF NOT EXISTS {{.Schema}}.strategy_versions (
    strategy_id      UUID        NOT NULL REFERENCES {{.Schema}}.strategies(id) ON DELETE CASCADE,
    version          INTEGER     NOT NULL,
    code             TEXT        NOT NULL,
    summary          TEXT,
    params_schema    JSONB,
    parent_version   INTEGER,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (strategy_id, version)
);

CREATE INDEX IF NOT EXISTS strategy_versions_created_idx
    ON {{.Schema}}.strategy_versions (strategy_id, created_at DESC);

-- 2. `strategies` gains a pointer to the current version.
ALTER TABLE {{.Schema}}.strategies
    ADD COLUMN IF NOT EXISTS current_version INTEGER NOT NULL DEFAULT 1;

-- 3. Backfill: each pre-existing strategies row gets a v1 version
--    row with its original code + params_schema, iff no version row
--    exists yet for that strategy. Re-running this migration is a
--    no-op.
INSERT INTO {{.Schema}}.strategy_versions
    (strategy_id, version, code, summary, params_schema, parent_version, created_at)
SELECT
    s.id,
    1,
    s.code,
    'Initial version',
    s.params_schema,
    NULL,
    s.created_at
FROM {{.Schema}}.strategies s
WHERE NOT EXISTS (
    SELECT 1 FROM {{.Schema}}.strategy_versions sv
    WHERE sv.strategy_id = s.id
);

-- 4. Drop the legacy columns from `strategies` — their data now lives
--    on `strategy_versions`. Existing callers read via the join.
--    Guarded so the migration is safe to re-run.
ALTER TABLE {{.Schema}}.strategies
    DROP COLUMN IF EXISTS code,
    DROP COLUMN IF EXISTS params_schema;

COMMIT;
