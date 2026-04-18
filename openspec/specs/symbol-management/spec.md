# symbol-management Specification

## Purpose

TBD - created by archiving change data-aggregator. Update Purpose after archive.

## Requirements

### Requirement: 获取合约 top 300 币种

系统 SHALL 调用 `GET /api/v4/futures/usdt/tickers` 获取所有 USDT 永续合约的 ticker 数据，按 `volume_24h_quote`（24h USDT 成交额）降序排列，取前 300 名。

#### Scenario: 刷新币种列表

- **WHEN** 触发币种列表刷新
- **THEN** 系统调用 Gate.io tickers API
- **THEN** 按 volume_24h_quote 降序排列
- **THEN** 将 top 300 写入 `claw.symbols` 表（symbol, market='futures', rank, volume_24h_quote, status='active'）

### Requirement: 币种排名变动处理

系统 SHALL 在排名变动时保留历史数据，仅停止对掉出 top 300 的币种进行增量同步。不删除已下载的历史数据。

#### Scenario: 币种掉出 top 300

- **WHEN** 刷新后 LUNA_USDT 不再在 top 300 中
- **THEN** 系统将 LUNA_USDT 在 symbols 表中的 rank 设为 NULL
- **THEN** 后续同步不再包含 LUNA_USDT
- **THEN** 已存在的 LUNA_USDT 历史K线数据保留不删除

#### Scenario: 新币种进入 top 300

- **WHEN** 刷新后 NEWCOIN_USDT 新进入 top 300（rank=250）
- **THEN** 系统在 symbols 表中插入该币种
- **THEN** 后续同步将包含 NEWCOIN_USDT 的历史数据下载

### Requirement: 每次同步前自动刷新

系统 SHALL 在每次触发完整同步（sync start）前自动刷新币种列表，确保使用最新的 top 300 排名。

#### Scenario: 同步前自动刷新

- **WHEN** 用户调用 `POST /api/sync/start` 触发完整同步
- **THEN** 系统首先刷新币种列表
- **THEN** 然后基于最新列表执行后续的 S3 下载和 API 补全
