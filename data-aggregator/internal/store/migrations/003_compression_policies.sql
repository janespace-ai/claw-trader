-- Migration 003: TimescaleDB compression policies.
-- Compression requires TimescaleDB >= 2.x. Keep segmentby/orderby consistent per table.

-- futures_5m: segment by symbol, order by ts, compress chunks older than 2 months.
ALTER TABLE claw.futures_5m SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'symbol',
    timescaledb.compress_orderby   = 'ts DESC'
);
SELECT add_compression_policy('claw.futures_5m', INTERVAL '2 months',
    if_not_exists => TRUE);

-- futures_15m
ALTER TABLE claw.futures_15m SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'symbol',
    timescaledb.compress_orderby   = 'ts DESC'
);
SELECT add_compression_policy('claw.futures_15m', INTERVAL '3 months',
    if_not_exists => TRUE);

-- futures_30m
ALTER TABLE claw.futures_30m SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'symbol',
    timescaledb.compress_orderby   = 'ts DESC'
);
SELECT add_compression_policy('claw.futures_30m', INTERVAL '4 months',
    if_not_exists => TRUE);

-- futures_1h: compress chunks older than 6 months.
ALTER TABLE claw.futures_1h SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'symbol',
    timescaledb.compress_orderby   = 'ts DESC'
);
SELECT add_compression_policy('claw.futures_1h', INTERVAL '6 months',
    if_not_exists => TRUE);

-- futures_4h: compress chunks older than 1 year.
ALTER TABLE claw.futures_4h SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'symbol',
    timescaledb.compress_orderby   = 'ts DESC'
);
SELECT add_compression_policy('claw.futures_4h', INTERVAL '1 year',
    if_not_exists => TRUE);

-- futures_1d: compress chunks older than 2 years.
ALTER TABLE claw.futures_1d SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'symbol',
    timescaledb.compress_orderby   = 'ts DESC'
);
SELECT add_compression_policy('claw.futures_1d', INTERVAL '2 years',
    if_not_exists => TRUE);
