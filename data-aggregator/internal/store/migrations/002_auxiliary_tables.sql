-- Migration 002: symbols, sync_state, gaps tables

-- Symbol master list (Top-N by USDT 24h volume).
CREATE TABLE IF NOT EXISTS {{.Schema}}.symbols (
    symbol              TEXT            NOT NULL,
    market              TEXT            NOT NULL DEFAULT 'futures',
    rank                INTEGER,
    trade_size          DOUBLE PRECISION,
    volume_24h_quote    DOUBLE PRECISION,
    status              TEXT            NOT NULL DEFAULT 'active',
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    PRIMARY KEY (market, symbol)
);
CREATE INDEX IF NOT EXISTS symbols_rank_idx ON {{.Schema}}.symbols (market, rank) WHERE rank IS NOT NULL;

-- Sync state: (symbol, market, interval, source, period) -> completion status.
-- period is 'YYYYMM' for S3 backfills, 'api' for rolling API fill.
CREATE TABLE IF NOT EXISTS {{.Schema}}.sync_state (
    symbol      TEXT            NOT NULL,
    market      TEXT            NOT NULL DEFAULT 'futures',
    interval    TEXT            NOT NULL,
    source      TEXT            NOT NULL,   -- 's3' | 'api' | 'aggregate'
    period      TEXT            NOT NULL,   -- 'YYYYMM' for s3, 'api' for api
    status      TEXT            NOT NULL,   -- 'pending' | 'done' | 'failed' | 'skipped'
    row_count   BIGINT          NOT NULL DEFAULT 0,
    error       TEXT,
    synced_at   TIMESTAMPTZ     NOT NULL DEFAULT now(),
    PRIMARY KEY (symbol, market, interval, source, period)
);
CREATE INDEX IF NOT EXISTS sync_state_status_idx ON {{.Schema}}.sync_state (status);

-- Gap records.
CREATE TABLE IF NOT EXISTS {{.Schema}}.gaps (
    id              BIGSERIAL       PRIMARY KEY,
    symbol          TEXT            NOT NULL,
    market          TEXT            NOT NULL DEFAULT 'futures',
    interval        TEXT            NOT NULL,
    gap_from        TIMESTAMPTZ     NOT NULL,
    gap_to          TIMESTAMPTZ     NOT NULL,
    missing_bars    INTEGER         NOT NULL,
    status          TEXT            NOT NULL DEFAULT 'detected',
        -- 'detected' | 'repairing' | 'repaired' | 'unrecoverable' | 'skipped'
    retry_count     INTEGER         NOT NULL DEFAULT 0,
    error           TEXT,
    detected_at     TIMESTAMPTZ     NOT NULL DEFAULT now(),
    repaired_at     TIMESTAMPTZ,
    UNIQUE (symbol, market, interval, gap_from, gap_to)
);
CREATE INDEX IF NOT EXISTS gaps_status_idx ON {{.Schema}}.gaps (status);
CREATE INDEX IF NOT EXISTS gaps_symbol_interval_idx ON {{.Schema}}.gaps (symbol, market, interval);
