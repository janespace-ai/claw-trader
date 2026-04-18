# kline-aggregation Specification

## Purpose

TBD - created by archiving change data-aggregator. Update Purpose after archive.

## Requirements

### Requirement: 从 5m 聚合生成 15m K线

系统 SHALL 使用 TimescaleDB 的 `time_bucket` 函数从 `claw.futures_5m` 表聚合生成 15m K线数据，写入 `claw.futures_15m` 表。

聚合规则：每 3 根 5m bar 合成 1 根 15m bar。

#### Scenario: 聚合单个币种单月的 15m 数据

- **WHEN** BTC_USDT 的 futures_5m 表中已有 2026-03 完整数据
- **THEN** 系统执行 SQL 聚合：`time_bucket('15 minutes', ts)` + `first(open, ts)` + `max(high)` + `min(low)` + `last(close, ts)` + `sum(volume)`
- **THEN** 将结果 INSERT INTO `claw.futures_15m`，使用 `ON CONFLICT (symbol, ts) DO NOTHING` 防止重复

### Requirement: 从 5m 聚合生成 30m K线

系统 SHALL 使用相同的 `time_bucket` 机制从 `claw.futures_5m` 聚合生成 30m K线数据，写入 `claw.futures_30m` 表。

聚合规则：每 6 根 5m bar 合成 1 根 30m bar。

#### Scenario: 聚合 30m 数据

- **WHEN** BTC_USDT 的 futures_5m 表中已有 2026-03 完整数据
- **THEN** 系统执行 `time_bucket('30 minutes', ts)` 聚合
- **THEN** 将结果写入 `claw.futures_30m`

### Requirement: 聚合在 S3 下载完成后执行

系统 SHALL 在 S3 历史数据下载完成后自动触发 15m/30m 聚合。聚合仅针对新下载的数据范围执行，而非全表重新聚合。

#### Scenario: S3 下载完成后触发聚合

- **WHEN** S3 下载阶段完成，BTC_USDT 5m 数据新增了 202503 月份
- **THEN** 系统对 BTC_USDT 的 202503 时间范围执行 15m 和 30m 聚合
- **THEN** 不重新聚合已经存在的历史月份
