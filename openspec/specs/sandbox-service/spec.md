# sandbox-service Specification

## Purpose
TBD - created by archiving change sandbox-service-and-ai-review. Update Purpose after archive.
## Requirements
### Requirement: 长驻 sandbox-service 容器

系统 SHALL 新增根目录服务 `sandbox-service/`（与 `backtest-engine/`、`data-aggregator/` 平级），基于 Python 3.11 + FastAPI，以 **单个长驻容器** 的形态运行，负责接收 backtest-engine 推送的执行任务。SHALL NOT 为每个任务新建容器。

#### Scenario: 服务目录结构

- **WHEN** 查看仓库根目录
- **THEN** 存在 `sandbox-service/` 目录，同级于 `backtest-engine/`、`data-aggregator/`、`desktop-client/`
- **THEN** 目录含 `Dockerfile`、`config.yaml`、`pyproject.toml`（或 `requirements.txt`）、`src/`、`tests/`
- **THEN** `src/` 含 FastAPI app、worker pool 管理、任务分发、callback 客户端模块

#### Scenario: docker-compose 单实例

- **WHEN** 查看 `docker-compose.yml`
- **THEN** 存在 `sandbox-service` service（镜像名 `claw-sandbox-service`）
- **THEN** `replicas: 1` 或 Compose 默认（单副本）
- **THEN** 不挂载 `/var/run/docker.sock`

#### Scenario: 启动时拉起 worker pool

- **WHEN** 容器启动
- **THEN** 主进程启动 FastAPI app
- **THEN** 主进程 fork 出 `pool_size`（默认 4）个 Python worker 子进程
- **THEN** 所有 worker 预先 import numpy、pandas、talib、claw.strategy、claw.screener 框架，达到 "hot ready" 状态
- **THEN** `/healthz` 在所有 worker ready 之前返回 503，ready 后返回 200

### Requirement: Prefork worker pool

系统 SHALL 在 sandbox-service 内运行 `pool_size` 个 Python worker 子进程（默认 4），每个 worker 顺序执行分配给它的任务，互相隔离内存空间。pool_size SHALL 可通过 `config.yaml` 配置。

#### Scenario: 默认 pool size

- **WHEN** 未显式配置 `pool_size`
- **THEN** 启动 4 个 worker

#### Scenario: worker 独立内存空间

- **WHEN** worker A 执行的代码设置了全局变量 `BAD = 1`
- **THEN** worker B 的后续任务看不到 `BAD` 变量（因为是独立 OS 进程）

#### Scenario: 任务分发策略

- **WHEN** backtest-engine 调用 `POST /run`
- **THEN** Master 进程把任务插入共享 job queue
- **THEN** 任一 idle worker 从 queue 取任务执行
- **THEN** 若所有 worker 均 busy，任务在 queue 中等待；`POST /run` 立即返回 `{ job_id, status: "queued" }`，不阻塞

### Requirement: Worker 回收策略

每个 worker SHALL 在执行完 `recycle_after_jobs`（默认 50）个任务后自动退出，由 Master 启动替换 worker。目的：释放 numpy/pandas 长跑碎片、重置任何状态泄漏。

#### Scenario: 默认 50 任务回收

- **WHEN** worker #1 完成第 50 个任务并 POST 完 callback
- **THEN** worker #1 发信号给 Master 说 "我要退休"
- **THEN** Master 先确认 worker #1 无 in-flight 任务，再 SIGTERM 它
- **THEN** Master fork 出 worker #1' 替补，完成 warmup 后加入 pool
- **THEN** 对外表现：`pool_size` 始终稳定为 4

#### Scenario: 异常退出也替补

- **WHEN** worker 因 OOM-killed 或 segfault 意外退出
- **THEN** Master 检测到子进程 exit
- **THEN** 标记该 worker 上正在执行的任务为 `failed`，通过 callback 上报 error
- **THEN** fork 替补 worker

### Requirement: 执行任务 API

