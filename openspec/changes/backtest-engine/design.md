## Context

claw-trader 已有 data-aggregator 服务负责从 Gate.io 获取K线数据并存入 TimescaleDB。回测引擎是第二个核心服务，负责接收用户提交的 Python 策略/选币代码，在安全沙箱中执行回测，返回专业级指标结果。

用户画像为非程序员，策略代码由 AI 在用户本地设备上生成，然后提交到远程服务执行。当前阶段为单用户 MVP，同一时刻只运行一个回测任务。

系统架构总览：

```
┌──────────────────────────────────────────────────────────────────┐
│                        Docker Compose                            │
│                                                                  │
│  ┌─────────────┐   ┌──────────────────┐   ┌──────────────────┐  │
│  │   data-      │   │  backtest-engine │   │   TimescaleDB    │  │
│  │  aggregator  │   │   (Go/Hertz)     │   │                  │  │
│  │  :8080       │   │   :8081          │   │   :5432          │  │
│  │             │   │                  │   │                  │  │
│  │  S3下载     │   │  任务管理        │   │  claw.futures_*  │  │
│  │  API补全    │   │  代码合规检查    │   │  claw.symbols    │  │
│  │  Gap修复    │   │  沙箱编排        │   │  claw.strategies │  │
│  │             │   │  结果存储        │   │  claw.backtest_* │  │
│  └──────┬──────┘   └────────┬─────────┘   └────────┬─────────┘  │
│         │                   │                      │            │
│         └───────────────────┼──────────────────────┘            │
│                             │ Docker API                        │
│                    ┌────────▼─────────┐                         │
│                    │  Sandbox Container│                         │
│                    │  (Python 3.11)    │                         │
│                    │  --network=none   │                         │
│                    │  --read-only      │                         │
│                    │  --memory=2g      │                         │
│                    │  --cpus=2         │                         │
│                    │                   │                         │
│                    │  DB readonly ────►│ TimescaleDB             │
│                    └───────────────────┘                         │
└──────────────────────────────────────────────────────────────────┘
```

## Goals / Non-Goals

**Goals:**

- 安全执行用户提交的 Python 策略代码和选币脚本
- 提供专业级回测指标（30+ 指标，覆盖收益/风险/风险调整/交易分析）
- 选币脚本仅能访问 1h/4h/1d K线数据和币种元数据，禁止分钟级别数据
- 单用户 MVP，同时只运行一个回测任务
- 参数优化（网格搜索），可配置最大运行次数
- 回测代码和结果持久化存储
- 容器化部署，与 data-aggregator 共享 TimescaleDB

**Non-Goals:**

- 多用户系统（认证、授权、租户隔离）—— 后续迭代
- 同时执行多个回测任务 —— MVP 只支持串行
- 实盘交易对接 —— 后续独立服务
- 前端/桌面客户端 —— 后续独立项目
- 本地开发 SDK（pip install claw-sdk）—— 面向普通用户无需
- 资金费率模拟 —— 当前版本不支持
- Tick 级回测 —— 仅支持K线级别（bar-level）

## Decisions

### Decision 1: 沙箱执行方案 — Docker 容器

**选择**: 每次回测创建一个独立 Docker 容器执行 Python 代码

**替代方案**:
- A) 进程级隔离（subprocess + seccomp）：隔离不够强，共享文件系统风险
- B) gVisor / Firecracker 微虚拟机：隔离更强但部署复杂，MVP 阶段 overkill
- C) WebAssembly (Pyodide)：不支持 numpy/pandas/ta-lib 原生扩展

**理由**: Docker 提供足够的隔离（network=none, read-only, resource limits），生态成熟，部署简单。沙箱容器使用预构建镜像（含 Python + numpy + pandas + ta-lib + 回测框架），通过 volume mount 传入用户代码。

### Decision 2: 沙箱与主服务通信 — HTTP Callback

**选择**: 沙箱容器通过 HTTP callback 向主服务报告进度和结果

**通信方式**:
- 沙箱容器可访问 backtest-engine 内部网络（仅限 callback endpoint）
- 回调地址: `POST /internal/cb/{progress,complete,error}`
- 网络策略: 沙箱只能连 TimescaleDB（只读）和 backtest-engine callback endpoint，无法访问外网

**替代方案**:
- A) 共享文件 + 轮询：简单但延迟高，无法实时进度
- B) gRPC streaming：过度设计，增加沙箱镜像复杂度

