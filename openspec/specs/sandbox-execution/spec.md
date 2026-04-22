# sandbox-execution Specification

## Purpose

TBD — created by archiving change service-api. Update Purpose after archive.
## Requirements
### Requirement: 网络隔离策略

系统 SHALL 确保 sandbox-service 容器无法访问外部网络，仅能连接 TimescaleDB（只读）和 service-api 的 callback endpoint。

#### Scenario: 沙箱网络访问控制

- **WHEN** sandbox-service 被部署
- **THEN** 容器连接到专用 Docker network（`claw-sandbox-net`，`internal: true`）
- **THEN** 容器可以通过该网络连接 TimescaleDB 5432 端口（只读用户）
- **THEN** 容器可以通过该网络连接 service-api 的 `/internal/cb/*` endpoint
- **THEN** 容器无法访问任何其他网络地址（包括外网）

#### Scenario: 沙箱尝试访问外网

- **WHEN** worker 内 Python 代码尝试 `requests.get('https://example.com')`
- **THEN** 连接被拒绝或超时
- **THEN** 不影响任务执行，Python 代码自行处理异常

### Requirement: 沙箱与主服务 HTTP Callback

系统 SHALL 通过 HTTP callback 机制让 sandbox-service 内的 worker 向 service-api 报告执行进度和结果。callback base URL 由 service-api 在任务请求体中透传。

#### Scenario: 报告回测进度

- **WHEN** worker 处理完一部分 K 线数据
- **THEN** worker 调用 `POST {callback_base_url}/progress/{job_id}` 报告进度
  ```json
  {"task_id": "xxx", "phase": "backtesting", "current_bar": 5000, "total_bars": 10000}
  ```

#### Scenario: 报告回测完成

- **WHEN** 回测执行完成
- **THEN** worker 调用 `POST {callback_base_url}/complete/{job_id}` 提交结果
  ```json
  {"task_id": "xxx", "metrics": {...}, "equity_curve": [...], "trades": [...]}
  ```

#### Scenario: 报告执行错误

- **WHEN** Python 代码运行时异常
- **THEN** worker 调用 `POST {callback_base_url}/error/{job_id}` 报告错误
  ```json
  {"task_id": "xxx", "error": "ZeroDivisionError: division by zero", "traceback": "..."}
  ```

### Requirement: 数据库只读用户

系统 SHALL 创建 TimescaleDB 只读用户供 sandbox-service 使用，确保 worker 无法修改任何数据。

#### Scenario: 只读用户权限

- **WHEN** 系统初始化数据库
- **THEN** 创建 `claw_readonly` 用户
- **THEN** 授予 `claw` schema 下所有表的 SELECT 权限
- **THEN** 不授予 INSERT、UPDATE、DELETE、CREATE、DROP 权限

#### Scenario: 沙箱尝试写入数据

- **WHEN** worker 内代码尝试执行 `INSERT INTO claw.futures_5m ...`
- **THEN** 数据库返回权限错误
- **THEN** 已有数据不受影响

### Requirement: 任务分发到 sandbox-service

系统 SHALL 通过 HTTP 把执行任务从 service-api 推送给长驻的 sandbox-service 容器，由其内部 worker pool 处理。service-api SHALL NOT 直接创建、管理、终止任何 Docker 容器；SHALL NOT 挂载 `/var/run/docker.sock`。

#### Scenario: service-api 推送任务

- **WHEN** 一个回测/选币任务通过所有 Gate 后进入执行阶段
- **THEN** service-api 调用 `POST http://sandbox-service:<port>/run` 推送任务
- **THEN** sandbox-service 返回 `{ job_id, status: "queued" }`
- **THEN** service-api 把 `job_id` 关联到自己的 `task_id`，等待 callback

#### Scenario: service-api 无 Docker 客户端依赖

- **WHEN** 查看 `service-api/go.mod`
- **THEN** 不存在 `github.com/docker/docker` 或 `github.com/docker/go-connections` 依赖
- **THEN** `service-api/internal/sandbox/` 目录被删除或仅保留 sandbox-service HTTP client wrapper

#### Scenario: docker-compose 无 socket 挂载

- **WHEN** 查看 `docker-compose.yml` 中 `service-api` service 的 `volumes`
- **THEN** 无 `/var/run/docker.sock:/var/run/docker.sock` 条目

### Requirement: 任务执行超时

系统 SHALL 为每个任务在 sandbox-service 侧应用 CPU 时间上限（`RLIMIT_CPU`，默认 1800s）。超时后 worker 被内核终止，Master 替补新 worker；对应 service-api task 收到 `{ code: "SANDBOX_TIMEOUT" }` callback。

#### Scenario: 回测超时

- **WHEN** 回测运行超过 30 分钟
- **THEN** 内核发 SIGXCPU / SIGKILL
- **THEN** Master 探测到 worker exit，补发 `error` callback `{ code: "SANDBOX_TIMEOUT" }`
- **THEN** service-api 将任务标记为 `failed`

