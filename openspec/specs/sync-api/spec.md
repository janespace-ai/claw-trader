# sync-api Specification

## Purpose

TBD - created by archiving change data-aggregator. Update Purpose after archive.

## Requirements

### Requirement: 同步触发 API

系统 SHALL 提供 `POST /api/sync/start` 接口触发数据同步任务。支持以下同步模式：
- `full`: 完整同步（S3 历史 → 聚合 → API 补全 → gap 修复）
- `s3`: 仅 S3 历史数据下载
- `api`: 仅 API 补全最新数据
- `repair`: 仅 gap 修复

同步任务在后台 goroutine 执行，接口立即返回 task_id。

#### Scenario: 触发完整同步

- **WHEN** 调用 `POST /api/sync/start` body: `{"mode": "full"}`
- **THEN** 返回 `{"task_id": "xxx", "status": "running"}`
- **THEN** 后台开始执行：刷新币种 → S3 下载 → 聚合 15m/30m → API 补全 → gap 检测修复

#### Scenario: 触发仅 API 补全

- **WHEN** 调用 `POST /api/sync/start` body: `{"mode": "api"}`
- **THEN** 后台仅执行 API 补全步骤，跳过 S3 下载和聚合

### Requirement: 同步进度查询 API

系统 SHALL 提供 `GET /api/sync/status` 接口查询当前或最近一次同步任务的进度。

#### Scenario: 查询正在运行的同步进度

- **WHEN** 调用 `GET /api/sync/status`
- **THEN** 返回当前任务进度，包含各阶段完成情况：
  ```json
  {
    "task_id": "xxx",
    "status": "running",
    "phase": "s3_download",
    "s3_progress": {"done": 8000, "total": 14400, "failed": 12},
    "api_progress": {"done": 0, "total": 2400},
    "started_at": "2026-04-16T10:00:00Z"
  }
  ```

#### Scenario: 无运行中任务

- **WHEN** 调用 `GET /api/sync/status` 且无运行中任务
- **THEN** 返回最近一次完成的任务摘要（status: "done" 或 "failed"）

### Requirement: 币种列表查询 API

系统 SHALL 提供 `GET /api/symbols` 接口查询当前的币种列表。

#### Scenario: 查询 top 300 列表

- **WHEN** 调用 `GET /api/symbols?market=futures&limit=300`
- **THEN** 返回按 rank 排序的币种列表 `[{"symbol": "BTC_USDT", "rank": 1, "volume_24h_quote": 5128061921, "status": "active"}]`

### Requirement: Gap 查询 API

系统 SHALL 提供 `GET /api/gaps` 接口查询数据缺口信息。支持按 symbol 和 interval 过滤。

#### Scenario: 查询特定币种的 gap

- **WHEN** 调用 `GET /api/gaps?symbol=BTC_USDT&interval=5m`
- **THEN** 返回该币种 5m 数据的完整性信息和 gap 列表

### Requirement: Gap 修复触发 API

系统 SHALL 提供 `POST /api/gaps/repair` 接口手动触发 gap 修复。支持指定 symbol 和 interval，或全量修复。

#### Scenario: 修复特定币种的 gap

- **WHEN** 调用 `POST /api/gaps/repair` body: `{"symbol": "BTC_USDT", "interval": "5m"}`
- **THEN** 后台仅修复 BTC_USDT 5m 的已检测 gap

#### Scenario: 修复所有 gap

- **WHEN** 调用 `POST /api/gaps/repair` body: `{}`
- **THEN** 后台修复所有状态为 'detected' 的 gap

### Requirement: K线数据查询 API

系统 SHALL 提供 `GET /api/klines` 接口查询K线数据，供前端展示和回测引擎使用。

#### Scenario: 查询 BTC 1h K线

- **WHEN** 调用 `GET /api/klines?symbol=BTC_USDT&interval=1h&from=2025-04-01&to=2026-04-01`
- **THEN** 返回该时间范围内的 1h K线数据数组 `[{"ts": ..., "o": ..., "h": ..., "l": ..., "c": ..., "v": ..., "qv": ...}]`
- **THEN** 数据按 ts 升序排列