### Decision 3: K线数据加载 — 沙箱直连 TimescaleDB（只读用户）

**选择**: 沙箱容器内 Python 代码通过 psycopg2 直连 TimescaleDB，使用只读数据库用户

**理由**: 避免数据序列化/传输开销，直接利用 TimescaleDB 的时间范围查询性能。只读用户确保沙箱无法修改数据。

**只读用户权限**:
```sql
CREATE USER claw_readonly WITH PASSWORD '...';
GRANT USAGE ON SCHEMA claw TO claw_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA claw TO claw_readonly;
-- 选币脚本额外限制通过 Python 框架层面控制（仅暴露 1h/4h/1d 表）
```

### Decision 4: 策略 API 设计 — Strategy 基类

**选择**: 提供 `Strategy` 基类，用户继承并实现 `setup()` 和 `on_bar()` 方法

```python
class MyStrategy(Strategy):
    def setup(self):
        self.sma_fast = self.indicator('SMA', period=10)
        self.sma_slow = self.indicator('SMA', period=30)
    
    def on_bar(self, bar):
        if self.sma_fast[-1] > self.sma_slow[-1]:
            self.buy(size=1, leverage=3)
        elif self.sma_fast[-1] < self.sma_slow[-1]:
            self.sell(size=1, leverage=3)
```

**理由**: 与主流回测框架（Backtrader, Freqtrade）设计一致，AI 容易生成。`setup()` 声明指标和参数，`on_bar()` 逐根K线驱动决策。支持：
- 多周期：主K线驱动 `on_bar`，辅助K线通过 `self.data('BTC_USDT', '1d')` 访问
- 跨币种：通过 `self.data('ETH_USDT', '1h')` 访问其他币种数据
- 杠杆：`self.buy(leverage=N)` / `self.sell(leverage=N)`

### Decision 5: 选币 API 设计 — Screener 基类

**选择**: 提供 `Screener` 基类，用户继承并实现 `filter()` 方法

```python
class MyScreener(Screener):
    def filter(self, symbol, klines, metadata):
        # klines: dict with '1h', '4h', '1d' DataFrames (NO minute data)
        # metadata: {rank, volume_24h_quote, leverage_max, ...}
        if metadata['volume_24h_quote'] < 1_000_000:
            return False
        sma20 = klines['1d']['close'].rolling(20).mean()
        return klines['1d']['close'].iloc[-1] > sma20.iloc[-1]
```

**数据限制**:
- `klines` 参数仅包含 `1h`, `4h`, `1d` 三个周期的 DataFrame
- 框架层面不暴露 5m/15m/30m 表的查询接口
- `metadata` 包含: symbol, market, rank, volume_24h_quote, leverage_max, status

### Decision 6: 代码合规检查 — 4 层安全

**选择**: 分层安全策略

| 层级 | 机制 | 检查内容 |
|------|------|----------|
| L1 | Python AST 静态分析 | 禁止 import os/sys/subprocess，禁止 exec/eval/compile，禁止 `__import__` |
| L2 | 模块白名单 | 只允许 numpy, pandas, talib, math, datetime, collections, typing, dataclasses |
| L3 | Docker 容器隔离 | --network=none, --read-only, --memory=2g, --cpus=2, --pids-limit=100, timeout 杀 |
| L4 | DB 只读用户 | 数据库层面保证无法写入或删除数据 |

### Decision 7: 回测指标体系 — 4 大类 30+ 指标

**选择**: 参考 TradingView / Backtrader / QuantConnect / Freqtrade 的指标体系

**收益类**: Total Return, Annualized Return, Max Drawdown, Max Drawdown Duration, Profit Factor, Expectancy, Equity Final, Equity Peak

**风险类**: Volatility (Ann.), Downside Deviation, Value at Risk (95%), Conditional VaR, Max Consecutive Losses, Max Consecutive Wins

**风险调整类**: Sharpe Ratio, Sortino Ratio, Calmar Ratio, Omega Ratio, Win Rate, Risk-Reward Ratio, Recovery Factor

**交易分析类**: Total Trades, Avg Trade Return, Avg Win, Avg Loss, Avg Trade Duration, Max Trade Duration, Long/Short Trade Count, Best/Worst Trade

**时间序列**: Equity Curve, Drawdown Curve, Monthly Returns Heatmap, Trade List (entry/exit/pnl/duration)

所有指标分 ALL/LONG/SHORT 三个维度计算。

