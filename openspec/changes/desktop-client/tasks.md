## 1. 项目初始化

- [ ] 1.1 初始化 Electron + React + TypeScript 项目（Vite 构建，electron-builder 打包）
- [ ] 1.2 配置项目结构（electron/, src/components, src/services, src/stores, src/hooks）
- [ ] 1.3 配置 Tailwind CSS 样式框架
- [ ] 1.4 配置 Electron main/renderer 进程通信（IPC preload 脚本）
- [ ] 1.5 配置 electron-builder 打包（macOS .dmg + Windows .exe）

## 2. 本地存储层 (SQLite)

- [ ] 2.1 集成 better-sqlite3，Electron main process 初始化数据库
- [ ] 2.2 创建 strategies 表（id, name, type, code, description, status, is_favorite, tags, version, parent_id, created_at, updated_at）
- [ ] 2.3 创建 conversations 表（id, title, messages, strategy_id, created_at, updated_at）
- [ ] 2.4 创建 backtest_results 表（id, strategy_id, type, symbols, config, summary_metrics, per_symbol_metrics, equity_curve, trades, remote_task_id, created_at）
- [ ] 2.5 创建 coin_lists 表（id, name, symbols, screener_id, created_at, updated_at）
- [ ] 2.6 创建 settings 表（key, value）
- [ ] 2.7 实现 IPC handlers：strategies CRUD（创建、查询列表、更新状态/收藏、按 ID 查询、按 parent_id 查版本链）
- [ ] 2.8 实现 IPC handlers：conversations CRUD（创建、追加消息、查询列表、按 ID 查询）
- [ ] 2.9 实现 IPC handlers：backtest_results CRUD（创建、查询列表、按 ID 查询）
- [ ] 2.10 实现 IPC handlers：coin_lists CRUD（创建、更新、查询列表）
- [ ] 2.11 实现 IPC handlers：settings get/set

## 3. LLM 适配层

- [ ] 3.1 定义统一 LLM 接口（ChatMessage, LLMAdapter, stream 方法）
- [ ] 3.2 实现 OpenAI Compatible 适配器（覆盖 OpenAI, DeepSeek, Kimi，可配置 baseURL/model）
- [ ] 3.3 实现 Anthropic 适配器（Claude Messages API，流式输出）
- [ ] 3.4 实现 Google Generative AI 适配器（Gemini，流式输出）
- [ ] 3.5 实现 LLM 工厂函数（根据用户设置的 provider 创建对应适配器）
- [ ] 3.6 实现 IPC handlers：LLM 流式调用（main process 调 API，通过 IPC 逐块推送到 renderer）

## 4. Prompt 管理与上下文构造

- [ ] 4.1 编写策略生成 system prompt（Strategy 基类规范、可用指标、交易方法、参数优化格式）
- [ ] 4.2 编写选币生成 system prompt（Screener 基类规范、数据限制 1h/4h/1d、元数据字段）
- [ ] 4.3 编写策略优化 system prompt（分析回测结果、识别问题、生成改进代码）
- [ ] 4.4 实现上下文构造器（context-builder）：回测结果智能摘要（核心指标 + 亏损最大 N 笔 + 连续亏损 + 多空对比）
- [ ] 4.5 实现上下文裁剪：旧消息压缩为摘要，控制 token 预算在模型上限 70% 内
- [ ] 4.6 实现意图识别辅助：根据当前 Tab 和对话内容注入对应的 system prompt

## 5. 远程 API 客户端

- [ ] 5.1 实现 backtest-engine API 客户端（baseURL 可配置，默认 http://localhost:8081）
- [ ] 5.2 实现回测任务提交（POST /api/backtest/start）
- [ ] 5.3 实现回测进度轮询（GET /api/backtest/status/:task_id，3 秒间隔）
- [ ] 5.4 实现回测结果获取（GET /api/backtest/result/:task_id）
- [ ] 5.5 实现选币任务提交（POST /api/screener/start）
- [ ] 5.6 实现选币结果获取（GET /api/screener/result/:task_id）
- [ ] 5.7 实现策略代码提交（POST /api/strategies）
- [ ] 5.8 实现连接状态检测（健康检查 + 断线重连指示）

## 6. 状态管理 (Zustand)

- [ ] 6.1 实现 conversationStore（当前对话、消息列表、AI 流式输出状态）
- [ ] 6.2 实现 strategyStore（当前策略、策略列表、版本链）
- [ ] 6.3 实现 coinListStore（当前选币列表、手动增删操作）
- [ ] 6.4 实现 backtestStore（回测状态、进度、当前结果、历史结果）
- [ ] 6.5 实现 settingsStore（API Key、默认模型、远程服务地址）
- [ ] 6.6 实现 appStore（回测就绪状态计算：策略 ✓ + 选币 ✓）

## 7. 基础 UI 组件

