## ADDED Requirements

### Requirement: 自然语言生成策略

系统 SHALL 支持用户通过自然语言描述策略想法，AI 多轮对话生成 Strategy 代码。

#### Scenario: 首次生成策略

- **WHEN** 用户说「做一个均线交叉策略，BTC 1h 周期，10/30 均线」
- **THEN** AI 生成继承 Strategy 基类的 Python 代码
- **THEN** 同时生成策略摘要卡片（策略类型、条件、参数）
- **THEN** 策略自动保存到本地 SQLite（version=1）

#### Scenario: 迭代修改策略

- **WHEN** 用户说「加一个 RSI 过滤，RSI 低于 30 才做多」
- **THEN** AI 基于上一版策略代码修改
- **THEN** 生成新版本策略（version=2, parent_id=上一版 ID）
- **THEN** 更新策略摘要卡片

### Requirement: 策略代码预览

系统 SHALL 在策略 Tab 中展示当前策略的代码，供高级用户查看（非必需）。

#### Scenario: 查看策略代码

- **WHEN** 用户在策略 Tab 中点击「查看代码」
- **THEN** 展示 Python 代码，带语法高亮
- **THEN** 代码为只读模式（编辑通过 AI 对话完成）

### Requirement: 策略与选币独立

系统 SHALL 允许策略生成和选币独立进行，无固定先后顺序。

#### Scenario: 先生成策略再选币

- **WHEN** 用户先完成策略生成，还未选币
- **THEN** 策略 Tab 显示策略已就绪
- **THEN** 回测按钮显示「需要选币」，不可点击

#### Scenario: 两者齐全后可回测

- **WHEN** 策略和选币列表都已就绪
- **THEN** 回测准备状态显示两项均为 ✅
- **THEN** 「开始预回测」按钮可点击

### Requirement: 回测准备状态指示器

系统 SHALL 显示当前回测准备状态，明确告知用户还缺什么。

#### Scenario: 显示回测就绪状态

- **WHEN** 用户查看回测准备状态
- **THEN** 显示：
  - ✅/⬜ 币种列表（N 个币种已选择 / 未创建）
  - ✅/⬜ 交易策略（策略名称 / 未创建）
  - 回测周期选择
  - 「开始预回测」按钮（两者齐全时可点击）
