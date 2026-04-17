## ADDED Requirements

### Requirement: 三档主题模式

系统 SHALL 支持三档主题模式：Dark、Light、Auto。Auto 模式下跟随操作系统的 `prefers-color-scheme` 设置。

#### Scenario: 默认启动跟系统

- **WHEN** 用户首次启动应用
- **THEN** 主题默认设置为 `Auto`
- **THEN** 系统读取操作系统主题偏好，渲染对应配色
- **THEN** `ui.theme` 设置保存为 `"auto"`

#### Scenario: 切换到 Dark

- **WHEN** 用户在设置中选择 Dark 主题
- **THEN** 整个应用立即切换到深色配色（无需重启）
- **THEN** `ui.theme` 持久化为 `"dark"`

#### Scenario: 切换到 Light

- **WHEN** 用户在设置中选择 Light 主题
- **THEN** 整个应用立即切换到浅色配色
- **THEN** `ui.theme` 持久化为 `"light"`

#### Scenario: Auto 模式下系统主题变化

- **WHEN** 主题为 Auto 且操作系统从浅色切换到深色
- **THEN** 应用自动跟随切换，无需用户操作
- **THEN** `matchMedia('(prefers-color-scheme: dark)')` 的变化事件被监听

### Requirement: 主题 Token 体系

系统 SHALL 通过 CSS 变量实现 token 驱动的配色体系。所有颜色属性 SHALL 引用 token，禁止硬编码十六进制颜色。

#### Scenario: 主题 Token 覆盖范围

- **WHEN** 设计或实现 UI 组件
- **THEN** 使用以下语义化 token：
  - 表面层：`--surface-primary`, `--surface-secondary`, `--surface-tertiary`, `--surface-inverse`
  - 文本：`--fg-primary`, `--fg-secondary`, `--fg-muted`, `--fg-inverse`
  - 边框：`--border-subtle`, `--border-strong`
  - 强调色：`--accent-primary`, `--accent-primary-dim`, `--accent-green`, `--accent-green-dim`, `--accent-red`, `--accent-red-dim`, `--accent-yellow`

#### Scenario: 主题切换通过 data 属性

- **WHEN** 主题发生切换
- **THEN** `<html>` 或 `<body>` 的 `data-theme` 属性被更新为 `"dark"` 或 `"light"`
- **THEN** CSS 规则 `[data-theme="light"] { ... }` 激活浅色 token 值
- **THEN** 无需 re-render 组件，CSS 变量自动生效

#### Scenario: Dark 与 Light 主题色值

- **WHEN** 主题为 Dark
- **THEN** `--surface-primary = #0A0A0A`, `--fg-primary = #FFFFFF`, `--accent-primary = #A855F7`
- **WHEN** 主题为 Light
- **THEN** `--surface-primary = #FFFFFF`, `--fg-primary = #0A0A0A`, `--accent-primary = #7C3AED`

### Requirement: K 线涨跌配色独立配置

系统 SHALL 允许用户独立配置 K 线涨跌的颜色惯例，不与主题绑定。支持两种惯例：
- `green-up`: 绿涨红跌（Western / TradingView 默认）
- `red-up`: 红涨绿跌（Chinese / 红涨绿跌）

#### Scenario: 默认跟语言

- **WHEN** 用户首次启动应用，UI 语言为 English
- **THEN** `chart.candleUp` 默认设置为 `"green-up"`
- **WHEN** 用户首次启动应用，UI 语言为 中文
- **THEN** `chart.candleUp` 默认设置为 `"red-up"`

#### Scenario: 用户独立切换

- **WHEN** 用户在 Settings > Appearance > K-line color convention 切换到 Red up
- **THEN** 所有 K 线图、信号标记、权益曲线立即更新颜色
- **THEN** `chart.candleUp` 持久化为 `"red-up"`
- **THEN** 语言切换不再影响该设置（用户显式选择后）

#### Scenario: 预览效果同步

- **WHEN** 用户在设置中 hover 某个 K 线惯例选项
- **THEN** 该选项卡片内显示 4 根 mini 蜡烛预览，体现当前选择的涨跌颜色

### Requirement: 主题设置持久化

系统 SHALL 将主题相关设置持久化到本地 SQLite 的 `settings` 表。

#### Scenario: 设置读写

- **WHEN** 应用启动
- **THEN** 从 `settings` 表读取 `ui.theme` 和 `chart.candleUp`
- **THEN** 应用对应主题与配色

#### Scenario: 跨启动一致性

- **WHEN** 用户在设置 A 时切换到 Light 主题，关闭应用，重新打开
- **THEN** 应用保持 Light 主题加载
- **THEN** 用户无需重新配置

### Requirement: 主题适配的图表与图形元素

系统 SHALL 确保所有图表元素（K 线、权益曲线、指标线、信号标记）在两种主题下均清晰可辨。

#### Scenario: K 线图表切换

- **WHEN** 主题从 Dark 切到 Light
- **THEN** 图表背景从 `#0A0A0A` 切到 `#FFFFFF`
- **THEN** 网格线从深灰切到浅灰
- **THEN** 价格坐标轴标签颜色跟随 `--fg-muted`
- **THEN** 蜡烛颜色保持一致（不跟主题切换）

#### Scenario: 权益曲线填充在 Light 主题可见

- **WHEN** 主题为 Light，展示权益曲线
- **THEN** 紫色渐变填充 `#7C3AED33 → #7C3AED00` 在白底下呈浅紫色背景
- **THEN** 权益曲线主线条颜色 `--accent-primary` 在白底下对比度足够

### Requirement: 默认主题行为提示

系统 SHOULD 在首次启动提示用户可切换主题，但不强制打断。

#### Scenario: 首次启动 Auto 模式提示

- **WHEN** 用户首次启动应用
- **THEN** 应用按照系统偏好渲染对应主题
- **THEN** 不弹出强制性选择对话框
- **THEN** 主题选项在 Settings > Appearance 可随时访问
