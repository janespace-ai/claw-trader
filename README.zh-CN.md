# claw-trader

[English](README.md) · **简体中文** · [繁體中文](README.zh-TW.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> **让普通人也能用 AI 写量化策略的开源研究平台。** 用自然语言描述想法,让 AI 把它变成代码,看它在真实历史行情上本来会怎样——全部在你自己的电脑上跑。

<p align="center">
  <img src="docs/screenshots/workspace-strategy-design-light.png" alt="策略设计工作区——K 线、指标、以及右侧的 AI 策略师面板" width="860">
</p>

<p align="center">
  <em>右边是 AI 策略师,你说想法、它写代码。点一下 Run,看它历史上本来会怎样。</em>
</p>

---

## 大致怎么用

```
  1. 说出你的想法                 2. AI 起草策略                  3. 跑历史回测
  ───────────────────────         ───────────────────────         ───────────────────────
  "BTC 1 小时 K 线 RSI            编辑器里自动出 Python           拿数年真实历史数据回跑,
   跌破 30 就买入,第一根            代码,你想改就改,              看收益、Sharpe、回撤、
   阴线就平仓"                    直接 Run                        每一笔交易都列出来
```

反复迭代,直到数字让你觉得"这策略值得真金白银去试"。**实盘下单在路线图上,当前版本只做回测。**

## 不会编程也没关系

> **不会写代码?没关系。** 用自然语言告诉 AI 你想要什么——*"RSI 上穿 30 就买入,下一根阴线就平仓"*——它会给你一条可运行的策略。好奇的话可以看一眼生成的 Python,不看也行。

## 能用它做什么

- **每个交易思路一个工作区。** 每条「策略」就是一段聊天——打开就看到完整决策记录、当前代码、当前币种列表、最近一次回测结果。下次回来从你离开的地方继续。
- **跟 AI 聊,拿到策略代码。** 用自然语言描述想法,AI 策略师帮你写代码。每次改动都是一张 diff 预览卡,你点应用或拒绝。
- **AI 也帮你筛币。** 说一句「筛 24h 成交额 top 30」,AI 真去后端跑筛选,把通过的币写进当前工作区。
- **看它在历史上本来会怎样。** 当代码和币列表都齐了,工作区自动跑一次回测。聚合收益 + 按币种下钻,看「这套策略在主流币上盈利,在小币上亏损」。
- **聊天里直接调参。** 输入「试 RSI 14, 21, 28」,工作区派发参数扫描,挑出最优组合写回策略。
- **满意才保存。** 只有点 [保存策略] 才把当前 draft 定格;聊天驱动的改动一直累积在草稿区。
- **一切都在你自己机器上。** 没有云账号,没有数据上传,没有遥测。API Key 和结果不会离开你的笔记本。

*已经会 Python?* 你也可以直接改 AI 写的代码、或者从零手写——`Strategy` 类是纯 Python,实现 `on_bar` 方法,调用 `buy` / `sell` / `close` 即可。

## 它不是什么

- **暂时还不是交易机器人。** 实盘下单功能在规划中(见下方),当前还没实装。现在这个版本只读历史行情、只做模拟回测。
- **不是模拟盘服务。** 目前还不做实时数据的前瞻测试。
- **不是托管服务。** 没有我们的云,没有注册,没有账号,没有任何受我们控制的服务器。三个服务全在你本地跑。
- **不构成投资建议。** 回测里表现好的策略,实盘仍然可能亏损。

**接下来要做的:** 对接支持的交易所做实盘下单、在实时数据上做模拟盘、以及更多数据连接器。这是路线图,不是承诺——正在设计的功能见 `openspec/` 下的 proposal。

## 快速开始

你需要 **Docker** 和 **Docker Compose**。其他都在仓库里。

**1. 启动数据服务 + 时序数据库:**

```bash
cd data-aggregator
docker compose -f docker-compose.yml -f docker-compose.test.yml up -d --build
```

第一次启动会拉一小段历史 K 线,让你立刻有东西可以回测。

**2. 启动 API 服务与沙箱:**

与步骤 1 共用同一 TimescaleDB（共享 Docker 网络 `claw-net` / `claw-sandbox-net`）。若只启动 `service-api`，请先在仓库根目录执行 `make db-up` 拉起数据库。这份 compose 同时构建 `service-api`(Go,API + 编排)和 `sandbox-service`(Python,真正执行用户策略的地方)。

```bash
cd ../service-api
docker compose up -d --build
```

**3. 打开桌面客户端:**

```bash
cd ../desktop-client
pnpm install
pnpm dev
```

应用会连上本地两个服务。首次启动会让你填一个 AI API Key——OpenAI、Anthropic、DeepSeek、Gemini、Moonshot(月之暗面)的任选一个粘进去,然后就可以开始让 AI 帮你写策略了。

<p align="center">
  <img src="docs/screenshots/multi-symbol-grid-light.png" alt="多品种网格视图——九条小型权益曲线,一屏看完" width="860">
</p>

<p align="center">
  <em>一次筛一堆品种。找出值得深入看的几个。</em>
</p>

## 架构

*给想自己折腾的开发者看。普通用户可以跳过。*

```
  ┌───────────────────────────────┐
  │  desktop-client(Electron +   │
  │  React + TypeScript)         │
  └───────────┬───────────────────┘
              │ HTTP 8081
              ▼
              ┌─────────────────────────┐
              │ service-api         │
              │ (Go + Hertz)            │
              │  • /api/backtest/*      │
              │  • /api/screener/*      │
              │  • /api/klines /symbols │
              │    /gaps(数据网关)     │
              │  • 派生 Python 沙箱     │
              └───────┬─────────────────┘
                      │ SQL(只读)
                      ▼
              ┌──────────────┐
              │ TimescaleDB  │ ◄── SQL(写入)
              │ (OHLCV)      │      │
              └──────────────┘      │
                                    │
              ┌─────────────────────┴───┐
              │ data-aggregator         │
              │ (Go,无头 worker)       │
              │  • 启动即刷新 top 300   │
              │  • 检测数据缺口         │
              │  • S3 + API 补齐        │
              │  • 不对外暴露 HTTP API  │
              └─────────────────────────┘
                      ▲
                      │ S3 CSV + REST
                      │
                 Gate.io 公开数据

  ┌─ AI(你自己的 API Key)────────────────┐
  │  OpenAI / Anthropic / DeepSeek /      │
  │  Gemini / Moonshot — 只从桌面         │
  │  客户端发起调用                       │
  └───────────────────────────────────────┘
```

三个服务、一个数据库、每次回测起一个沙箱。`data-aggregator` 是一个**无头 worker**:启动时自动检查数据完整性并补齐缺失,前端不直接访问它。`service-api` 是桌面端唯一对接的入口,既负责回测编排,也兼任市场数据的只读网关。沙箱使用一个只读的数据库账号:用户提交的 Python 代码可以查询历史 K 线,但写不动、删不掉。

本仓库使用 [OpenSpec](openspec/) 做 proposal 驱动的开发——每个值得记录的改动都在 `openspec/` 下留有 proposal、design 和 spec。

<p align="center">
  <img src="docs/screenshots/deep-backtest-light.png" alt="深度回测视图——权益曲线、指标、AI 优化面板" width="860">
</p>

<p align="center">
  <em>单品种深度分析——权益曲线、指标、完整交易日志,并排排开。</em>
</p>

## 数据源与 AI 供应商

**行情数据**目前来自 Gate.io 的公开历史数据集(托管于 S3)和公开 REST API,两者都不需要 API Key。`data-aggregator` 负责下载、入库、缺口检测。更多交易所在路线图上——引擎本身与交易场所解耦,面向通用的 `Bar(open, high, low, close, volume)` 抽象。

**AI 供应商**——任何兼容 OpenAI 接口的服务都能用。已经测过:

- OpenAI(`gpt-4o`、`gpt-4o-mini`)
- Anthropic(`claude-*`)
- DeepSeek(`deepseek-chat`、`deepseek-reasoner`)
- Google Gemini(`gemini-*`)
- Moonshot / 月之暗面(`kimi-*`)

API Key 自备,只存在你本机。

## 隐私 / 本地运行

- **API Key 只存在你电脑上。** 保存在本地,只会发给你自己选择的那家服务商。
- **不收集遥测。** 没有埋点 SDK、没有崩溃上报、没有"偷偷回家"的调用。应用只会访问你显式配置过的数据源或 AI 服务。
- **没有账号,没有云端同步。** 回测、策略、筛选器都保存在你本机启起来的数据库里。删掉 Docker 卷就全没了。

## 技术栈

- **语言**:Go(服务)、Python 3.11(策略)、TypeScript + React(客户端)
- **存储**:[TimescaleDB](https://www.timescale.com/)(PostgreSQL + 时序扩展)
- **图表**:[TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/)
- **指标**:纯 numpy / pandas 实现(`claw.indicators`)——保持沙箱镜像精简

## 目录结构

```
claw-trader/
├── data-aggregator/   Go 服务 · 拉取并存储历史 K 线
├── service-api/       Go 服务 · HTTP API + AI/AST 代码审查 + 编排
├── sandbox-service/   Python 服务 · 长驻 prefork 进程池 · 真正执行用户代码
├── desktop-client/    Electron + React · UI
├── api/               OpenAPI 契约(跨服务共享)
├── docs/              文档 + 设计稿(.pen) + 截图
├── scripts/           辅助脚本(pre-commit、e2e、golden-file 刷新等)
├── openspec/          Proposal、design、spec — 为什么和怎么做
└── LICENSE            MIT
```

## 贡献

欢迎提 PR。不是顺手改几行的改动,请先开一个 issue(或在 `openspec/` 下放一个 proposal),先对方向达成一致再动手。纯粹的错别字、文档、明显 bug——直接发 PR 就行。

## 项目状态

**早期 alpha。** 三个服务已经能跑通从 AI 写策略到完整回测的链路,但 API 和数据库 schema 还可能变。在意稳定性的话,请按 tag 固定版本。

## 免责声明

本项目是一个研究和教育用途的工具,不会执行任何真实交易。本仓库没有任何内容构成金融、投资、法律或税务建议。历史回测结果不能预测未来收益——一个在回测里看起来能赚钱的策略,在实盘依然可能亏损,原因包括但不限于:滑点、流动性、市场状态切换、数据质量、以及使用者本人的行为——这些都是回测模型无法完整刻画的因素。使用本软件所涉及的任何数据源或第三方服务时,使用者须自行遵守所在司法管辖区的法律与法规,相关合规责任由使用者自行承担。

## 许可证

以 [MIT License](LICENSE) 发布。版权所有 (c) 2026 janespace。