sandbox-service SHALL 暴露 `POST /run` 接收来自 backtest-engine 的任务请求，并暴露 `GET /status/{job_id}` 查询状态。这些 endpoint 仅在 `claw-sandbox-net` 内部网络可达，不对外（即不绑定到宿主机端口）。

#### Scenario: POST /run 请求

- **WHEN** backtest-engine 调用：
  ```http
  POST /run
  Content-Type: application/json
  {
    "job_id": "<uuid>",
    "task_type": "backtest" | "screener",
    "code": "<user python code>",
    "config": { ... domain-specific ... },
    "callback_base_url": "http://backtest-engine:8081/internal/cb"
  }
  ```
- **THEN** sandbox-service 把 job 入队，返回 `{ "job_id": "<uuid>", "status": "queued" }`
- **THEN** idle worker 从队列取走，开始执行
- **THEN** 执行中通过 `POST {callback_base_url}/progress/{job_id}` 上报进度
- **THEN** 完成通过 `POST {callback_base_url}/complete/{job_id}` 或 `.../error/{job_id}`

#### Scenario: GET /status/{job_id}

- **WHEN** backtest-engine 调用 `GET /status/<job_id>`
- **THEN** 返回 `{ "job_id": "...", "status": "queued" | "running" | "done" | "failed" | "not_found", "worker_id": <int?>, "queued_at": <ts>, "started_at": <ts?>, "finished_at": <ts?> }`
- **THEN** 状态记录在 sandbox-service 内存里保留至少 1 小时，超时后再查返回 `not_found`

#### Scenario: 网络仅内部可达

- **WHEN** 从 desktop-client 或宿主机 curl `http://<host>:<port>/run`
- **THEN** 连接失败（sandbox-service 不映射端口到宿主机）
- **THEN** 仅从 `claw-sandbox-net` 同网络下的 backtest-engine 可达

### Requirement: 资源隔离（rlimit + 网络）

每个 worker 在执行用户代码前 SHALL 应用 Linux rlimit 限制，并确保代码运行时无外网访问。限制项：

- `RLIMIT_AS` (虚拟内存): 2 GB
- `RLIMIT_CPU` (CPU 时间): 1800s (30 分钟)
- `RLIMIT_NPROC` (进程数): 32
- `RLIMIT_FSIZE` (写文件大小): 0（禁止写文件）

这些限制值通过 `config.yaml` 的 `job_limits` 区块配置。

#### Scenario: 内存限制生效

- **WHEN** 用户代码 `x = numpy.zeros((10_000, 10_000, 100))` 试图申请 ~8GB
- **THEN** 进程收到 `MemoryError` 或 OOM-killed
- **THEN** worker 捕获异常，通过 callback 上报 `{ code: "SANDBOX_MEMORY", message: "..." }`
- **THEN** worker 按异常退出流程被 Master 替补

#### Scenario: CPU 时间限制

- **WHEN** 用户代码含死循环 `while True: pass`
- **THEN** 进程跑满 `RLIMIT_CPU` 后被内核 SIGXCPU（通常转 SIGKILL）
- **THEN** worker 上报 `{ code: "SANDBOX_TIMEOUT", message: "CPU time exceeded 1800s" }`

#### Scenario: 无外网

- **WHEN** 用户代码 `requests.get('https://example.com')` 或 `urllib.request.urlopen(...)`
- **THEN** 由于 `claw-sandbox-net` 是内部 Docker 网络（`internal: true`），且无 DNS 到外网，连接失败/超时
- **THEN** TimescaleDB 连接仍可用（同网络内）

#### Scenario: 无法写宿主文件系统

- **WHEN** 用户代码 `open('/etc/hosts', 'w').write(...)`
- **THEN** Gate 1 的 AST 检查会优先拦下（`open` 不在白名单）
- **THEN** 即使绕过 Gate，`RLIMIT_FSIZE: 0` 也使写操作失败

### Requirement: Callback 机制（保留现有 HTTP 契约）

