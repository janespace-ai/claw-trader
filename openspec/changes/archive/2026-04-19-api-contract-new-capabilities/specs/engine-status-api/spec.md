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
