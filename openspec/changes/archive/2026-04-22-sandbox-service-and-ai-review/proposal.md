## Why

当前 `backtest-engine` 对每个回测/选币任务都 **即时创建一个新的 Docker 容器** 执行用户 Python 代码，带来三个系统性问题：

1. **资源开销大**：冷启动一个带 numpy+pandas+ta-lib 的 Python 容器 ≈ 800ms–2s；并发多任务时主机负载尖刺。
2. **架构耦合**：`backtest-engine` 必须挂载 `/var/run/docker.sock` 才能调 Docker API——任意 engine 容器逃逸即等同 root，且生产部署时经常报 `permission denied while trying to connect to the Docker daemon socket`（用户已遇到）。
3. **安全依赖单一 Gate**：现在仅靠 AST 静态白名单（`compliance.Checker`）拦截危险代码，无法识别**语义层面的恶意模式**（如拼接字符串逃逸白名单、构造死循环、模拟交易风控失控），漏过即直接送入容器执行。

同时，AI 生成的用户代码数量在快速增长（chat → screener/strategy 自动流水线已落地），单一静态 Gate 的检出率天花板很明显。引入 DeepSeek 作为语义审查 Gate 能显著抬高拦截率，并为后续审计留痕。

## What Changes

- **BREAKING**：`backtest-engine` 不再直接创建 Docker 容器，也不再挂载 `/var/run/docker.sock`；所有 Python 执行改由新服务 `sandbox-service` 承担
- 新增根目录服务 `sandbox-service/`（Python 3.11 + FastAPI + prefork worker pool，与 `backtest-engine/` 和 `data-aggregator/` 平级）
- `sandbox-service` 内置 **prefork 4 worker** 长驻执行，每个 worker 每 50 个任务自动回收（防止 numpy/pandas 内存碎片）
- 新增 **Gate 2：AI 代码审查**（DeepSeek `deepseek-reasoner`，JSON mode，超时 30s），Gate 1（AST）+ Gate 2（AI）**双通过**才送执行
- Gate 2 **fail-closed**：DeepSeek 不可用（网络/超时/5xx）= reject；严格模式，reject 永不可覆盖
- Gate 2 **verdict 二元**：`approve` | `reject`，不存在中间 `needs_review` 状态
- Gate 2 **双维度审查**：`security`（恶意代码、资源滥用、信息泄露）+ `correctness`（明显逻辑错误、会导致破坏性结果的代码）
- 新增 AI 审查结果缓存：key = `sha256(normalize(code))`，TTL 30 天，存 `claw.ai_review_cache` 表，避免同代码重复调用
- DeepSeek API key 由 backend **集中配置**（`backtest-engine/config.yaml` 的 `ai_review.api_key`），不暴露给桌面客户端
- `backtest-engine` 通过 HTTP 把任务推给 `sandbox-service`（`POST /run`），progress/complete/error callback 机制保留不变
- 桌面客户端的 `FriendlyError` 规则表增加 "AI 审查拒绝" 类型，向用户透出 Gate 2 的拒绝原因

## Capabilities

### New Capabilities

- `code-review`: 多阶段用户代码审查管道。定义 Gate 1（AST 静态分析，沿用现有能力）+ Gate 2（DeepSeek 语义审查，新增）的接入契约、verdict 结构、缓存策略、fail-closed 语义。
- `sandbox-service`: 长驻 Python 执行服务。prefork worker pool、任务分发、worker 回收、与 backtest-engine 的 HTTP 契约、资源隔离（rlimit + cgroup）。

### Modified Capabilities

- `sandbox-execution`: 从"每任务一 Docker 容器"改为"长驻 sandbox-service 容器 + 内部 worker"。删除 "Docker 沙箱容器创建" 需求，替换为 "sandbox-service 任务分发" 需求；保留 "网络隔离"、"数据库只读用户"、"HTTP Callback" 需求；删除 "代码合规检查（AST 静态分析）"需求（移入 `code-review`）。
- `backtest-api`: 提交流程从 `Gate1 AST → Docker Launch → exec` 改为 `Gate1 AST → Gate2 AI → sandbox-service POST /run`。新增 `403 AI_REJECTED` 错误码。
- `screener-execution`: 同 `backtest-api`，提交流程改为三 Gate。

## Impact

- **新服务**：`sandbox-service/`（Python + FastAPI + uvicorn prefork），根目录平级，独立 Dockerfile，独立 compose service
- **删除依赖**：`backtest-engine` 的 Docker SDK 依赖可移除（`github.com/docker/docker` Go module）；`docker-compose.yml` 删除 `/var/run/docker.sock` 挂载
- **新增依赖**：
  - backtest-engine：DeepSeek HTTP 客户端（标准 `net/http` 即可，无需第三方 SDK），新增 `internal/aireview/` 包
  - sandbox-service：`fastapi`、`uvicorn[standard]`、`numpy`、`pandas`、`ta-lib`、现有 `claw.strategy` / `claw.screener` 框架代码（从 `backtest-engine/sandbox/framework/` 迁入）
- **数据库**：新增 `claw.ai_review_cache` 表（`code_hash` PK、`verdict`、`reason`、`model`、`created_at`、`expires_at`）
- **配置**：
  - `backtest-engine/config.yaml`：新增 `ai_review: { enabled, api_key, model, timeout_seconds, cache_ttl_days }`
  - `sandbox-service/config.yaml`：`pool_size: 4`、`recycle_after_jobs: 50`、`db_url`、`callback_base_url`、资源限制
- **API**：
  - 新增内部：`sandbox-service` 暴露 `POST /run`、`GET /status/{job_id}`、`GET /healthz`（仅 engine 可达）
  - 公开 API（`/api/backtest/start`、`/api/screener/start`）响应增加 `AI_REJECTED` 错误码
- **客户端**：`desktop-client/src/services/errors/friendly.ts` 的 `RULES` 增加 AI 拒绝规则；i18n 增加 `errors.friendly.ai_rejected.*` 键
- **测试**：
  - sandbox-service：worker 回收、rlimit、callback 的单元测试 + e2e
  - backtest-engine：aireview 的 mock 测试（DeepSeek 不可用 → reject、超时 → reject、approve → pass）
  - 缓存命中/失效测试
- **部署**：`docker-compose.yml` 需同步更新；`sandbox-service` 需与 backtest-engine 共网络（`claw-sandbox-net`），连接 TimescaleDB 只读用户
- **运维**：`backtest-engine` 容器不再需要特权（之前因 docker.sock 实际上有等价 root 权限）
- **成本**：DeepSeek 调用按命中率估算——若缓存命中 60%，典型用户每日调用 ~20 次，月度成本 ~$1（`deepseek-reasoner` 当前定价）
