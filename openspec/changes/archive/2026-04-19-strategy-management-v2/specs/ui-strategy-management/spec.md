## ADDED Requirements

### Requirement: Strategy Management 屏幕

`desktop-client` SHALL 提供 `src/screens/StrategiesScreen.tsx`,实现 Pencil frame `pGjNd`(dark)+ `PLr19`(light)的像素级渲染,替换现有 `src/pages/StrategiesPage.tsx`。路由 `route.kind === "strategies"` 渲染此屏。

布局:
- Topbar: "Strategies" 标题 + 搜索 + "New Strategy" CTA
- Main: 3 列响应式网格 of `StrategyCard`,上方 tabs(All / Favorites / Active / Archived)
- RightRail: `AIPersonaShell persona="strategy-history"` 显示当前选中卡片的版本列表

#### Scenario: 屏幕渲染

- **WHEN** `route.kind === "strategies"`
- **THEN** 渲染 StrategiesScreen
- **THEN** `cremote.listStrategies({ limit: 50 })` 在挂载时触发
- **THEN** 返回后 strategies 填充网格,默认 tab "All"

#### Scenario: 切换 tab

- **WHEN** 用户点 "Favorites" tab
- **THEN** 网格只显示 `is_favorite === true` 的 cards
- **THEN** URL / store 不改变(纯客户端过滤)

### Requirement: StrategyCard 卡片组件

`src/components/strategy/StrategyCard.tsx` SHALL 实现:

- 头部: name + version chip(`v{current_version}`)+ status + favorite star
- 中部: `ClawChart.Mini` 展示该 strategy 最近一次 backtest 的 equity 曲线
- 底部: 总回报 pct(色)+ 参数概要 + tags
- 操作: whole-card click → Open,favorite star toggle,三点菜单 → Duplicate / Archive

#### Scenario: 卡片含最近 backtest

- **WHEN** strategy 有历史 backtest(`cremote.listBacktestHistory({ strategy_id, limit: 1 })` 有结果)
- **THEN** 卡片中部显示 mini equity 曲线(来自最近一次 summary.equity_curve)
- **THEN** 底部显示回报 pct

#### Scenario: 卡片无 backtest

- **WHEN** 从未运行过 backtest
- **THEN** 卡片中部显示 "No backtests yet" 占位
- **THEN** 回报 pct 部分空白

#### Scenario: Open 跳转到 Workspace Design

- **WHEN** 用户 click whole card
- **THEN** `appStore.navigate({ kind: "workspace", strategyId })` + `workspaceStore.enterDesign(strategyId)`
- **THEN** Workspace Design 屏接管

### Requirement: Strategy History 面板

RightRail 的 `strategy-history` persona SHALL 显示选中 strategy 的版本列表(newest first),使用 `cremote.listStrategyVersions`。

每个版本项:
- `v{N}` chip + summary 文本
- 时间戳(人类可读 relative)
- 分支标记(`parent_version !== current - 1`)显示 "fork from v{parent}"
- 操作按钮: `Revert` / `Duplicate and improve`

Composer(输入框)SHALL 隐藏(`strategy-history` persona 不接受用户输入)。

#### Scenario: 显示版本历史

- **WHEN** 用户点击某个 card,`strategyStore.selectedId = strategyId`
- **THEN** RightRail 调 `cremote.listStrategyVersions({ strategy_id: selectedId, limit: 50 })`
- **THEN** 渲染版本列表,最新在前
- **THEN** 每版本有 Revert / Duplicate and improve 按钮

#### Scenario: 点击 Revert

- **WHEN** 用户点某旧版本的 Revert
- **THEN** 弹 confirm dialog
- **WHEN** 确认
- **THEN** 调 `cremote.createStrategyVersion({ strategy_id, body: { code: <old code>, summary: "Revert to v{N}", parent_version: <current> } })`
- **THEN** 新版本追加到列表顶部
- **THEN** 列表刷新显示

#### Scenario: 点击 Duplicate and improve

- **WHEN** 用户点版本的 Duplicate and improve
- **THEN** 调 `cremote.createStrategy({ name: "{orig} (copy)", code_type, code: <this version>, params_schema })` 创建新 strategy
- **THEN** `appStore.navigate({ kind: "workspace", strategyId: newId })` + `workspaceStore.enterDesign(newId)`
- **THEN** 返回到 Workspace Design

### Requirement: 卡片级 actions

StrategyCard SHALL 支持以下 actions,不触发 navigation:

- **Favorite toggle**: 星标点击 → `cremote.updateStrategyFavorite(id, newValue)` 或等效本地 store action。stopPropagation。
- **Archive toggle**: 三点菜单 → Archive。切换 `status` 至 `inactive`(或 `archived`,取决于 backend)。卡片立即从 Active tab 消失。
- **Duplicate**: 三点菜单 → Duplicate。创建副本 + 跳转 Design。

#### Scenario: toggle favorite

- **WHEN** 用户点星标
- **THEN** 乐观更新 UI(星标立即变色)
- **THEN** 后台调用 API 同步
- **THEN** 失败时回滚 + toast

### Requirement: 搜索与过滤

Topbar 搜索框 SHALL 按 name substring 过滤当前网格(不区分大小写)。Tab SHALL 按 `status` + `is_favorite` 过滤。两者叠加。

#### Scenario: 搜索 "SMA"

- **WHEN** 用户输入 "SMA"
- **THEN** 网格只显示 name 包含 "SMA"(不区分大小写)的 cards
- **THEN** 其他 tab 过滤条件叠加

### Requirement: New Strategy CTA

Topbar "New Strategy" 按钮 SHALL `appStore.navigate({ kind: "workspace" })` + `workspaceStore.reset()`(清空 currentStrategyId + draft),用户落在 Workspace Design 的空态,可以从 0 开始与 AI Strategist 对话创建。

#### Scenario: 从空态创建新策略

- **WHEN** 用户点 "New Strategy"
- **THEN** route 切到 workspace,mode=design,workspaceStore 清空
- **THEN** Workspace Design 的 draft card 显示 "No strategy draft yet"
- **THEN** 用户开始与 AI 对话,首次生成后自动 `createStrategy`

### Requirement: 视觉回归快照

`e2e/visual/strategy-management.spec.ts` SHALL 覆盖:

- `dark-empty.png`、`light-empty.png`:无 strategies
- `dark-grid.png`、`light-grid.png`:3×3 strategies 展示(MSW 固定 fixture)
- `dark-with-history.png`:选中某 card 后 RightRail 版本列表

#### Scenario: 5 baseline

- **WHEN** `pnpm test:visual strategy-management.spec.ts`
- **THEN** 全部 baseline 比对通过
