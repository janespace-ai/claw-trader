## Why

claw-trader 已有远程数据归集服务和回测引擎，但缺少面向终端用户的交互入口。目标用户是非程序员，需要一个桌面应用让他们通过自然语言与 AI 对话来生成选币脚本和交易策略代码，提交到远程执行回测，并以专业级图表展示结果。用户使用自己的大模型 API Key，AI 在本地生成代码后发送远程执行，形成「对话 → 生成 → 回测 → 优化」的闭环。

## What Changes

- 新增 Electron + React 桌面应用，跨平台支持 macOS / Windows
- AI 对话引擎：统一适配 OpenAI、Claude、DeepSeek、Gemini、Kimi 五家 LLM，流式输出
- 选币工作流：用户自然语言描述选币条件 → AI 生成 Screener 代码 → 远程执行 → 返回币种列表 → 用户手动增删
- 策略生成工作流：用户自然语言描述策略想法 → AI 多轮对话生成 Strategy 代码 → 展示策略摘要
- 预回测（1 周数据，快速验证信号点位）→ 深度回测（默认半年数据，完整指标）两阶段回测流程
- K线图展示：TradingView Lightweight Charts，叠加指标线、标注做多/做空/平仓信号点
- 回测结果展示：全部币种汇总 + 单币种详情，权益曲线、回撤曲线、月度热力图、交易列表
- AI 自动优化：将回测结果（指标 + 关键交易 + 代码）注入 AI 上下文，自动分析问题并生成优化策略
- 本地策略管理：SQLite 存储策略代码/对话记录/回测结果，支持收藏、有效/无效状态、版本链（parent_id）
- 本地 LLM API Key 管理（明文存储，用户自托管）
- 单用户 MVP，无登录/认证

## Capabilities

### New Capabilities

- `llm-integration`: 多 LLM 适配层（OpenAI/Claude/DeepSeek/Gemini/Kimi），统一对话接口，流式输出，API Key 本地管理
- `ai-conversation`: AI 对话引擎，统一对话面板，策略/选币/优化意图识别，回测结果自动注入上下文，上下文裁剪与摘要
- `coin-screening-ui`: 选币交互流程，自然语言生成 Screener 代码，远程执行，币种列表展示与手动增删管理
- `strategy-generation-ui`: 策略生成交互流程，自然语言多轮对话生成 Strategy 代码，策略摘要展示，代码预览
- `backtest-workflow`: 两阶段回测流程（预回测 1 周 + 深度回测半年），进度展示，与远程 backtest-engine API 对接
- `result-visualization`: 回测结果可视化，K线图+信号标注，权益/回撤曲线，月度热力图，组合汇总+单币种详情，交易列表联动
- `local-storage`: 本地 SQLite 数据管理，策略 CRUD（收藏/有效/无效/版本链），对话记录，回测结果缓存，选币列表

### Modified Capabilities

（无，桌面端是全新项目）

## Impact

- **新增项目**: Electron + React 桌面应用，独立代码仓库或 monorepo 子目录
- **远程依赖**: 调用 backtest-engine（:8081）的 API（/api/backtest/*, /api/screener/*, /api/strategies/*）
- **外部依赖**: 5 家 LLM API（用户自带 Key）
- **前端依赖**: React, Electron, TradingView Lightweight Charts, better-sqlite3, Tailwind CSS / Ant Design
- **本地存储**: SQLite 数据库（~MB 级），存储策略/对话/回测缓存
- **打包分发**: electron-builder，macOS (.dmg) + Windows (.exe) 安装包
