## ADDED Requirements

### Requirement: ClawChart 组件族

`desktop-client` SHALL 在 `src/components/primitives/ClawChart/` 下提供一组 React 组件,封装 `lightweight-charts` 库,供后续所有涉及 K 线、overlay、equity、drawdown、mini 图表的屏幕复用。

最小族:
- `ClawChart.Candles` — 单 pane 蜡烛图 + 可选 overlay(SMA/EMA/BB 线)+ 可选 volume 子 pane + 可选 trade markers
- `ClawChart.Mini` — 非交互小折线(sparkline),用于 Watchlist / Strategy Card / Multi-Symbol Grid
- `ClawChart.Equity` — 线图,用于 equity 曲线或 drawdown 曲线,支持与另一条曲线叠加
- `ClawChart.Markers` — 叠加在 `Candles` 上的 entry/exit 箭头

所有组件 SHALL 遵守:
- Props 声明式(`data`、`overlays`、`markers`、`height` 等),内部状态不通过 ref 暴露
- 主题切换自动重绘(监听 `<html data-theme>` 变化)
- 容器 resize 自动重绘
- 组件卸载时清理 chart 实例

#### Scenario: ClawChart.Candles 响应数据 prop 变化

- **WHEN** `<ClawChart.Candles data={candles1} />` 挂载
- **THEN** 内部调用 `chart.addCandlestickSeries().setData(candles1)`
- **WHEN** prop 变为 `data={candles2}`(不同引用)
- **THEN** 内部 `series.setData(candles2)`,图表不重建只刷数据

#### Scenario: 主题切换重绘

- **WHEN** 用户切换 Light → Dark,`<html data-theme="dark">`
- **THEN** 所有挂载的 ClawChart 实例 SHALL 读取新的 CSS 变量值
- **THEN** 重绘时 `chart.applyOptions` 更新 `layout.background`、`layout.textColor`、`grid.vertLines.color`、`grid.horzLines.color`

#### Scenario: 容器尺寸变化

- **WHEN** 组件容器宽度变化(例如 AI panel 展开/收起)
- **THEN** ResizeObserver 触发 `chart.resize(width, height)`

### Requirement: Watchlist 组件

`desktop-client` SHALL 提供 `<Watchlist items focused onFocus />` 组件,对应 Pencil `RailRow` / `RailRow8` 复用单元的实际渲染。

每行: symbol + mini chart + 当前价格 + 24h 涨跌百分比。focused 行视觉 highlight。点击触发 `onFocus(symbol)`。

组件 SHALL 为 controlled(无内部数据获取),数据由 parent 通过 `items` prop 传入。

#### Scenario: 展示 15 个 symbol 的 watchlist

- **WHEN** `<Watchlist items={[15 items]} focused="BTC_USDT" />`
- **THEN** 渲染 15 行,`BTC_USDT` 行 fill 为 `$surface-tertiary`
- **THEN** 每行包含一个 `ClawChart.Mini`

#### Scenario: 键盘上下箭头导航

- **WHEN** Watchlist 获得 focus,用户按 ↓
- **THEN** `onFocus` 以下一 symbol 调用
- **WHEN** 按 ↑ 从列表顶
- **THEN** wrap 到列表底

### Requirement: WorkspaceShell 布局原语

`desktop-client` SHALL 提供 `<WorkspaceShell>` 组件,对应 Pencil Workspace 类屏幕(Strategy Design / Preview / Deep)共享的三栏布局。插槽:

- `topbar` — 顶部 52-56px 条带(标题、进度、主 CTA)
- `leftRail?` — 左侧窄栏,通常放 Watchlist(180-220px 宽)
- `main` — 主区域(chart + 下部信息面板)
- `rightRail?` — 右侧 AI persona 面板(320-400px 宽,可折叠)

#### Scenario: 展开布局

- **WHEN** 使用 `<WorkspaceShell topbar={...} leftRail={...} main={...} rightRail={...} />`
- **THEN** 渲染为 `topbar(height=52) / leftRail + main + rightRail`,各栏使用 flex layout
- **THEN** rightRail 可通过上层 state 控制显示/隐藏

#### Scenario: 省略 leftRail

