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
