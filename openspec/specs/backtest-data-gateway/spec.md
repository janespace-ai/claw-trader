# backtest-data-gateway Specification

## Purpose

Read-only HTTP endpoints served by `backtest-engine` that expose market data (K-lines, symbols, gap info) to the desktop-client and other frontends. These endpoints replace the ones previously served by `data-aggregator` — the aggregator is now a headless worker and cannot be reached from outside. All reads are sourced directly from the shared TimescaleDB that the aggregator writes to.

## Requirements

### Requirement: K 线数据查询接口

`backtest-engine` SHALL 提供 `GET /api/klines` 接口,从共享的 TimescaleDB(`claw.futures_<interval>` 系列 hypertables)直接读取 K 线数据供 desktop-client 和前端使用。接口 SHALL NOT 向 data-aggregator 发起任何 HTTP 调用。

#### Scenario: 查询 BTC 1h K线

- **WHEN** 调用 `GET /api/klines?symbol=BTC_USDT&interval=1h&from=2025-04-01&to=2026-04-01`
- **THEN** `backtest-engine` 通过自身 pg 连接池查询 `claw.futures_1h`
- **THEN** 返回该时间范围内的数据 `[{"ts": ..., "o": ..., "h": ..., "l": ..., "c": ..., "v": ..., "qv": ...}]`,按 `ts` 升序排列
- **THEN** 响应格式与旧版 aggregator 的 `/api/klines` 1:1 兼容,desktop-client 无需修改字段解析

#### Scenario: 非法 interval

- **WHEN** 调用 `GET /api/klines?symbol=BTC_USDT&interval=13m&from=...&to=...`
- **THEN** 返回 `400 Bad Request`,错误体包含允许的 interval 列表

### Requirement: 币种列表查询接口

`backtest-engine` SHALL 提供 `GET /api/symbols` 接口,返回 `claw.symbols` 表中当前的币种与排名信息。

#### Scenario: 查询 top 300 列表

- **WHEN** 调用 `GET /api/symbols?market=futures&limit=300`
- **THEN** 返回按 `rank` 升序的数组 `[{"symbol":"BTC_USDT","rank":1,"volume_24h_quote":5128061921,"status":"active"}]`
- **THEN** 响应格式与旧版 aggregator 的 `/api/symbols` 1:1 兼容

### Requirement: Gap 查询接口

`backtest-engine` SHALL 提供 `GET /api/gaps` 接口,读取 `claw.gaps` 表,支持按 `symbol` 和 `interval` 过滤,用于前端展示数据健康度。

#### Scenario: 查询 BTC 5m 的 gap

- **WHEN** 调用 `GET /api/gaps?symbol=BTC_USDT&interval=5m`
- **THEN** 返回该 (symbol, interval) 下的 gap 列表,字段包含 `gap_from`、`gap_to`、`missing_bars`、`status`
- **THEN** 响应格式与旧版 aggregator 的 `/api/gaps` 1:1 兼容

### Requirement: 数据网关只读

`backtest-engine` 新增的 `/api/klines`、`/api/symbols`、`/api/gaps` 接口 SHALL 为只读。SHALL NOT 对 aggregator 的写入表(symbols / klines_* / gaps)执行任何 INSERT / UPDATE / DELETE / UPSERT 操作。

#### Scenario: 只读一致性

- **WHEN** 任一网关接口被调用
- **THEN** 处理路径只执行 `SELECT` 语句
- **THEN** 若将来切换到专用 readonly DB 用户,接口 SHALL 继续工作
