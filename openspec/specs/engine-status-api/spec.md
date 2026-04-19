# Capability: engine-status-api

Synced on 2026-04-19 from archived delta specs in `openspec/changes/archive/`.

### From change: `api-contract-new-capabilities`

## ADDED Requirements

### Requirement: Engine 状态查询端点

系统 SHALL 提供 `GET /api/engine/status` 接口,返回后端自我描述的 metadata,供 Settings 页的 "Remote Engine" 卡片渲染。响应 shape 为 `EngineStatus`:

- `version: string` — backtest-engine 版本(例如 `"0.1.0"`)
- `data_aggregator_version: string | null` — aggregator 版本,若已知
- `supported_markets: string[]` — 例如 `["futures"]`
- `supported_intervals: string[]` — 例如 `["5m","15m","30m","1h","4h","1d"]`
- `data_range: { from: integer, to: integer }` — 数据覆盖的 Unix 秒时间窗口(所有 market/interval 中的最早和最晚)
- `last_aggregator_sync_at: integer | null` — 最近一次 aggregator 同步完成的 Unix 秒
- `active_tasks: integer` — 当前 in-flight 的 backtest / screener / analysis 任务数
- `uptime_seconds: integer` — 本次进程启动以来秒数

#### Scenario: 正常获取状态

- **WHEN** `GET /api/engine/status`
- **THEN** 返回 200 + `EngineStatus` object,所有必填字段都在
- **THEN** 响应典型小于 1KB,无需分页

#### Scenario: aggregator 版本未知

- **WHEN** 后端无法获取 data-aggregator 的版本(例如初次启动后 aggregator 还未完成第一次同步)
- **THEN** `data_aggregator_version: null`,`last_aggregator_sync_at: null`
- **THEN** 前端渲染 "Aggregator: unknown" 状态

#### Scenario: 端点不需要认证

- **WHEN** 调用 `GET /api/engine/status`(无任何特殊 header)
- **THEN** 即可获取响应(项目当前单机部署,无 auth 层)
- **THEN** 契约**未来**可能增加 auth header,但本 change 不要求

### Requirement: Engine 状态用于 Remote Engine 卡片

`EngineStatus` 响应 SHALL 足以渲染 Pencil 设计稿 Settings 页面中 "Remote Backtest Engine" 卡片的以下可视字段:
- 版本号(v0.1.0)
- Symbols 数量(来自 `/api/symbols?limit=1` 辅助 + `data_range`)
- 数据覆盖 Range(格式化 `data_range.from` 到 `data_range.to`)
- 状态徽章 Connected(由 UI 自行判断:fetch 成功即 connected)

#### Scenario: 渲染 Remote Engine 卡片

- **WHEN** Settings 页面挂载
- **THEN** renderer 调用 `cremote.getEngineStatus()`,渲染版本 / supported intervals 串 / data range 人类可读格式
- **THEN** 同时发起一次 `cremote.listSymbols({ limit: 1 })` 以展示 symbol 总数(`next_cursor` 非空或加 count 字段 TBD)

---

### From change: `backtest-engine-engine-status`

## ADDED Requirements

### Requirement: Engine 状态端点实现

系统 SHALL 实现 `GET /api/engine/status` 端点,返回 canonical `EngineStatus` 对象。字段数据源按 design.md D1 表格落地。

#### Scenario: 正常返回

- **WHEN** `GET /api/engine/status`
- **THEN** 200 + EngineStatus object
- **THEN** 响应 body 匹配 `api/openapi.yaml` 中 `EngineStatus` schema
- **THEN** 响应时间 < 500ms(典型情况)

#### Scenario: Aggregator 不可达时 version 为 null

- **WHEN** backtest-engine 调用 aggregator `/healthz` 超时 500ms
- **THEN** `data_aggregator_version: null`,`last_aggregator_sync_at` 仍从 DB 读取(独立 query)
- **THEN** 响应整体仍 200,不因 aggregator 不可达而失败

#### Scenario: 数据表为空时 data_range 为 null

- **WHEN** `claw.futures_1h` 无任何行(fresh 安装)
- **THEN** `data_range: null`(或 `{ from: null, to: null }`,具体由契约决定)
- **THEN** 响应 200 不报错

#### Scenario: active_tasks 反映实时任务数

- **WHEN** 有 3 个 backtest task 正在跑,1 个 screener,0 个 analysis
- **THEN** `active_tasks: 4`

### Requirement: 版本号注入

`backtest-engine` 二进制 SHALL 在编译时注入 `version.Version` 字符串(例如 `"0.1.0"` 或 `"git-<sha>"`)。Dockerfile 和 Makefile SHALL 使用 `-ldflags "-X .../version.Version=$(git describe --always)"`。

开发模式下(未注入)默认为 `"dev"`。

#### Scenario: 生产构建携带版本

- **WHEN** `docker build`,Dockerfile 注入 `VERSION=0.1.0`
- **THEN** 二进制启动后 `version.Version == "0.1.0"`
- **THEN** `/api/engine/status` 返回 `"version": "0.1.0"`

#### Scenario: 开发构建 fallback

- **WHEN** 本地 `go run` 未注入
- **THEN** `version.Version == "dev"`
- **THEN** `/api/engine/status` 返回 `"version": "dev"`

---

