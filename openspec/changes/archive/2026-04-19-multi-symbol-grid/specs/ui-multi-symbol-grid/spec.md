## ADDED Requirements

### Requirement: CrossSymbolGrid 组件

`desktop-client/src/components/workspace/CrossSymbolGrid.tsx` SHALL 实现 Pencil frame `nvBnq`(dark)+ `wBWkN`(light)的多 symbol 网格视图:

- 输入: `per_symbol: Record<string, SymbolResult>`
- 输出: 响应式网格 2×2 / 3×3 / 4×4,按 symbol 数量自适应
- 每 cell:symbol 代号 + 总回报 pct + `ClawChart.Mini` of `per_symbol[sym].equity_curve`
- Cell 单击: `workspaceStore.focusedSymbol = sym; setViewMode("chart")`
- Cell 双击: `appStore.navigate({ kind: "symbol-detail", symbol: sym, returnTo: <current>, backtestTaskId })`

#### Scenario: 9 symbols 渲染 3×3

- **WHEN** per_symbol 有 9 个 keys
- **THEN** CrossSymbolGrid 3×3 布局
- **THEN** 每 cell 显示 symbol + return% + mini chart

#### Scenario: 3 symbols 渲染 2×2(4 cell,1 占位)

- **WHEN** per_symbol 有 3 个 keys
- **THEN** 2×2 布局,第 4 cell 留空或隐藏

#### Scenario: 窄屏 fallback

- **WHEN** 视口宽 < 1000px
- **THEN** 强制 2×2,多余 symbol 下方纵向追加 cell,可滚动

### Requirement: View-mode 切换

`workspaceStore` SHALL 新增字段 `viewMode: "chart" | "grid"` + action `setViewMode(mode)`。该值 SHALL 持久化到 `localStorage` key `workspace.viewMode`。

Workspace Preview 和 Deep 两个屏幕的主区 SHALL 根据 `viewMode` 条件渲染:

- `chart`: 当前单 chart + trade markers + 下方 tabs(现有行为)
- `grid`: CrossSymbolGrid 填充主区上半部,下方 tabs 保留

#### Scenario: 切换到 grid

- **WHEN** 用户在 Preview 点击 topbar `Grid` chip
- **THEN** `workspaceStore.viewMode = "grid"`
- **THEN** 主 chart 被 CrossSymbolGrid 替换
- **THEN** localStorage 写入 "grid"

#### Scenario: 跨屏幕保留

- **WHEN** viewMode=grid,用户从 Preview 进入 Deep(Confirm + Run Deep)
- **THEN** Deep 屏也渲染 grid 视图(沿用用户偏好)

### Requirement: ViewModeSwitcher 组件

`src/components/workspace/ViewModeSwitcher.tsx` SHALL 提供一对 chip `[Chart] [Grid]`,样式匹配 Pencil 拱顶按钮(`tb9` 中的分段控件)。当前 mode 高亮。

#### Scenario: 渲染

- **WHEN** 放置在 Preview 或 Deep 的 topbar 右侧
- **THEN** 显示两个 chip,当前 mode 高亮 `$surface-tertiary`
- **THEN** 点击另一个 chip 立即切换 mode(无动画 delay)

### Requirement: 网格排序

CrossSymbolGrid 顶部 SHALL 有一个 "Sort by" dropdown,选项:

- Return(desc,default)
- Return(asc)
- Alphabetical

改变排序后,cells 重新排列(animation transition 200ms 轻微)。

#### Scenario: 切换排序

- **WHEN** 用户选 "Alphabetical"
- **THEN** cells 重新按 symbol 字母顺序排列
- **THEN** 排序偏好不持久化(每次进入 grid 都默认 Return desc)

### Requirement: 视觉回归快照

`e2e/visual/multi-symbol-grid.spec.ts` SHALL 覆盖:

- `dark-3x3.png`、`light-3x3.png`:9 symbols 3×3 默认排序
- `dark-2x2-small.png`:3 symbols 窄屏 fallback

#### Scenario: 3 baseline

- **WHEN** `pnpm test:visual multi-symbol-grid.spec.ts`
- **THEN** 3 baseline 匹配
