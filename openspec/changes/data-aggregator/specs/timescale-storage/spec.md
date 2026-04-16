## ADDED Requirements

### Requirement: 分表存储K线数据

系统 SHALL 为每个 (market, interval) 组合创建独立的 TimescaleDB hypertable。当前创建 6 张表：
- `claw.futures_5m`（chunk: 7 days）
- `claw.futures_15m`（chunk: 14 days）
- `claw.futures_30m`（chunk: 1 month）
- `claw.futures_1h`（chunk: 1 month）
- `claw.futures_4h`（chunk: 3 months）
- `claw.futures_1d`（chunk: 1 year）

每张表结构一致：ts, symbol, open, high, low, close, volume, quote_volume（nullable）。

#### Scenario: 表结构创建

- **WHEN** 系统首次启动并执行 migration
- **THEN** 创建 claw schema 及 6 张 hypertable
- **THEN** 每张表均有 UNIQUE(symbol, ts) 约束

### Requirement: 使用 COPY 协议批量写入

系统 SHALL 使用 pgx 的 `CopyFrom` 方法批量写入K线数据，而非逐条 INSERT。

#### Scenario: 批量写入一个月的 5m 数据

- **WHEN** 解析完一个 S3 CSV 文件（约 8,928 行合约 5m 月数据）
- **THEN** 系统使用 COPY 协议一次性写入
- **THEN** 写入性能 SHALL 优于逐条 INSERT 至少 10 倍

### Requirement: 唯一约束防重复

系统 SHALL 通过 UNIQUE(symbol, ts) 约束防止重复数据写入。批量写入时使用 `ON CONFLICT DO NOTHING` 策略。

#### Scenario: 重复数据被忽略

- **WHEN** 同一个 (symbol, ts) 的数据被二次写入
- **THEN** 数据库忽略重复记录，不报错

### Requirement: 压缩历史数据

系统 SHALL 对 futures_5m 表启用 TimescaleDB 自动压缩策略：segmentby=symbol, orderby=ts, 超过 2 个月的 chunk 自动压缩。

#### Scenario: 历史 chunk 自动压缩

- **WHEN** futures_5m 表中 2025-12 的 chunk 已超过 2 个月
- **THEN** TimescaleDB 自动压缩该 chunk
- **THEN** 压缩后空间占用减少约 90%

### Requirement: 同步状态追踪

系统 SHALL 在 `claw.sync_state` 表中记录每个 (symbol, market, interval, source, period) 的同步状态，支持增量同步。

#### Scenario: 记录 S3 下载完成

- **WHEN** 成功下载并写入 BTC_USDT 5m 202503 数据
- **THEN** sync_state 中记录 status='done', row_count=实际行数, synced_at=当前时间

### Requirement: 预留现货扩展

系统 SHALL 通过表名 `{market}_{interval}` 的命名规则预留现货扩展能力。Go 代码中通过 `TableName(market, interval)` 函数动态路由，未来增加 `spot_*` 表时无需修改业务逻辑。

#### Scenario: 未来添加现货表

- **WHEN** 未来需要支持现货数据
- **THEN** 只需创建 `claw.spot_5m` 等表（结构与 futures 一致）
- **THEN** 在 symbols 表中添加 market='spot' 的记录
- **THEN** Go 代码通过 `TableName("spot", "5m")` 自动路由到正确的表
