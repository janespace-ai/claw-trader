# coin-screening-ui Specification

## Purpose

TBD — created by archiving change desktop-client. Update Purpose after archive.

## Requirements

### Requirement: 自然语言选币

系统 SHALL 支持用户通过自然语言描述选币条件，AI 生成 Screener 代码并提交远程执行。

#### Scenario: 自然语言生成选币脚本

- **WHEN** 用户在对话中说「帮我找成交量前 50、日线 SMA20 以上的币」
- **THEN** AI 生成继承 Screener 基类的 Python 代码
- **THEN** 对话面板展示选币条件摘要供用户确认
- **THEN** 用户确认后提交到远程 backtest-engine 执行

#### Scenario: 远程执行并返回结果

- **WHEN** 选币脚本提交到远程服务
- **THEN** 系统调用 `POST /api/screener/start` 提交代码
- **THEN** 轮询 `GET /api/screener/result/:task_id` 获取结果
- **THEN** 结果返回后在左侧主内容区展示币种列表

### Requirement: 选币结果列表管理

系统 SHALL 展示选币结果，并支持用户手动增删币种。

#### Scenario: 展示选币结果

- **WHEN** 远程选币执行完成
- **THEN** 左侧展示币种列表，包含：币种名、评分、排名、24h 交易额
- **THEN** 列表按评分降序排列
- **THEN** 通过筛选的币种默认全部选中

#### Scenario: 手动移除币种

- **WHEN** 用户点击某个币种的「移除」按钮
- **THEN** 该币种从当前选币列表中移除
- **THEN** 不影响远程存储的选币结果

#### Scenario: 手动添加币种

- **WHEN** 用户点击「添加币种」并搜索输入币种名（如 DOGE_USDT）
- **THEN** 将该币种添加到当前选币列表
- **THEN** 即使该币种不在 AI 选币结果中也可添加

### Requirement: 选币列表保存

系统 SHALL 支持将选币结果保存为命名列表，供后续复用。

#### Scenario: 保存选币列表

- **WHEN** 用户编辑完币种列表后点击「保存」
- **THEN** 系统将列表保存到本地 SQLite（coin_lists 表）
- **THEN** 可关联选币策略 ID

#### Scenario: 加载已保存的选币列表

- **WHEN** 用户在选币页选择「加载已保存列表」
- **THEN** 显示历史保存的选币列表
- **THEN** 选择后加载该列表的币种
