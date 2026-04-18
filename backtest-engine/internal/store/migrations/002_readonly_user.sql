-- Migration 002: create claw_readonly user for sandbox containers.
-- This is idempotent: existing role is re-granted the same set of SELECTs.
--
-- Note: the role name `claw_readonly` and the database name `claw` are NOT
-- templated — they are global to the cluster. Only the schema name is
-- templated so test runs can grant on their disposable per-suite schema.

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'claw_readonly') THEN
        CREATE ROLE claw_readonly LOGIN PASSWORD 'claw_readonly';
    END IF;
END
$$;

-- Grants are applied on every migration run so that new tables added to the
-- target schema become visible to claw_readonly without manual steps.
GRANT CONNECT ON DATABASE claw TO claw_readonly;
GRANT USAGE   ON SCHEMA   {{.Schema}} TO claw_readonly;
GRANT SELECT  ON ALL TABLES    IN SCHEMA {{.Schema}} TO claw_readonly;
GRANT SELECT  ON ALL SEQUENCES IN SCHEMA {{.Schema}} TO claw_readonly;

-- Default privileges so future tables/sequences get SELECT automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA {{.Schema}}
    GRANT SELECT ON TABLES    TO claw_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA {{.Schema}}
    GRANT SELECT ON SEQUENCES TO claw_readonly;

-- Explicitly revoke any write capability at the database level.
REVOKE ALL ON ALL TABLES    IN SCHEMA {{.Schema}} FROM claw_readonly;
GRANT  SELECT ON ALL TABLES IN SCHEMA {{.Schema}} TO   claw_readonly;
