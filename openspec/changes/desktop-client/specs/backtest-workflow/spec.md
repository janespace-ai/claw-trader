## ADDED Requirements

### Requirement: 预回测（快速验证）

系统 SHALL 支持使用最近 1 周数据对所有选中币种执行预回测，用于快速验证策略信号点位。

#### Scenario: 发起预回测

- **WHEN** 策略和选币均就绪，用户点击「开始预回测」
- **THEN** 系统将策略代码和配置（symbols, interval, from=7天前, to=now）提交到远程 `POST /api/backtest/start`
- **THEN** 所有选中币种均参与预回测

#### Scenario: 预回测结果展示

- **WHEN** 预回测执行完成
- **THEN** 主内容区切换到回测结果页
- **THEN** 展示 K 线图 + 信号标注（做多/做空/平仓点位）
- **THEN** 展示简要指标（交易次数、胜率、收益率）
- **THEN** 展示交易列表

#### Scenario: 预回测后的用户选择

- **WHEN** 预回测结果展示完毕
- **THEN** 显示两个操作按钮：「确认，深度回测」和「修改策略」
- **THEN** 点击「修改策略」→ 焦点回到 AI 对话面板
- **THEN** 点击「确认，深度回测」→ 发起深度回测

### Requirement: 深度回测

系统 SHALL 支持使用默认半年数据对所有选中币种执行深度回测，生成完整回测指标。

#### Scenario: 发起深度回测

- **WHEN** 用户确认预回测结果后点击「深度回测」
- **THEN** 系统提交 `POST /api/backtest/start`（from=半年前, to=now）
- **THEN** 用户可自定义回测时间范围（默认半年）

#### Scenario: 深度回测进度

- **WHEN** 深度回测正在执行中
- **THEN** 主内容区显示进度指示器（「回测中...」）
- **THEN** 用户可继续使用 AI 对话面板
- **THEN** 系统定期轮询 `GET /api/backtest/status/:task_id` 更新进度

#### Scenario: 深度回测完成

- **WHEN** 深度回测执行完成
- **THEN** 自动展示完整回测结果（组合汇总 + 单币种详情）
- **THEN** 结果同时缓存到本地 SQLite

### Requirement: 回测与远程 API 对接

系统 SHALL 通过 backtest-engine HTTP API 执行所有回测任务。

#### Scenario: 提交回测任务

- **WHEN** 发起回测
- **THEN** 调用 `POST /api/backtest/start`，提交策略代码和配置
- **THEN** 获取 task_id

#### Scenario: 轮询回测进度

- **WHEN** 任务处于 running 状态
- **THEN** 每 3 秒轮询 `GET /api/backtest/status/:task_id`
- **THEN** 更新界面进度

#### Scenario: 获取回测结果

- **WHEN** 任务状态变为 done
- **THEN** 调用 `GET /api/backtest/result/:task_id` 获取完整结果
- **THEN** 解析并渲染结果

#### Scenario: 回测失败处理

- **WHEN** 任务状态变为 failed
- **THEN** 显示错误信息
- **THEN** 引导用户通过 AI 对话修改策略后重试

### Requirement: 远程服务连接管理

系统 SHALL 管理与远程 backtest-engine 的连接状态。

#### Scenario: 配置远程服务地址

- **WHEN** 用户在设置中配置远程服务地址（默认 http://localhost:8081）
- **THEN** 系统保存到本地设置

#### Scenario: 连接失败提示

- **WHEN** 远程服务不可访问
- **THEN** 在界面上显示连接状态指示（红色标记）
- **THEN** 回测按钮不可点击，提示「远程服务未连接」
