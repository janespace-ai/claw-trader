## MODIFIED Requirements

### Requirement: 沙箱与主服务 HTTP Callback

系统 SHALL 通过 HTTP callback 机制让 sandbox-service 内的 worker 向 backtest-engine 报告执行进度和结果。callback base URL 由 backtest-engine 在任务请求体中透传。

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

### Requirement: 网络隔离策略

系统 SHALL 确保 sandbox-service 容器无法访问外部网络，仅能连接 TimescaleDB（只读）和 backtest-engine 的 callback endpoint。

#### Scenario: 沙箱网络访问控制

- **WHEN** sandbox-service 被部署
- **THEN** 容器连接到专用 Docker network（`claw-sandbox-net`，`internal: true`）
- **THEN** 容器可以通过该网络连接 TimescaleDB 5432 端口（只读用户）
- **THEN** 容器可以通过该网络连接 backtest-engine 的 `/internal/cb/*` endpoint
- **THEN** 容器无法访问任何其他网络地址（包括外网）

#### Scenario: 沙箱尝试访问外网

- **WHEN** worker 内 Python 代码尝试 `requests.get('https://example.com')`
- **THEN** 连接被拒绝或超时
- **THEN** 不影响任务执行，Python 代码自行处理异常

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

## ADDED Requirements

### Requirement: 任务分发到 sandbox-service

系统 SHALL 通过 HTTP 把执行任务从 backtest-engine 推送给长驻的 sandbox-service 容器，由其内部 worker pool 处理。backtest-engine SHALL NOT 直接创建、管理、终止任何 Docker 容器；SHALL NOT 挂载 `/var/run/docker.sock`。

#### Scenario: backtest-engine 推送任务

- **WHEN** 一个回测/选币任务通过所有 Gate 后进入执行阶段
- **THEN** backtest-engine 调用 `POST http://sandbox-service:<port>/run` 推送任务
- **THEN** sandbox-service 返回 `{ job_id, status: "queued" }`
- **THEN** backtest-engine 把 `job_id` 关联到自己的 `task_id`，等待 callback

#### Scenario: backtest-engine 无 Docker 客户端依赖

- **WHEN** 查看 `backtest-engine/go.mod`
- **THEN** 不存在 `github.com/docker/docker` 或 `github.com/docker/go-connections` 依赖
- **THEN** `backtest-engine/internal/sandbox/` 目录被删除或仅保留 sandbox-service HTTP client wrapper

#### Scenario: docker-compose 无 socket 挂载

- **WHEN** 查看 `docker-compose.yml` 中 `backtest-engine` service 的 `volumes`
- **THEN** 无 `/var/run/docker.sock:/var/run/docker.sock` 条目

### Requirement: 任务执行超时

系统 SHALL 为每个任务在 sandbox-service 侧应用 CPU 时间上限（`RLIMIT_CPU`，默认 1800s）。超时后 worker 被内核终止，Master 替补新 worker；对应 backtest-engine task 收到 `{ code: "SANDBOX_TIMEOUT" }` callback。

#### Scenario: 回测超时

- **WHEN** 回测运行超过 30 分钟
- **THEN** 内核发 SIGXCPU / SIGKILL
- **THEN** Master 探测到 worker exit，补发 `error` callback `{ code: "SANDBOX_TIMEOUT" }`
- **THEN** backtest-engine 将任务标记为 `failed`

## REMOVED Requirements

### Requirement: Docker 沙箱容器创建

**Reason**: 架构重构，不再采用"每任务一容器"模型。所有 Python 执行改由长驻的 `sandbox-service` 容器内部 prefork worker pool 承担，以消除冷启动开销、去除 backtest-engine 对 docker.sock 的依赖、避免等价 root 权限。

**Migration**: 
- 新需求 "任务分发到 sandbox-service" 替代原有的"每任务创建容器"行为
- 原有容器超时强杀语义由新增 "任务执行超时" 需求承接
- 原有容器清理语义消失——worker 是长驻进程，不是每任务一次性实例；替代机制是 "Worker 回收策略"（见 `sandbox-service` spec）
- 用户端 API 行为不变（仍是提交 → task_id → 轮询结果），仅服务端实现变化

### Requirement: 代码合规检查（AST 静态分析）

**Reason**: AST 静态分析作为两道 Gate 中的第一道，被抽象到独立 capability `code-review` 下统一管理（与新增的 Gate 2 AI 语义审查一起形成完整审查管道）。

**Migration**:
- 现有 `backtest-engine/internal/compliance/` 包（`checker.go` + `ast_checker.py`）代码不变，但调用者从 backtest 任务流程直接调用，改为通过 `code-review` capability 提供的统一入口（Gate 1 + Gate 2 串联）
- 违反规则的错误码 `COMPLIANCE_FAILED` 保持不变，但新增了 `AI_REJECTED` 错误码表示 Gate 2 拦截
- 详细需求见新的 `code-review` capability spec