- **WHEN** `<WorkspaceShell topbar={...} main={...} rightRail={...} />`(无 leftRail)
- **THEN** main 占据整个左半部分,无空白栏

### Requirement: AIPersonaShell 统一 AI 面板

`desktop-client` SHALL 提供 `<AIPersonaShell persona context>` 组件,作为 5 种 AI persona(`strategist`、`signal-review`、`optimlens`、`screener`、`trade-analysis`)共用的右侧面板壳。

本 change 仅实现 shell 本身 + `strategist` persona 的 stub 绑定(复用现有 promptMode 通用逻辑)。其他 persona 的 system prompt、intro message、结构化输出解析由各自 screen change 添加。

Shell SHALL 提供子组件:`<AIPersonaShell.Intro />`、`<AIPersonaShell.Transcript />`、`<AIPersonaShell.Composer />`。persona 决定 composer 是否显示(例如 `trade-analysis` 为 read-only)。

#### Scenario: strategist persona 渲染

- **WHEN** `<AIPersonaShell persona="strategist" />`
- **THEN** 头部显示 "AI 策略师" 标题
- **THEN** Intro 渲染 strategist 的欢迎语
- **THEN** Composer 可见可输入

#### Scenario: trade-analysis persona read-only

- **WHEN** `<AIPersonaShell persona="trade-analysis" context={{ trade_id }} />`
- **THEN** Composer 隐藏(不显示输入框)
- **THEN** Transcript 只显示自动生成的解释

### Requirement: MetricsGrid 响应式指标网格

`desktop-client` SHALL 提供 `<MetricsGrid metrics columns? />` 组件,对应 Pencil `MetTile` 复用单元在 Deep Backtest / Symbol Detail / Strategy Card 中的集合展示。

每个 metric 对象: `{ label: string, value: string | number, unit?: string, delta?: { value: number, direction: "up" | "down" }, emphasis?: "large" }`。

布局使用 CSS grid + `auto-fit`,大屏多列小屏折行。`emphasis: "large"` 的 tile 占双列宽度和大字号。

#### Scenario: 渲染 10 个 metrics

- **WHEN** 传入 10 个 metric 对象,`columns="auto"`
- **THEN** 在 1440px 宽度下渲染 5 列 × 2 行
- **THEN** `emphasis: "large"` 的 tile 占 2 列宽度

#### Scenario: 带 delta 的 tile 着色

- **WHEN** metric `delta: { value: 2.5, direction: "up" }`
- **THEN** delta 用 `$accent-green` 着色,前缀 `+`
- **WHEN** `direction: "down"`
- **THEN** delta 用 `$accent-red` 着色

### Requirement: Workspace 导航状态机

`desktop-client` SHALL 提供 `workspaceStore` zustand 切片,管理 Workspace 内部的三态导航(`design` → `preview` → `deep`)及其上下文。

状态: `{ mode: "design" | "preview" | "deep", currentStrategyId: string | null, currentTaskId: string | null, focusedSymbol: string | null }`。

Actions: `enterPreview(strategyId, taskId)`、`enterDeep(taskId)`、`back()`、`focus(symbol)`、`reset()`。

#### Scenario: 从 design 进入 preview

- **WHEN** 用户在 Strategy Design 点击 "Run Preview",代码调用 `workspaceStore.enterPreview(stratId, taskId)`
- **THEN** `mode === "preview"`,`currentStrategyId === stratId`,`currentTaskId === taskId`

#### Scenario: 从 preview 返回 design

- **WHEN** `mode === "preview"`,调用 `back()`
- **THEN** `mode === "design"`,`currentTaskId` 保持(不清除,便于重新预览时秒读 cache)

#### Scenario: 从 preview 进入 deep

- **WHEN** `mode === "preview"`,调用 `enterDeep(newTaskId)`(新任务,deep 模式 backtest)
- **THEN** `mode === "deep"`,`currentTaskId = newTaskId`

### Requirement: AppRoute 路由类型 + App 改造

`desktop-client` SHALL 将 `appStore.currentTab: string` 替换为 `appStore.route: AppRoute`,其中 `AppRoute` 是 discriminated union:

```
type AppRoute =
  | { kind: "screener" }
  | { kind: "strategies" }
  | { kind: "workspace"; strategyId?: string }
  | { kind: "symbol-detail"; symbol: string; returnTo: AppRoute }
  | { kind: "settings"; section?: string };
```

