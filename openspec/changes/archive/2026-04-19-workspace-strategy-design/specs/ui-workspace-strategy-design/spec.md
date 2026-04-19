## ADDED Requirements

### Requirement: Strategy Design 工作台屏幕

`desktop-client` SHALL 提供 `src/screens/workspace/StrategyDesign.tsx` 组件,实现 Pencil frame `Q6cKp`(dark)+ `MZuaq`(light)的像素级等价渲染。使用 `WorkspaceShell`、`ClawChart.Candles`、`AIPersonaShell` 等 `ui-foundation` 原语。

屏幕 SHALL 在 `route.kind === "workspace" && workspaceStore.mode === "design"` 时被渲染。

#### Scenario: 进入 Strategy Design 屏幕

- **WHEN** 用户点击 TopBar 的 "Backtest" 或 "Strategies" 页的策略卡片 "Open"
- **THEN** `appStore.route = { kind: "workspace", strategyId? }`、`workspaceStore.mode = "design"`
- **THEN** StrategyDesign 屏幕渲染
- **THEN** 主区大 `ClawChart.Candles` 显示 `workspaceStore.focusedSymbol`(默认 BTC_USDT)的 1h K 线

#### Scenario: 视觉回归 dark + light baseline

- **WHEN** 运行 `pnpm test:visual workspace-strategy-design`
- **THEN** 与 `__screenshots__/workspace-strategy-design/dark.png` + `light.png` 对比通过(阈值 0.2)

### Requirement: AI Strategist persona 完整接线

`AIPersonaShell` 的 `strategist` persona SHALL 在本 change 中完整绑定:

- 系统 prompt 位于 `src/services/prompt/personas/strategist.ts`,包含:
  - 当前 `focusedSymbol`、interval、已选指标 context
  - 输出格式指令:prose + ```json summary``` 块 + ```python``` 块
  - 语言偏好(`replyLang`)
- 解析器 `parsers.parseStrategistOutput(raw)` 返回 `{ prose, summary?, code? }`
- 解析成功时,`StrategySummaryCard` 内联在 assistant 消息中渲染
- 每次成功生成,触发 draft 持久化(见下一个 requirement)

#### Scenario: AI 生成合规输出

- **WHEN** 用户提问 "design an SMA crossover strategy"
- **THEN** AI 流式响应依次:prose → ```json summary {...} ``` → ```python class MyStrategy(Strategy):... ```
- **THEN** 聊天 UI 渲染 prose paragraph → `StrategySummaryCard` → 可折叠 `CodeBlock`

#### Scenario: AI 输出 malformed summary JSON

- **WHEN** AI 返回 prose + 无效 JSON 块 + code
- **THEN** 解析器捕获错误,仅渲染 prose + code,不崩溃
- **THEN** 不触发 draft 持久化

#### Scenario: 切换 focusedSymbol 重置 prompt context

- **WHEN** 用户在 topbar 切换 symbol 到 ETH_USDT
- **THEN** 系统 prompt 下一轮对话 context 更新为 ETH_USDT
- **THEN** 聊天里显示小 notice "Symbol switched to ETH_USDT; previous advice may not apply"

### Requirement: Strategy draft 自动保存为新版本

每次 strategist persona 返回可解析的 summary + code,前端 SHALL 自动:

1. 若无 `currentStrategyId` → `cremote.createStrategy({ name, code_type: "strategy", code })` 获取 id
2. `cremote.createStrategyVersion({ strategy_id, body: { code, summary: "..." } })` 追加新版本
3. 更新 `workspaceStore.currentStrategyId` + `workspaceDraftStore.version`

#### Scenario: 首次设计自动建策略 + v1

- **WHEN** 空的 design session 下用户首次生成 strategy
- **THEN** 发起 `createStrategy` + `createStrategyVersion`
- **THEN** `workspaceStore.currentStrategyId` 填充
- **THEN** Strategies 页稍后刷新可见该新策略

#### Scenario: 迭代保存 v2, v3, ...

- **WHEN** 同一 design session 内,AI 再次生成 strategy
- **THEN** 仅调用 `createStrategyVersion`,不重复创建 strategy
- **THEN** `parent_version` 默认当前 `current_version`(线性 history)

### Requirement: Strategy draft 卡片渲染与编辑

主区下方的 "Strategy draft" 卡片 SHALL 显示最新 draft 的结构化摘要:策略名、interval、symbols、long/short 条件、params 表、leverage。

- 条件、interval、symbols、leverage 为只读
- Params 表格每行 `key = value`,value 是 inline numeric input,debounce 800ms 后写回 `workspaceDraftStore.params`
- 卡片右上角显示当前 version(`v3`)

#### Scenario: 编辑 param 值

- **WHEN** 用户把 `fast = 10` 改成 `fast = 15`,等待 800ms
- **THEN** `workspaceDraftStore.params.fast === 15`
- **THEN** 对应的 code 中 `params` default 更新(若 AI 使用 `self.param('fast', 10)` 模式)

#### Scenario: 无 draft 时卡片显示空态

- **WHEN** 首次进入 Design 屏幕,未生成任何 strategy
- **THEN** 卡片显示 "No strategy draft yet. Chat with AI to start."

### Requirement: Run Preview CTA

Topbar SHALL 有 "Run Preview" 按钮,状态机:

- **Disabled**: `!workspaceDraftStore.code` (无 draft)
- **Ready**: 有 draft,`bg-accent-primary` 紫色
- **Running**: 点击后变 "…"

点击 Ready 状态的按钮 SHALL:
1. 调用 `cremote.startBacktest({ code, config: { symbols: [focusedSymbol], mode: "preview" } })`
2. 成功取得 `task_id` 后,`workspaceStore.enterPreview(strategyId, taskId)`
3. 切换 `mode` 后 UI 转到 Preview 工作台屏幕(ships in change #5)

#### Scenario: 点击 Run Preview 触发回测

- **WHEN** 用户在有 draft 的状态点击 Run Preview
- **THEN** 按钮变 "…"
- **THEN** 500ms 内 backend(或 MSW)返回 `{ task_id }`
- **THEN** `workspaceStore.mode === "preview"`,Preview 工作台 takes over

#### Scenario: backtest start 返回错误

- **WHEN** `cremote.startBacktest` 返回 `COMPLIANCE_FAILED`
- **THEN** 按钮恢复 Ready 状态
- **THEN** 在 draft 卡片下方显示红色错误条 + `details.violations` 列表

### Requirement: 视觉回归快照

`desktop-client/e2e/visual/workspace-strategy-design.spec.ts` SHALL 存在,捕获下述 4 个快照,分别覆盖 dark/light 主题 × empty/with-draft 状态,每个快照 SHALL 使用 MSW `happy` profile 的固定数据以稳定复现。

#### Scenario: 4 个 baseline 快照存在且比对通过

- **WHEN** 运行 `pnpm test:visual workspace-strategy-design.spec.ts`
- **THEN** 存在 `__screenshots__/workspace-strategy-design/{dark-empty, dark-with-draft, light-empty, light-with-draft}.png`
- **THEN** 每个快照与其 baseline 对比 diff 比例 ≤ 0.2
- **THEN** 无快照缺失或额外文件
