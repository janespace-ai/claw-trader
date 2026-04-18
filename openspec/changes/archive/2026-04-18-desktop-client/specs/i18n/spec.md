## ADDED Requirements

### Requirement: 支持英文与简体中文

系统 SHALL 支持两种 UI 语言：英文（`en`）和简体中文（`zh`）。所有用户可见的 UI 文本 SHALL 通过翻译键（key）访问，禁止硬编码任何语言的字符串。

#### Scenario: 英文界面

- **WHEN** `ui.language` 设置为 `"en"`
- **THEN** 所有菜单、按钮、标签、提示使用英文
- **THEN** 例：策略管理页标题显示 `"Strategies"`

#### Scenario: 中文界面

- **WHEN** `ui.language` 设置为 `"zh"`
- **THEN** 所有菜单、按钮、标签、提示使用简体中文
- **THEN** 例：策略管理页标题显示 `"策略"`

#### Scenario: 语言切换立即生效

- **WHEN** 用户在 Settings > Appearance > Language 切换语言
- **THEN** 整个应用立即刷新为新语言（无需重启）
- **THEN** 当前路由与页面状态保留

### Requirement: 首次启动检测系统语言

系统 SHALL 在首次启动时检测操作系统或浏览器语言偏好，默认使用匹配的语言。

#### Scenario: 系统语言为中文

- **WHEN** 用户首次启动应用，操作系统语言为 `zh-CN`, `zh-TW`, 或 `zh-HK`
- **THEN** `ui.language` 默认设置为 `"zh"`
- **THEN** UI 启动时显示中文

#### Scenario: 系统语言为英文或其他

- **WHEN** 用户首次启动应用，操作系统语言为 `en-US`, `en-GB`, `ja`, `ko`, 或其他
- **THEN** `ui.language` 默认设置为 `"en"`（英文作为 fallback）
- **THEN** UI 启动时显示英文

#### Scenario: 检测结果可覆盖

- **WHEN** 用户在首次检测后手动切换语言
- **THEN** `ui.language` 持久化用户选择
- **THEN** 后续启动不再重新检测系统语言

### Requirement: i18n 技术实现

系统 SHALL 使用 `react-i18next` 作为 i18n 框架，翻译资源以 JSON 文件组织。

#### Scenario: 翻译文件结构

- **WHEN** 实现 UI 组件
- **THEN** 翻译资源位于 `src/locales/en.json` 和 `src/locales/zh.json`
- **THEN** 翻译键使用点分命名空间，例如：
  - `screener.title`: "Coin Screener" / "选币器"
  - `strategy.runPreview`: "Run preview" / "运行预回测"
  - `metric.totalReturn`: "Total Return" / "总收益率"

#### Scenario: 组件内使用 t() 函数

- **WHEN** 组件渲染 UI 文本
- **THEN** 使用 `const { t } = useTranslation()`
- **THEN** 文本通过 `{t('screener.title')}` 渲染，不硬编码

#### Scenario: 参数化翻译

- **WHEN** 翻译文本包含动态值（如 "12 symbols selected"）
- **THEN** 使用插值：`t('screener.selectedCount', { count: 12 })`
- **THEN** 英文 `"{{count}} symbols selected"`，中文 `"已选择 {{count}} 个币种"`

### Requirement: 翻译覆盖范围

系统 SHALL 翻译所有 UI 可见字符串，包括但不限于：

#### Scenario: 必须翻译的内容

- **WHEN** 审视 UI 文本
- **THEN** 以下内容必须支持双语：
  - 导航、菜单、Tab 标签
  - 按钮、链接、输入框 placeholder
  - 表格列名
  - 回测指标名称（Sharpe, Max Drawdown, Win Rate 等）
  - 错误提示与确认对话框
  - 空状态提示
  - AI 对话面板的 UI 标签（发送按钮、停止按钮、快捷 chip）

#### Scenario: 不需要翻译的内容

- **WHEN** 审视 UI 文本
- **THEN** 以下内容保持原状：
  - 币种符号（`BTC_USDT`, `ETH_USDT`）
  - 用户生成的策略代码（Python 代码）
  - 用户输入的 AI 对话内容
  - AI 模型名称（`Claude Sonnet 4.6`, `GPT-4o`）
  - 数值与时间戳

### Requirement: AI 回复语言策略

系统 SHALL 支持三种 AI 回复语言策略：
- `follow-input`（默认）：AI 回复语言跟随用户输入
- `always-en`：无论用户输入什么语言，AI 始终用英文回复
- `always-zh`：无论用户输入什么语言，AI 始终用中文回复

#### Scenario: Follow-input 策略下中文输入

- **WHEN** `ai.language` 为 `"follow-input"`，用户输入 `"帮我做个均线策略"`
- **THEN** 系统检测输入语言为中文
- **THEN** system prompt 中追加 `"Reply in Simplified Chinese"`
- **THEN** AI 回复使用中文

#### Scenario: Follow-input 策略下英文输入

- **WHEN** `ai.language` 为 `"follow-input"`，用户输入 `"make me an SMA crossover strategy"`
- **THEN** 系统检测输入语言为英文
- **THEN** system prompt 中追加 `"Reply in English"`
- **THEN** AI 回复使用英文

#### Scenario: Force English 策略

- **WHEN** `ai.language` 为 `"always-en"`，用户输入中文
- **THEN** system prompt 指示 AI 用英文回复
- **THEN** AI 用英文回复，但理解用户中文意图

#### Scenario: Force Chinese 策略

- **WHEN** `ai.language` 为 `"always-zh"`，用户输入英文
- **THEN** system prompt 指示 AI 用中文回复
- **THEN** AI 用中文回复，但理解用户英文意图

#### Scenario: 策略摘要语言跟随 AI 回复语言

- **WHEN** AI 生成策略代码与摘要
- **THEN** 策略摘要（策略类型、条件描述）使用当前 AI 回复语言
- **THEN** 策略代码本身（Python）保持原状，注释可以是任一语言

### Requirement: 字体与中文回退

系统 SHALL 为中文文本提供合适的字体回退链。

#### Scenario: 字体回退配置

- **WHEN** 渲染中文 UI
- **THEN** Body 字体链：`"Inter", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif`
- **THEN** 标题字体链：`"Geist", "PingFang SC", "Microsoft YaHei", sans-serif`
- **THEN** 等宽字体链：`"Geist Mono", "Sarasa Mono SC", monospace`

#### Scenario: 数字与币种符号使用等宽字体

- **WHEN** 渲染价格、收益率、交易量等数字
- **THEN** 使用等宽字体（`Geist Mono`），保持列对齐
- **THEN** 币种符号 `BTC_USDT` 也使用等宽字体

### Requirement: 语言设置持久化

系统 SHALL 将语言设置持久化到本地 SQLite 的 `settings` 表。

#### Scenario: 设置存储

- **WHEN** 用户切换语言或修改 AI 回复语言策略
- **THEN** `ui.language` 和 `ai.language` 立即写入 `settings` 表
- **THEN** 下次启动读取用户选择

#### Scenario: 未检测到偏好时的 fallback

- **WHEN** 应用无法读取用户设置或系统语言
- **THEN** 默认使用英文（`"en"`）作为 UI 语言
- **THEN** AI 回复语言默认 `"follow-input"`
