# claw-trader

[English](README.md) · **简体中文** · [繁體中文](README.zh-TW.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> 一个给普通人用的开源量化研究平台。写一条策略、拿真实的历史行情回测一下、看看想法到底能不能站得住——全部在你自己的电脑上跑。

<p align="center">
  <img src="docs/screenshots/multi-symbol-grid-light.png" alt="多品种网格视图——九条小型权益曲线，一屏看完" width="860">
</p>

<p align="center">
  <em>多品种网格：同一条策略跑在不同品种上，权益曲线和交易标记一眼看完。</em>
</p>

---

## 能用它做什么

- **直接用 Python 写策略。** 继承 `Strategy`、实现 `on_bar(bar)`、调用 `self.buy()` / `self.sell()` / `self.close()`。没有自造的 DSL，也没有"配好 27 项参数才能跑"的门槛。
- **让 AI 帮你起草策略或筛选器。** 用自然语言描述想法，直接拿到可运行的 Python 代码。改一改、回测、再迭代。
- **拿真实历史 K 线回测。** 小时线、4 小时线、日线……从公开数据集拉下来，落到你本机的时序数据库里。
- **一次筛一堆品种。** 写一条过滤规则（"成交额大于 1 亿、趋势向上、RSI 低于 70"），看排序后的结果，点进去深入看。
- **单品种深度分析。** 蜡烛图、指标、你的交易标记、权益曲线、回撤、完整的交易日志——一屏排开。

## 它不是什么

- **不是交易机器人。** 没有实盘下单。它只读历史行情、模拟策略表现；不会替你真下单。
- **不是模拟盘服务。** 目前不做实时数据的前瞻测试。只做历史回测。
- **不是托管服务。** 没有我们的云，没有注册，没有账号，没有任何受我们控制的服务器。三个服务全在你本地跑。
- **不构成投资建议。** 它展示的是策略"在历史上本来会怎样"。未来怎样，没有人能替你担保。

<p align="center">
  <img src="docs/screenshots/workspace-strategy-design-light.png" alt="策略设计工作区——K 线、指标、以及 AI 策略师面板" width="860">
</p>

## 快速开始

你需要 **Docker** 和 **Docker Compose**，其他都在仓库里。

**1. 启动数据聚合器 + 时序数据库：**

```bash
cd data-aggregator
docker compose -f docker-compose.yml -f docker-compose.test.yml up -d --build
```

这会先拉一小段历史 K 线下来（两个品种、两个月），让你立刻有东西可以回测。想做完整同步时再改 `config.yaml` 放大范围。

**2. 构建策略沙箱镜像：**

```bash
docker build -t claw-sandbox:latest backtest-engine/sandbox/
```

沙箱是一个被锁死的 Python 容器，专门用来跑你的策略代码。里面预装 `pandas`、`numpy`、`ta-lib`，以及打包进去的 `claw` 框架。第一次构建会编译 TA-Lib 的 C 库，稍慢几分钟。

**3. 启动回测引擎：**

```bash
cd ../backtest-engine
docker compose up -d --build
```

**4. 打开桌面客户端：**

```bash
cd ../desktop-client
pnpm install
pnpm dev
```

Electron 窗口会连上本地两个服务。在左侧面板写一条策略、点 *Run Preview*，结果会落到底部抽屉里。

各服务自己的 README 以及 `openspec/` 下的 proposal 里，有更完整的命令和校验过的参数组合。

## 架构

```
  ┌───────────────────────────────┐
  │  desktop-client（Electron +   │
  │  React + TypeScript）         │
  └───────────┬───────────────────┘
              │ HTTP 8080 / 8081
     ┌────────┴─────────┐
     │                  │
     ▼                  ▼
  ┌──────────────┐   ┌─────────────────────┐
  │ data-        │   │ backtest-engine     │
  │ aggregator   │   │ (Go + Hertz)        │
  │ (Go + Hertz) │   │   │                 │
  └──────┬───────┘   │   │ 派生             │
         │           │   ▼                 │
         ▼           │ ┌─────────────────┐ │
  ┌──────────────┐◄──┘ │ Python 沙箱     │ │
  │ TimescaleDB  │◄────┤ 容器            │ │
  │ (OHLCV)      │ 只读 │（你的策略）     │ │
  └──────────────┘     └─────────────────┘ │
                                           │
  ┌─ AI（你自己的 API Key）─────────────────┐│
  │  OpenAI / Anthropic / DeepSeek /      ││
  │  Gemini / Moonshot — 只从桌面         ││
  │  客户端发起调用                       │◄┘
  └───────────────────────────────────────┘
```

三个服务、一个数据库、每次回测起一个沙箱。沙箱使用一个只读的数据库账号：用户提交的 Python 代码可以查询历史 K 线，但写不动、删不掉。

本仓库使用 [OpenSpec](openspec/) 做 proposal 驱动的开发——每个值得记录的改动都在 `openspec/` 下留有 proposal、design 和 spec。

<p align="center">
  <img src="docs/screenshots/deep-backtest-light.png" alt="深度回测视图——权益曲线、指标、AI 优化面板" width="860">
</p>

## 数据源与 AI 供应商

**行情数据**来自 Gate.io 的公开历史数据集（托管于 S3）和公开 REST API，两者都不需要 API Key。`data-aggregator` 负责下载、入库、缺口检测。

想接其他交易所（Binance、Bybit、CME、传统金融数据源）——就是多写一个聚合器连接器的事。引擎本身和交易场所解耦，只面向一个通用的 `Bar(open, high, low, close, volume)` 抽象。当前这一版只包含 Gate.io 连接器，其他连接器不在本次范围内。

**AI 供应商**——任何兼容 OpenAI 接口的服务都能用。已经测过：

- OpenAI（`gpt-4o`、`gpt-4o-mini`）
- Anthropic（`claude-*`）
- DeepSeek（`deepseek-chat`、`deepseek-reasoner`）
- Google Gemini（`gemini-*`）
- Moonshot / 月之暗面（`kimi-*`）

API Key 自备。它只保存在你本机（Electron 应用的本地存储里），只会从你的机器发到你自己选择的那家服务商。

## 隐私 / 本地运行

- **API Key 只在你机器上。** 桌面客户端把它们存在本地数据目录，除了你自己配置的服务商之外，不会发到任何其他地方。
- **不收集遥测。** 没有埋点 SDK，没有崩溃上报，没有任何"偷偷回家"的调用。应用只会访问你自己显式配置过的数据源或 AI 服务。
- **没有账号，没有云端同步。** 回测、策略、筛选器都保存在你本机启起来的数据库里。删掉 Docker 卷就全没了。

## 技术栈

- **语言**：Go（服务）、Python 3.11（沙箱）、TypeScript + React 18（客户端）
- **服务框架**：[Hertz](https://github.com/cloudwego/hertz)（HTTP）+ Go 1.25
- **存储**：[TimescaleDB](https://www.timescale.com/)（PostgreSQL + 时序扩展）
- **图表**：[TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/)
- **指标**：沙箱内的 [TA-Lib](https://github.com/TA-Lib/ta-lib)
- **桌面壳**：Electron 33 + Vite + Tailwind
- **工具链**：Docker Compose、pnpm、OpenSpec

## 目录结构

```
claw-trader/
├── data-aggregator/    Go 服务 · 拉取并存储历史 K 线
├── backtest-engine/    Go 服务 + Python 沙箱 · 执行策略
├── desktop-client/     Electron + React · UI
├── design/             Pencil (.pen) 设计稿 — 深色与浅色主题
├── docs/screenshots/   README 使用的展示图
├── openspec/           Proposal、design、spec — 为什么和怎么做
└── LICENSE             MIT
```

## 贡献

欢迎提 PR。不是顺手改几行的改动，请先开一个 issue（或在 `openspec/` 下放一个 proposal），先对方向达成一致再动手。纯粹的错别字、文档、明显 bug——直接发 PR 就行。

## 项目状态

早期 alpha。三个服务已经能跑通完整链路、桌面客户端能完整走完一个回测流程，但 API 和数据库 schema 还可能随着 spec 目录收敛而变化。在意稳定性的话，请按 tag 固定版本。

## 免责声明

本项目是一个研究和教育用途的工具。它不会执行任何交易。本仓库内没有任何内容构成金融、投资、法律或税务建议。历史回测结果不能预测未来收益，一个在回测里看起来能赚钱的策略在实盘可能亏损，原因包括但不限于：滑点、流动性、市场状态切换、数据质量、以及使用者本人的行为——这些都是回测模型无法完整刻画的。使用本软件所涉及的任何数据源或第三方服务时，使用者须自行遵守所在司法管辖区的法律与法规，相关合规责任由使用者自行承担。

## 许可证

以 [MIT License](LICENSE) 发布。版权所有 (c) 2026 janespace。
