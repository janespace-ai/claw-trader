## Why

量化交易系统的核心价值在于回测验证策略。用户（非程序员）借助 AI 在本地生成 Python 策略代码和选币脚本，需要一个安全的远程回测引擎来执行代码、返回专业级回测指标。同时需要支持用户自定义选币逻辑，基于K线数据和币种元数据筛选目标交易品种。

## What Changes

- 新增 Go (Hertz) 回测引擎服务（端口 8081），独立于数据归集服务
- 提交回测任务 API：接收用户 Python 策略代码，后台沙箱执行，返回 task_id
- Python 沙箱执行环境：Docker 容器隔离（无网络、只读文件系统、CPU/内存限制、超时强杀）
- 代码合规检查：Python AST 静态分析 + 模块白名单 + 危险函数拦截，拒绝不安全代码
- 策略回测框架：`Strategy` 基类（`setup()` / `on_bar()`），支持多周期K线、跨币种指标、杠杆交易
- 选币脚本框架：`Screener` 基类（`filter()`），**仅允许使用 1h/4h/1d K线数据 + 币种元数据（排名、交易额、杠杆倍数等）**，禁止分钟级别数据
- 参数优化：网格搜索，可配置最大运行次数上限，串行执行
- 回测结果存储：30+ 专业指标（收益、风险、风险调整、交易分析）+ 时间序列数据（权益曲线、回撤曲线、月度收益、交易列表）
- 沙箱连接 TimescaleDB 使用只读用户加载K线数据
- Docker Compose 容器化部署

## Capabilities

### New Capabilities

- `sandbox-execution`: Python 代码沙箱执行环境，Docker 容器隔离（无网络、只读 FS、资源限制），含代码合规检查（AST 分析 + 模块白名单）
- `strategy-backtest`: 策略回测核心逻辑，Strategy 基类 API（setup/on_bar），支持多周期主辅K线、跨币种指标、杠杆做多做空、参数优化网格搜索
- `screener-execution`: 选币脚本执行，Screener 基类 API（filter），数据访问限制为 1h/4h/1d K线 + 币种元数据，输出筛选结果和评分
- `backtest-metrics`: 回测结果指标计算与存储，30+ 指标覆盖收益/风险/风险调整/交易分析四大类，含权益曲线等时间序列数据
- `backtest-api`: Hertz HTTP API，提供回测任务提交、进度查询、结果获取、选币执行等接口，含 HTTP callback 机制

### Modified Capabilities

（无，这是全新服务）

## Impact

- **新增服务**: Go Hertz HTTP 服务（端口 8081），独立部署
- **数据库**: 复用 data-aggregator 的 TimescaleDB 实例，新增 `claw.strategies`、`claw.backtest_runs`、`claw.backtest_results`、`claw.screener_runs` 等表
- **沙箱依赖**: Docker-in-Docker 或 Docker socket 挂载，用于动态创建/销毁沙箱容器
- **Python 依赖**: 预装 numpy、pandas、ta-lib（沙箱镜像内）
- **Go 依赖**: hertz, pgx/v5, docker SDK, yaml.v3
- **安全边界**: 4 层安全（AST 静态分析 → Docker 网络隔离 → Python 运行时限制 → DB 只读用户）
- **部署**: Docker Compose 编排，与 data-aggregator 共享 TimescaleDB 网络
- **存储**: 回测结果 JSON + 策略代码文本，预估 MB 级
