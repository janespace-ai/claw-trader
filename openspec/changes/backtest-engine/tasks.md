## 1. 项目初始化与基础设施

- [ ] 1.1 初始化 Go module，配置 go.mod（hertz, pgx/v5, docker SDK, yaml.v3）
- [ ] 1.2 创建项目目录结构（cmd/server, internal/{config,handler,router,service,sandbox,compliance,store,model}）
- [ ] 1.3 创建 Dockerfile（多阶段构建：golang:1.22-alpine → alpine:3.19）
- [ ] 1.4 创建 docker-compose.yml（backtest-engine 服务，连接 data-aggregator 的 TimescaleDB，含 Docker socket 挂载）
- [ ] 1.5 实现 config.go 和 config.yaml（数据库连接、沙箱配置、超时、最大优化次数等）

## 2. 数据库层

- [ ] 2.1 创建 SQL migration：claw.strategies 表（id, name, code_type, code, params_schema, created_at）
- [ ] 2.2 创建 SQL migration：claw.backtest_runs 表（id, strategy_id, status, mode, config, progress, result, error, started_at, finished_at）
- [ ] 2.3 创建 SQL migration：claw.screener_runs 表（id, strategy_id, status, config, result, error, started_at, finished_at）
- [ ] 2.4 创建 SQL migration：claw_readonly 只读用户（GRANT SELECT ON ALL TABLES IN SCHEMA claw）
- [ ] 2.5 实现 store/store.go：数据库连接池初始化、migration 执行
- [ ] 2.6 实现 store/store.go：strategies CRUD（创建、查询列表、按 ID 查询）
- [ ] 2.7 实现 store/store.go：backtest_runs CRUD（创建、更新状态/进度/结果、按 ID 查询、按 strategy_id 查询历史）
- [ ] 2.8 实现 store/store.go：screener_runs CRUD（创建、更新状态/结果、按 ID 查询）

## 3. 数据模型

- [ ] 3.1 实现 model/strategy.go：Strategy struct（ID, Name, CodeType, Code, ParamsSchema）
- [ ] 3.2 实现 model/backtest.go：BacktestRun struct、BacktestConfig struct、BacktestProgress struct
- [ ] 3.3 实现 model/backtest.go：BacktestResult struct（Metrics, EquityCurve, DrawdownCurve, MonthlyReturns, Trades, OptimizationResults）
- [ ] 3.4 实现 model/screener.go：ScreenerRun struct、ScreenerConfig struct、ScreenerResult struct
- [ ] 3.5 实现 model/metrics.go：MetricsSet struct（All/Long/Short 三维度），含全部 30+ 指标字段
- [ ] 3.6 实现 model/trade.go：Trade struct（Symbol, Side, EntryTime, ExitTime, EntryPrice, ExitPrice, Size, Leverage, PnL, ReturnPct, Commission, Duration）

## 4. 代码合规检查

- [ ] 4.1 实现 compliance/checker.go：Go 调用 Python AST 分析的接口（exec python -c "..." 或内嵌 Python 脚本）
- [ ] 4.2 实现 compliance/ast_checker.py：Python AST 遍历器，检测禁止的 import（os, sys, subprocess, socket, shutil 等）
- [ ] 4.3 实现 compliance/ast_checker.py：检测禁止的函数调用（exec, eval, compile, __import__, open）
- [ ] 4.4 实现 compliance/ast_checker.py：模块白名单验证（numpy, pandas, talib, math, datetime, collections, typing, dataclasses, decimal, json, claw.*）
- [ ] 4.5 实现 compliance/checker.go：合规检查结果解析，返回结构化错误信息

## 5. Docker 沙箱管理

- [ ] 5.1 创建 sandbox/Dockerfile：Python 3.11 沙箱镜像（含 numpy, pandas, ta-lib, psycopg2）
- [ ] 5.2 创建 sandbox/requirements.txt：Python 依赖列表
- [ ] 5.3 实现 sandbox/sandbox.go：Docker 客户端初始化（连接 Docker socket）
- [ ] 5.4 实现 sandbox/sandbox.go：创建容器方法（配置 read-only, memory, cpus, pids-limit, 网络, tmpfs 挂载）
- [ ] 5.5 实现 sandbox/sandbox.go：启动容器并传入用户代码（写入 tmpfs /workspace）
- [ ] 5.6 实现 sandbox/sandbox.go：容器超时监控（goroutine 定时检查，超时强杀）
- [ ] 5.7 实现 sandbox/sandbox.go：容器清理方法（停止并删除容器）
- [ ] 5.8 实现 sandbox/network.go：创建和管理 claw-sandbox-net Docker 网络

## 6. Python 回测框架（沙箱内）

