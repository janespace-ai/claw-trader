# local-storage Specification

## Purpose

TBD — created by archiving change desktop-client. Update Purpose after archive.

## Requirements

### Requirement: 策略本地存储与管理

系统 SHALL 将所有策略代码存储在本地 SQLite 数据库中，支持完整的策略生命周期管理。

#### Scenario: 策略自动保存

- **WHEN** AI 生成新策略代码
- **THEN** 自动保存到本地 strategies 表
- **THEN** 包含：name, type, code, description（AI 摘要）, version, parent_id

#### Scenario: 策略版本链

- **WHEN** AI 基于现有策略生成修改版本
- **THEN** 新版本的 parent_id 指向上一版本
- **THEN** version 自增
- **THEN** 用户可追溯策略演化历史

#### Scenario: 收藏策略

- **WHEN** 用户点击策略的收藏按钮
- **THEN** 该策略 is_favorite 标记为 true
- **THEN** 在策略列表中可按「仅收藏」筛选

#### Scenario: 设置策略状态

- **WHEN** 用户将策略标记为「无效」
- **THEN** 该策略 status 变为 'inactive'
- **THEN** 在策略列表中默认不显示（可通过筛选查看）
- **THEN** 策略代码和回测历史保留不删除

### Requirement: 策略列表与筛选

系统 SHALL 提供策略管理列表页，支持筛选和搜索。

#### Scenario: 策略列表展示

- **WHEN** 用户进入策略管理页
- **THEN** 展示所有策略，每行包含：名称、类型、状态、收藏标记、最近回测摘要、创建时间
- **THEN** 默认按更新时间降序

#### Scenario: 筛选策略

- **WHEN** 用户选择筛选条件
- **THEN** 支持按：全部/收藏/有效/无效 筛选
- **THEN** 支持关键词搜索（匹配名称和描述）

#### Scenario: 策略操作

- **WHEN** 用户在策略列表中操作
- **THEN** 支持：查看详情、发起回测、复制策略、标记有效/无效、收藏/取消收藏

### Requirement: 对话记录存储

系统 SHALL 将 AI 对话记录存储在本地，支持查看历史对话。

#### Scenario: 对话自动保存

- **WHEN** 用户与 AI 进行对话
- **THEN** 对话内容实时保存到本地 conversations 表
- **THEN** 包含所有消息（role, content, timestamp）

#### Scenario: 查看历史对话

- **WHEN** 用户打开对话历史
- **THEN** 展示历史对话列表，按时间降序
- **THEN** 可点击加载某次历史对话

### Requirement: 回测结果本地缓存

系统 SHALL 将回测结果缓存到本地，支持离线查看历史结果。

#### Scenario: 回测结果缓存

- **WHEN** 从远程获取回测结果后
- **THEN** 将结果存入本地 backtest_results 表
- **THEN** 包含：策略 ID、类型（预回测/深度）、币种、指标、权益曲线、交易列表

#### Scenario: 离线查看历史结果

- **WHEN** 远程服务不可用时
- **THEN** 用户仍可查看本地缓存的历史回测结果

### Requirement: 选币列表存储

系统 SHALL 将选币列表保存到本地，支持复用。

#### Scenario: 保存选币列表

- **WHEN** 用户编辑完选币列表
- **THEN** 保存到本地 coin_lists 表
- **THEN** 关联选币策略 ID（如有）

#### Scenario: 加载历史选币列表

- **WHEN** 用户选择加载历史选币列表
- **THEN** 展示已保存的列表供选择
- **THEN** 加载后可继续编辑

### Requirement: 应用设置存储

系统 SHALL 将应用设置存储在本地。

#### Scenario: 设置项存储

- **WHEN** 用户修改设置（API Key、默认模型、远程服务地址等）
- **THEN** 立即保存到本地 settings 表
- **THEN** 下次启动自动加载
