# api-data-fill Specification

## Purpose

TBD - created by archiving change data-aggregator. Update Purpose after archive.

## Requirements

### Requirement: API 补全最新数据

系统 SHALL 通过 Gate.io API v4 (`GET /api/v4/futures/usdt/candlesticks`) 补全 S3 覆盖不到的最新数据。对每个 (symbol, interval) 组合，从数据库中最新的时间戳开始，拉取至当前时间。

支持的周期：5m, 15m, 30m, 1h, 4h, 1d。

#### Scenario: 补全 BTC_USDT 当月 1h 数据

- **WHEN** 数据库中 BTC_USDT futures_1h 最新记录为 2026-03-31T23:00:00Z
- **THEN** 系统通过 API 拉取 2026-04-01 至今的 1h K线
- **THEN** 写入 `claw.futures_1h` 表

#### Scenario: 补全 15m 数据直接走 API

- **WHEN** 需要补全 15m 数据
- **THEN** 系统直接调用 API `interval=15m` 获取（不从 5m 聚合）
- **THEN** 因为 15m/30m S3 无数据，当月补全直接用 API 原生周期

### Requirement: API 分页拉取

系统 SHALL 使用 `limit=2000` 参数分页拉取 API 数据。每次请求返回最新的 2000 条，以返回的最早时间戳作为下次请求的终止时间，循环直到覆盖目标时间范围。

#### Scenario: 分页拉取超过 2000 条的数据

- **WHEN** 需要补全 30 天的 5m 数据（约 8,640 条）
- **THEN** 系统发起至少 5 次 API 请求（每次 2000 条）
- **THEN** 每次以上一次返回的最早 timestamp 为边界继续向前拉取
- **THEN** 直到覆盖数据库中最新记录的时间戳

### Requirement: API Rate Limiting

系统 SHALL 将 API 请求速率控制在 180 req/s 以内（Gate.io 限制为 200 req/s，留 10% 余量），使用令牌桶算法。

#### Scenario: 并发请求不超过速率限制

- **WHEN** 300 个币种同时需要 API 补全
- **THEN** 系统通过 `golang.org/x/time/rate` 限制全局请求速率为 180 req/s
- **THEN** 不触发 Gate.io 的 rate limit 429 响应

### Requirement: API 响应解析

系统 SHALL 正确解析 Gate.io API 的 JSON 响应格式，将字符串类型的价格和数量字段转换为浮点数。

API 响应字段映射：`t` → ts, `o` → open, `h` → high, `l` → low, `c` → close, `v` → volume(张数), `sum` → quote_volume(USDT)

#### Scenario: 解析 API 响应

- **WHEN** API 返回 `{"t":1776348000,"o":"73748.4","h":"73935.1","l":"73550.8","c":"73795.1","v":26352304,"sum":"194357562"}`
- **THEN** 写入数据库：ts=1776348000, open=73748.4, high=73935.1, low=73550.8, close=73795.1, volume=26352304, quote_volume=194357562