`App.tsx` SHALL 按 `route.kind` 分支渲染。迁移期间 `appStore.currentTab` 保留为 getter 兼容旧代码。

#### Scenario: 路由切换到 workspace

- **WHEN** `appStore.route = { kind: "workspace" }`
- **THEN** App 渲染 WorkspaceShell(此 change 暂渲染占位内容)
- **THEN** 同时 `workspaceStore.mode` 决定内部 design/preview/deep 子态

#### Scenario: 从任意页面下钻到 symbol-detail

- **WHEN** 调用 `navigate({ kind: "symbol-detail", symbol: "BTC_USDT", returnTo: <prevRoute> })`
- **THEN** App 渲染 SymbolDetail 占位
- **WHEN** 用户点击"返回"
- **THEN** 路由恢复到 `returnTo`

### Requirement: 设计 token 对齐

`desktop-client/tailwind.config.js` SHALL 在 `theme.spacing`、`theme.borderRadius`、`theme.fontFamily` 上精确复制 Pencil 的 token 定义:

- spacing: `0 / px / 0.5 / 1 / 1.5 / 2 / 3 / 4 / 5 / 6 / 8 / 10 / 12 / 16` 对应 `0 / 1px / 2 / 4 / 6 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64`
- borderRadius: `sm: 6px, md: 8px, lg: 12px, xl: 16px, full: 9999px`
- fontFamily: `body: Inter, heading: Geist, data: Geist Mono`

非该 scale 内的 Tailwind utility(例如 `p-7` = 28px 不在 scale 中) SHALL 被 ESLint 规则警告(轻度,不报错,防止累积新漂移)。

#### Scenario: 现有组件使用非 scale 值

- **WHEN** 运行 `pnpm lint`,某文件包含 `<div className="p-7">`
- **THEN** ESLint 自定义规则 `claw/tailwind-spacing-scale` 报 warning,建议 `p-6`(24px)或 `p-8`(32px)

#### Scenario: 字体加载

- **WHEN** 应用启动
- **THEN** `index.html` 已 `<link rel="preload">` 三种字体的 woff2
- **THEN** Tailwind 类 `font-heading` / `font-body` / `font-data` 分别映射到 Geist / Inter / Geist Mono

### Requirement: Playwright 视觉回归测试基础

`desktop-client/e2e/visual/` SHALL 存在 Playwright 视觉回归测试环境:

- Playwright 驱动 **Vite dev server**(不启动 Electron),URL `http://localhost:5173`
- MSW `happy` profile 提供一致数据
- Viewport 固定 `1440×900`,Chromium headless
- 截图存 `__screenshots__/<spec>/<platform>/<name>.png`

本 change 仅产出 **blank shell 快照**:
- `shell-empty-dark.png`:`WorkspaceShell` 无内容 + dark 主题
- `shell-empty-light.png`:同上 light 主题
- `shell-with-ai-collapsed-dark.png`:rightRail 折叠

后续每个 screen change 添加自己的 `.spec.ts` 和快照。

#### Scenario: 首次运行生成 baseline

- **WHEN** `pnpm test:visual:update`
- **THEN** 每个测试用例首次写入快照 PNG
- **THEN** commit 这些 PNG

#### Scenario: 后续运行对比

- **WHEN** `pnpm test:visual`
- **THEN** 每个测试截图与 baseline 做像素差对比
- **THEN** diff > 0.2 阈值时失败,输出 diff PNG 到 `test-results/`

### Requirement: Pencil ↔ 代码对齐文档

`docs/design-alignment.md` SHALL 存在,对每个 Pencil reusable component(ID + name)列出对应的代码组件路径。本 change 建立骨架 + 本 change 涉及的原语;后续每个 screen change 更新一行。

#### Scenario: 文档建立

- **WHEN** 查看 `docs/design-alignment.md`
- **THEN** 存在一张表,列头为 `Pencil ID | Pencil Name | Code Component | Status`
- **THEN** 至少包含 `RailRow / RailRow8` → `Watchlist`,`MetTile` → `MetricsGrid`,Workspace 顶栏 → `WorkspaceShell.topbar` 等本 change 已实现的映射