sandbox-service 的 worker SHALL 通过 HTTP callback 把进度、结果、错误上报给 backtest-engine，保留 `POST /internal/cb/{progress,complete,error}` 现有契约不变。callback base URL 通过每次任务请求由 engine 透传。

#### Scenario: 进度上报

- **WHEN** worker 处理完 1000 根 K 线
- **THEN** 调用 `POST {callback_base_url}/progress/{job_id}`，body `{ "phase": "backtesting", "current_bar": 1000, "total_bars": 10000 }`

#### Scenario: 完成上报

- **WHEN** 回测执行完成
- **THEN** 调用 `POST {callback_base_url}/complete/{job_id}`，body 含 metrics + equity_curve + trades 等

#### Scenario: 错误上报

- **WHEN** 用户代码抛 `ZeroDivisionError`
- **THEN** worker 捕获 traceback
- **THEN** 调用 `POST {callback_base_url}/error/{job_id}`，body `{ error: "...", traceback: "...", code: "SANDBOX_ERROR" }`

#### Scenario: callback 重试

- **WHEN** callback HTTP 请求因网络瞬时失败
- **THEN** worker 重试 3 次，间隔 1s/3s/10s
- **THEN** 仍失败则把 callback body 写入 sandbox-service 本地落盘队列
- **THEN** 后台 flusher 每 30s 重放失败的 callback

### Requirement: 启动/关闭生命周期

sandbox-service SHALL 提供 `GET /healthz` 健康探针，在收到 SIGTERM 时优雅关闭：等待所有 in-flight worker 完成当前任务（带超时），拒绝新 `/run` 请求。

#### Scenario: healthz

- **WHEN** 初始化完成（所有 worker warm）
- **THEN** `GET /healthz` 返回 200 + `{ status: "ok", workers: { ready: 4, total: 4 } }`

#### Scenario: 优雅关闭

- **WHEN** 容器收到 SIGTERM（例如 compose down）
- **THEN** FastAPI 停止接受新 `/run`，返回 503
- **THEN** Master 给每个 worker 发信号 "跑完就退"
- **THEN** 最长等待 60s（默认 `shutdown_grace_seconds`），超时强杀
- **THEN** 未完成任务通过 callback 上报 `{ code: "SANDBOX_SHUTDOWN", message: "service restarted" }`

### Requirement: TimescaleDB 只读连接

sandbox-service 的 worker SHALL 使用 `claw_readonly` DB 用户连接 TimescaleDB，连接字符串通过 `config.yaml` 的 `db_url` 配置。SHALL NOT 使用主 `claw` 用户。

#### Scenario: 连接池

- **WHEN** worker 初始化
- **THEN** 建立到 TimescaleDB 的连接池（每 worker 1~2 连接）
- **THEN** 使用 `claw_readonly` 账号

#### Scenario: 写入被拒

- **WHEN** 用户代码试图 `INSERT INTO claw.futures_1h ...`
- **THEN** PostgreSQL 返回 permission denied
- **THEN** 用户代码见到异常，上报 error

### Requirement: 复用现有 claw 框架代码

sandbox-service SHALL 复用当前 `backtest-engine/sandbox/framework/` 下的 Python 代码（`runner.py`、`claw/strategy/`、`claw/screener/` 等），不重写业务逻辑。迁移方式为：把 framework 代码从 backtest-engine 镜像迁移到 sandbox-service 镜像，移除 backtest-engine 对这些文件的构建依赖。

#### Scenario: framework 代码位置

- **WHEN** 查看 sandbox-service 源
- **THEN** 存在 `sandbox-service/src/claw/strategy/` 与 `sandbox-service/src/claw/screener/`，内容来自旧的 `backtest-engine/sandbox/framework/`
- **THEN** backtest-engine 不再保留这些 Python 文件

#### Scenario: Strategy/Screener API 不变

- **WHEN** 用户继承 `Strategy` 或 `Screener` 基类
- **THEN** API 签名（`setup(self)` / `on_bar(self, bar)` / `filter(self, symbol, klines, metadata)`）与迁移前一致
- **THEN** 用户代码无需修改

