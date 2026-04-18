# ai-conversation Specification

## Purpose

TBD — created by archiving change desktop-client. Update Purpose after archive.

## Requirements

### Requirement: 统一对话面板

系统 SHALL 提供常驻右侧的 AI 对话面板，作为所有 AI 交互的统一入口。对话面板 SHALL 支持宽度拖拽调整和折叠。

#### Scenario: 对话面板布局

- **WHEN** 用户打开应用
- **THEN** 右侧显示 AI 对话面板，左侧为主内容区
- **THEN** 对话面板宽度可通过拖拽调整
- **THEN** 对话面板可折叠/展开

#### Scenario: 跨 Tab 保持对话

- **WHEN** 用户在「选币」Tab 和 AI 对话后切换到「策略」Tab
- **THEN** 对话历史保持连续，不因 Tab 切换而丢失

### Requirement: 多轮对话上下文

系统 SHALL 维护完整的对话上下文，支持多轮交互。AI 能理解之前的对话内容。

#### Scenario: 多轮策略迭代

- **WHEN** 用户先说「做一个均线交叉策略」，AI 生成代码后，用户再说「加一个 RSI 过滤」
- **THEN** AI 基于之前生成的策略代码进行修改，而不是重新生成
- **THEN** 对话历史中保留完整的交互过程

#### Scenario: 上下文长度管理

- **WHEN** 对话历史超过模型 context window 的 70%
- **THEN** 系统自动将早期消息压缩为摘要
- **THEN** 保留最近的详细消息和关键决策点（如策略代码、回测结果）

### Requirement: 回测结果自动注入 AI 上下文

系统 SHALL 在用户请求 AI 优化策略时，自动将回测结果的关键数据注入 AI 上下文。

#### Scenario: AI 自动优化

- **WHEN** 深度回测完成后用户点击「AI 优化」按钮或说「帮我优化」
- **THEN** 系统自动注入以下数据到 AI 上下文：
  - 当前策略完整代码
  - 核心指标（ALL/LONG/SHORT 三维度）
  - 亏损最大 5 笔交易详情
  - 连续亏损段信息
  - 多空对比数据
  - 最差表现 3 个币种
  - 月度收益分布
- **THEN** 注入数据控制在 ~2000 tokens 以内

#### Scenario: 基于结果的自然语言优化

- **WHEN** 用户在对话中说「空头表现太差了，帮我改进」
- **THEN** AI 能看到空头相关指标（空头胜率、空头交易数、空头平均亏损等）
- **THEN** AI 针对性地修改策略的做空逻辑

### Requirement: 意图识别

系统 SHALL 通过 LLM 的 system prompt 引导 AI 识别用户意图类别，并生成对应格式的输出。

#### Scenario: 识别选币意图

- **WHEN** 用户说「帮我找成交量大的、日线趋势向上的币」
- **THEN** AI 识别为选币意图
- **THEN** 生成 Screener 代码（继承 Screener 基类）

#### Scenario: 识别策略意图

- **WHEN** 用户说「做一个布林带突破策略」
- **THEN** AI 识别为策略生成意图
- **THEN** 生成 Strategy 代码（继承 Strategy 基类）

#### Scenario: 识别优化意图

- **WHEN** 用户说「夏普比太低了」或「帮我优化」
- **THEN** AI 识别为优化意图
- **THEN** 基于当前策略和回测结果生成改进后的代码

### Requirement: 策略摘要展示

系统 SHALL 在 AI 生成策略代码后，同时生成人类可读的策略摘要，方便非程序员用户确认。

#### Scenario: 展示策略摘要

- **WHEN** AI 生成一个策略代码
- **THEN** 在对话面板中展示策略摘要卡片，包含：
  - 策略类型（如「均线交叉」）
  - 适用品种和周期
  - 做多/做空条件（自然语言描述）
  - 杠杆设置
  - 参数优化范围（如有）
- **THEN** 用户可以确认或要求修改