### Decision 8: 参数优化 — 网格搜索

**选择**: 串行网格搜索 + 可配置最大运行次数

```python
class MyStrategy(Strategy):
    params = {
        'sma_fast': [5, 10, 20],
        'sma_slow': [20, 30, 50],
    }
```

- 自动生成参数组合（笛卡尔积）
- 可配置 `max_optimization_runs`（默认 100），超过则截断并警告
- 每组参数串行执行，结果按 Sharpe Ratio 排序返回

### Decision 9: 数据库 Schema 扩展

**选择**: 在现有 claw schema 中新增回测相关表

```sql
-- 策略代码存储
CREATE TABLE claw.strategies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    code_type       TEXT NOT NULL,  -- 'strategy' | 'screener'
    code            TEXT NOT NULL,
    params_schema   JSONB,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- 回测运行记录
CREATE TABLE claw.backtest_runs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id     UUID REFERENCES claw.strategies(id),
    status          TEXT NOT NULL DEFAULT 'pending',  -- pending/running/done/failed
    mode            TEXT NOT NULL,  -- 'single' | 'optimization'
    config          JSONB NOT NULL,  -- {symbols, interval, from, to, leverage, ...}
    progress        JSONB,          -- {current_run, total_runs, phase}
    result          JSONB,          -- 完整指标结果
    error           TEXT,
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- 选币运行记录
CREATE TABLE claw.screener_runs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id     UUID REFERENCES claw.strategies(id),
    status          TEXT NOT NULL DEFAULT 'pending',
    config          JSONB NOT NULL,  -- {market, intervals_allowed, ...}
    result          JSONB,          -- [{symbol, passed, score, reason}]
    error           TEXT,
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now()
);
```

### Decision 10: 服务框架 — Hertz + Docker Compose

**选择**: 与 data-aggregator 统一技术栈，使用 CloudWeGo Hertz 框架

**项目结构**:
```
backtest-engine/
├── cmd/server/main.go
├── internal/
│   ├── config/          # 配置加载
│   ├── handler/         # HTTP handler（backtest, screener, strategy）
│   ├── router/          # 路由注册
│   ├── service/         # 业务逻辑（任务编排、沙箱管理）
│   ├── sandbox/         # Docker 沙箱创建/管理/销毁
│   ├── compliance/      # 代码合规检查（AST 分析）
│   ├── store/           # 数据库操作
│   └── model/           # 数据模型
├── sandbox/
│   ├── Dockerfile        # Python 沙箱镜像
│   ├── requirements.txt  # numpy, pandas, ta-lib
│   └── framework/        # Python 回测框架代码
│       ├── strategy.py   # Strategy 基类
│       ├── screener.py   # Screener 基类
│       ├── engine.py     # 回测引擎核心
│       ├── metrics.py    # 指标计算
│       └── runner.py     # 入口脚本
├── config.yaml
├── Dockerfile
└── docker-compose.yml
```

## Risks / Trade-offs

**[Docker-in-Docker 复杂度]** → backtest-engine 需要通过 Docker API 创建沙箱容器。使用 Docker socket 挂载（`/var/run/docker.sock`）而非 DinD 模式，降低复杂度。需注意 socket 挂载的安全性。

**[沙箱网络隔离 vs DB 访问矛盾]** → 沙箱需要 `--network=none` 但又要连 TimescaleDB。解决方案：创建专用 Docker network，沙箱只能访问该 network 上的 TimescaleDB 和 callback endpoint，不能访问外网。通过 iptables 或 Docker network policy 实现。

**[Python ta-lib 安装复杂]** → ta-lib 需要编译 C 库。在沙箱 Dockerfile 中预编译安装，使用 Alpine + ta-lib-dev 包，或切换到 Debian slim 基础镜像简化编译。

**[单次回测内存/时间限制]** → 300 币种 × 1 年 × 5m 数据量大。策略回测按用户指定的 symbol 列表执行（通常 1-10 个），不会全量加载。选币脚本逐个 symbol 评估，不一次加载全部数据。

**[参数优化组合爆炸]** → 3 参数 × 10 值 = 1000 组合。通过 `max_optimization_runs` 配置项硬性截断，默认 100。超过上限时优先用均匀采样而非前 N 个。

**[回测框架 Python 代码维护]** → 沙箱内的 Python 框架代码（Strategy 基类、指标计算等）需要与 Go 服务同步版本。通过沙箱镜像版本号 tag 管理。
