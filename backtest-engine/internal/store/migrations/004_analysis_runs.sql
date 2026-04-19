-- Migration 004: analysis_runs table for OptimLens / SignalReview /
-- TradeExplain. Parallel to backtest_runs; same envelope semantics.

BEGIN;

CREATE TABLE IF NOT EXISTS {{.Schema}}.analysis_runs (
    id           UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    type         TEXT            NOT NULL,    -- 'optimlens' | 'signals' | 'trade'
    config       JSONB           NOT NULL,    -- type-specific request payload
    status       TEXT            NOT NULL DEFAULT 'pending',
    progress     JSONB,
    result       JSONB,
    error        JSONB,
    started_at   TIMESTAMPTZ,
    finished_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analysis_runs_status_idx
    ON {{.Schema}}.analysis_runs (status);
CREATE INDEX IF NOT EXISTS analysis_runs_type_idx
    ON {{.Schema}}.analysis_runs (type);
CREATE INDEX IF NOT EXISTS analysis_runs_created_idx
    ON {{.Schema}}.analysis_runs (created_at DESC);

COMMIT;
