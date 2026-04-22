-- Migration 001: backtest-engine tables in the shared claw schema.
-- Assumes data-aggregator migrations have already created the claw schema.

CREATE SCHEMA IF NOT EXISTS {{.Schema}};
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- User strategy code (strategy or screener)
CREATE TABLE IF NOT EXISTS {{.Schema}}.strategies (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT            NOT NULL,
    code_type       TEXT            NOT NULL,        -- 'strategy' | 'screener'
    code            TEXT            NOT NULL,
    params_schema   JSONB,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS strategies_type_idx ON {{.Schema}}.strategies (code_type);
CREATE INDEX IF NOT EXISTS strategies_created_idx ON {{.Schema}}.strategies (created_at DESC);

-- Per backtest run record.
CREATE TABLE IF NOT EXISTS {{.Schema}}.backtest_runs (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id     UUID            REFERENCES {{.Schema}}.strategies(id) ON DELETE SET NULL,
    status          TEXT            NOT NULL DEFAULT 'pending',  -- pending/running/done/failed
    mode            TEXT            NOT NULL DEFAULT 'single',   -- 'single' | 'optimization'
    config          JSONB           NOT NULL,
    progress        JSONB,
    result          JSONB,
    error           TEXT,
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS backtest_runs_status_idx ON {{.Schema}}.backtest_runs (status);
CREATE INDEX IF NOT EXISTS backtest_runs_strategy_idx ON {{.Schema}}.backtest_runs (strategy_id, created_at DESC);

-- Per screener run record.
CREATE TABLE IF NOT EXISTS {{.Schema}}.screener_runs (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id     UUID            REFERENCES {{.Schema}}.strategies(id) ON DELETE SET NULL,
    status          TEXT            NOT NULL DEFAULT 'pending',
    config          JSONB           NOT NULL,
    result          JSONB,
    error           TEXT,
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS screener_runs_status_idx ON {{.Schema}}.screener_runs (status);