- [ ] 6.1 实现 sandbox/framework/strategy.py：Strategy 基类（setup, on_bar, buy, sell, close, indicator, add_data, data 方法）
- [ ] 6.2 实现 sandbox/framework/strategy.py：持仓管理（Position 类，杠杆做多/做空，保证金计算）
- [ ] 6.3 实现 sandbox/framework/strategy.py：内置指标注册（SMA, EMA, RSI, MACD, BB, ATR, Stochastic, ADX, CCI, Williams%R）
- [ ] 6.4 实现 sandbox/framework/engine.py：回测引擎核心（加载K线数据、逐 bar 驱动、订单撮合、手续费/滑点模拟）
- [ ] 6.5 实现 sandbox/framework/engine.py：多周期数据对齐（辅助K线按主K线时刻取最近已闭合 bar）
- [ ] 6.6 实现 sandbox/framework/engine.py：跨币种数据加载（按 add_data 声明加载额外币种数据）
- [ ] 6.7 实现 sandbox/framework/engine.py：参数优化驱动（解析 params、生成组合、串行执行、超限采样）
- [ ] 6.8 实现 sandbox/framework/metrics.py：收益类指标计算（total_return, annualized_return, max_drawdown, max_drawdown_duration, profit_factor, expectancy, equity_final, equity_peak）
- [ ] 6.9 实现 sandbox/framework/metrics.py：风险类指标计算（volatility_ann, downside_deviation, var_95, cvar_95, max_consecutive_wins/losses）
- [ ] 6.10 实现 sandbox/framework/metrics.py：风险调整类指标计算（sharpe, sortino, calmar, omega, win_rate, risk_reward_ratio, recovery_factor）
- [ ] 6.11 实现 sandbox/framework/metrics.py：交易分析类指标计算（total_trades, avg_trade_return, avg_win/loss, avg/max_duration, long/short_trades, best/worst_trade）
- [ ] 6.12 实现 sandbox/framework/metrics.py：ALL/LONG/SHORT 三维度分别计算
- [ ] 6.13 实现 sandbox/framework/metrics.py：时间序列数据生成（equity_curve, drawdown_curve, monthly_returns, trade_list）

## 7. Python 选币框架（沙箱内）

- [ ] 7.1 实现 sandbox/framework/screener.py：Screener 基类（filter 方法签名，klines 参数限制为 1h/4h/1d）
- [ ] 7.2 实现 sandbox/framework/screener.py：数据加载器（仅从 futures_1h/4h/1d 表查询，拒绝分钟级表访问）
- [ ] 7.3 实现 sandbox/framework/screener.py：元数据加载器（从 symbols 表查询 rank, volume_24h_quote, leverage_max, status）
- [ ] 7.4 实现 sandbox/framework/screener.py：逐币种执行 filter（异常捕获，单个失败不阻塞）
- [ ] 7.5 实现 sandbox/framework/screener.py：结果汇总（passed/failed/score，按 score 降序排列）

## 8. Python 入口脚本（沙箱内）

- [ ] 8.1 实现 sandbox/framework/runner.py：解析运行模式（backtest / screener / optimization）
- [ ] 8.2 实现 sandbox/framework/runner.py：加载用户代码（动态 import 用户 Strategy/Screener 子类）
- [ ] 8.3 实现 sandbox/framework/runner.py：DB 连接初始化（使用 claw_readonly 用户连接 TimescaleDB）
- [ ] 8.4 实现 sandbox/framework/runner.py：HTTP callback 封装（progress/complete/error 回调）
- [ ] 8.5 实现 sandbox/framework/runner.py：全局异常捕获，确保错误通过 callback 上报

## 9. Go 业务服务层

- [ ] 9.1 实现 service/backtest_service.go：回测任务编排（合规检查 → 创建记录 → 启动沙箱 → 等待结果）
- [ ] 9.2 实现 service/backtest_service.go：任务状态管理（pending → running → done/failed）
- [ ] 9.3 实现 service/backtest_service.go：单任务并发限制（检查是否有 running 任务）
- [ ] 9.4 实现 service/screener_service.go：选币任务编排（合规检查 → 创建记录 → 启动沙箱 → 等待结果）
- [ ] 9.5 实现 service/callback_service.go：处理沙箱 callback（progress 更新、complete 结果存储、error 处理）

## 10. HTTP API 层 (Hertz Handlers)

- [ ] 10.1 实现 router/router.go：注册所有路由（public API + internal callback）
- [ ] 10.2 实现 handler/backtest.go：POST /api/backtest/start（提交回测任务）
- [ ] 10.3 实现 handler/backtest.go：GET /api/backtest/status/:task_id（查询进度）
- [ ] 10.4 实现 handler/backtest.go：GET /api/backtest/result/:task_id（获取结果）
- [ ] 10.5 实现 handler/backtest.go：GET /api/backtest/history（查询历史回测列表）
- [ ] 10.6 实现 handler/screener.go：POST /api/screener/start（提交选币任务）
- [ ] 10.7 实现 handler/screener.go：GET /api/screener/result/:task_id（获取选币结果）
- [ ] 10.8 实现 handler/strategy.go：POST /api/strategies（保存策略）、GET /api/strategies（查询列表）
- [ ] 10.9 实现 handler/callback.go：POST /internal/cb/progress、/complete、/error（沙箱回调处理）

## 11. 启动入口与集成

- [ ] 11.1 实现 cmd/server/main.go：初始化 config → DB 连接 → migration → Docker 客户端 → Hertz server 启动
- [ ] 11.2 构建沙箱镜像：`docker build -t claw-sandbox:latest sandbox/`
- [ ] 11.3 验证 docker-compose up 能正常启动服务并连接 TimescaleDB
- [ ] 11.4 端到端测试：提交策略代码 → 合规检查通过 → 沙箱执行 → callback 回报 → 结果存储 → API 获取结果
- [ ] 11.5 端到端测试：提交选币脚本 → 验证仅能访问 1h/4h/1d 数据 → 返回筛选结果
- [ ] 11.6 端到端测试：参数优化 → 多组参数串行回测 → 按 Sharpe 排序结果