- [ ] 7.1 实现 App 主布局（左侧主内容 + 右侧 AI 面板，面板宽度可拖拽，可折叠）
- [ ] 7.2 实现顶部导航栏（Tab: 选币/策略/回测，设置入口）
- [ ] 7.3 实现设置页面（API Key 配置、模型选择、远程服务地址、连接状态）

## 8. AI 对话面板

- [ ] 8.1 实现对话消息列表组件（用户消息 + AI 消息，支持 Markdown 渲染）
- [ ] 8.2 实现消息输入框（发送按钮、Enter 发送、Shift+Enter 换行）
- [ ] 8.3 实现流式输出显示（逐字渲染 + 打字指示器 + 停止按钮）
- [ ] 8.4 实现策略摘要卡片组件（策略类型、条件、参数，嵌入对话流中）
- [ ] 8.5 实现代码块渲染（Python 语法高亮）
- [ ] 8.6 实现对话历史列表（侧边栏或下拉，加载历史对话）
- [ ] 8.7 实现「AI 优化」快捷按钮（回测完成后出现，自动注入上下文）

## 9. 选币功能页

- [ ] 9.1 实现选币结果列表组件（币种名、评分、排名、24h 交易额，按评分排序）
- [ ] 9.2 实现手动移除币种功能
- [ ] 9.3 实现手动添加币种功能（搜索框 + 添加按钮）
- [ ] 9.4 实现选币列表保存/加载功能
- [ ] 9.5 实现选币执行流程（AI 生成代码 → 提交远程 → 轮询结果 → 展示列表）

## 10. 策略管理页

- [ ] 10.1 实现策略列表页（名称、类型、状态、收藏、最近回测摘要、时间）
- [ ] 10.2 实现策略筛选（全部/收藏/有效/无效 + 关键词搜索）
- [ ] 10.3 实现策略操作（查看详情、发起回测、复制、标记有效/无效、收藏/取消收藏）
- [ ] 10.4 实现策略代码预览（Python 语法高亮，只读模式）
- [ ] 10.5 实现策略版本历史（展示版本链，可回退查看旧版本）

## 11. 回测结果展示

- [ ] 11.1 实现回测准备状态指示器（策略 ✅/⬜ + 选币 ✅/⬜ + 开始按钮）
- [ ] 11.2 实现预回测结果页（K线图 + 信号标注 + 简要指标 + 交易列表 + 确认/修改按钮）
- [ ] 11.3 实现深度回测进度页（回测中指示器 + 进度信息）
- [ ] 11.4 实现核心指标卡片组件（6 个核心指标 + ALL/LONG/SHORT 切换）
- [ ] 11.5 实现组合权益曲线图（TradingView Lightweight Charts Line Series）
- [ ] 11.6 实现组合回撤曲线图
- [ ] 11.7 实现各币种表现排名表（可排序，点击进入详情）
- [ ] 11.8 实现月度收益热力图组件
- [ ] 11.9 实现交易列表组件（含币种/方向筛选，盈亏着色）

## 12. K线图组件

- [ ] 12.1 集成 TradingView Lightweight Charts
- [ ] 12.2 实现 K 线图基本渲染（OHLC 蜡烛图，缩放/平移/十字光标）
- [ ] 12.3 实现信号标注（Markers API：▲ 做多、▼ 做空、● 盈利平仓、● 亏损平仓）
- [ ] 12.4 实现指标线叠加（SMA/EMA 等 Line Series）
- [ ] 12.5 实现副图指标（RSI/MACD 等独立坐标面板）
- [ ] 12.6 实现交易列表点击联动（点击交易 → K线图定位到该时间段并高亮）

## 13. 单币种详情页

- [ ] 13.1 实现单币种详情路由（从汇总页点击币种进入）
- [ ] 13.2 实现单币种 K 线图 + 信号标注
- [ ] 13.3 实现单币种权益曲线 + 回撤曲线
- [ ] 13.4 实现单币种指标卡片
- [ ] 13.5 实现单币种交易列表（与 K 线图联动）
- [ ] 13.6 实现返回汇总导航

## 14. 集成与测试

- [ ] 14.1 端到端流程：首次打开 → 设置 API Key → AI 对话选币 → 手动增删 → 保存
- [ ] 14.2 端到端流程：AI 对话生成策略 → 策略摘要确认 → 预回测 → 查看信号点
- [ ] 14.3 端到端流程：确认预回测 → 深度回测 → 查看汇总 → 查看单币种详情 → 交易联动
- [ ] 14.4 端到端流程：AI 优化 → 回测结果注入 → 生成新版本 → 重新回测
- [ ] 14.5 验证策略管理：收藏、有效/无效标记、筛选、版本链追溯
- [ ] 14.6 验证 5 家 LLM 适配器均可正常流式对话
- [ ] 14.7 打包测试：macOS .dmg 和 Windows .exe 安装包生成验证
