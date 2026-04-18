-- Migration 001: schema + 6 futures hypertables + unique indexes
CREATE SCHEMA IF NOT EXISTS claw;

-- Ensure TimescaleDB is present (no-op if already enabled)
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Reusable column layout for every candlestick table
-- Columns: ts, symbol, open, high, low, close, volume, quote_volume (nullable)

-- futures_5m
CREATE TABLE IF NOT EXISTS claw.futures_5m (
    ts              TIMESTAMPTZ         NOT NULL,
    symbol          TEXT                NOT NULL,
    open            DOUBLE PRECISION    NOT NULL,
    high            DOUBLE PRECISION    NOT NULL,
    low             DOUBLE PRECISION    NOT NULL,
    close           DOUBLE PRECISION    NOT NULL,
    volume          DOUBLE PRECISION    NOT NULL,
    quote_volume    DOUBLE PRECISION
);
SELECT create_hypertable('claw.futures_5m', 'ts',
    chunk_time_interval => INTERVAL '7 days', if_not_exists => TRUE);
CREATE UNIQUE INDEX IF NOT EXISTS futures_5m_symbol_ts_uniq
    ON claw.futures_5m (symbol, ts);

-- futures_15m
CREATE TABLE IF NOT EXISTS claw.futures_15m (
    ts              TIMESTAMPTZ         NOT NULL,
    symbol          TEXT                NOT NULL,
    open            DOUBLE PRECISION    NOT NULL,
    high            DOUBLE PRECISION    NOT NULL,
    low             DOUBLE PRECISION    NOT NULL,
    close           DOUBLE PRECISION    NOT NULL,
    volume          DOUBLE PRECISION    NOT NULL,
    quote_volume    DOUBLE PRECISION
);
SELECT create_hypertable('claw.futures_15m', 'ts',
    chunk_time_interval => INTERVAL '14 days', if_not_exists => TRUE);
CREATE UNIQUE INDEX IF NOT EXISTS futures_15m_symbol_ts_uniq
    ON claw.futures_15m (symbol, ts);

-- futures_30m
CREATE TABLE IF NOT EXISTS claw.futures_30m (
    ts              TIMESTAMPTZ         NOT NULL,
    symbol          TEXT                NOT NULL,
    open            DOUBLE PRECISION    NOT NULL,
    high            DOUBLE PRECISION    NOT NULL,
    low             DOUBLE PRECISION    NOT NULL,
    close           DOUBLE PRECISION    NOT NULL,
    volume          DOUBLE PRECISION    NOT NULL,
    quote_volume    DOUBLE PRECISION
);
SELECT create_hypertable('claw.futures_30m', 'ts',
    chunk_time_interval => INTERVAL '1 month', if_not_exists => TRUE);
CREATE UNIQUE INDEX IF NOT EXISTS futures_30m_symbol_ts_uniq
    ON claw.futures_30m (symbol, ts);

-- futures_1h
CREATE TABLE IF NOT EXISTS claw.futures_1h (
    ts              TIMESTAMPTZ         NOT NULL,
    symbol          TEXT                NOT NULL,
    open            DOUBLE PRECISION    NOT NULL,
    high            DOUBLE PRECISION    NOT NULL,
    low             DOUBLE PRECISION    NOT NULL,
    close           DOUBLE PRECISION    NOT NULL,
    volume          DOUBLE PRECISION    NOT NULL,
    quote_volume    DOUBLE PRECISION
);
SELECT create_hypertable('claw.futures_1h', 'ts',
    chunk_time_interval => INTERVAL '1 month', if_not_exists => TRUE);
CREATE UNIQUE INDEX IF NOT EXISTS futures_1h_symbol_ts_uniq
    ON claw.futures_1h (symbol, ts);

-- futures_4h
CREATE TABLE IF NOT EXISTS claw.futures_4h (
    ts              TIMESTAMPTZ         NOT NULL,
    symbol          TEXT                NOT NULL,
    open            DOUBLE PRECISION    NOT NULL,
    high            DOUBLE PRECISION    NOT NULL,
    low             DOUBLE PRECISION    NOT NULL,
    close           DOUBLE PRECISION    NOT NULL,
    volume          DOUBLE PRECISION    NOT NULL,
    quote_volume    DOUBLE PRECISION
);
SELECT create_hypertable('claw.futures_4h', 'ts',
    chunk_time_interval => INTERVAL '3 months', if_not_exists => TRUE);
CREATE UNIQUE INDEX IF NOT EXISTS futures_4h_symbol_ts_uniq
    ON claw.futures_4h (symbol, ts);

-- futures_1d
CREATE TABLE IF NOT EXISTS claw.futures_1d (
    ts              TIMESTAMPTZ         NOT NULL,
    symbol          TEXT                NOT NULL,
    open            DOUBLE PRECISION    NOT NULL,
    high            DOUBLE PRECISION    NOT NULL,
    low             DOUBLE PRECISION    NOT NULL,
    close           DOUBLE PRECISION    NOT NULL,
    volume          DOUBLE PRECISION    NOT NULL,
    quote_volume    DOUBLE PRECISION
);
SELECT create_hypertable('claw.futures_1d', 'ts',
    chunk_time_interval => INTERVAL '1 year', if_not_exists => TRUE);
CREATE UNIQUE INDEX IF NOT EXISTS futures_1d_symbol_ts_uniq
    ON claw.futures_1d (symbol, ts);
