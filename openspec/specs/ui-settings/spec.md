# Capability: ui-settings

Synced on 2026-04-19 from archived delta specs in `openspec/changes/archive/`.

### From change: `settings-full-page`

## ADDED Requirements

### Requirement: Settings 全页屏幕

`desktop-client` SHALL 提供 `src/screens/SettingsScreen.tsx`,实现 Pencil frame `0qnH2`(dark)+ `uWni9`(light)的像素级渲染,替换现有 `src/pages/SettingsPage.tsx` modal。路由 `route.kind === "settings"` 渲染此屏。

布局: 左侧 sticky 导航(220px 宽)+ 右侧滚动内容区,单一垂直长页。`route.section` 参数 SHALL 滚动到对应 section。

#### Scenario: 进入 Settings

- **WHEN** 用户点 TopBar 齿轮图标
- **THEN** `appStore.navigate({ kind: "settings" })`
- **THEN** SettingsScreen 渲染,左侧导航高亮第一个 section

#### Scenario: 深链接到特定 section

- **WHEN** `appStore.navigate({ kind: "settings", section: "remote-engine" })`
- **THEN** 滚动到 Remote Engine section
- **THEN** 左侧导航中 "Remote Backtest Engine" 项高亮

### Requirement: Sticky 左侧 section 导航

左侧导航 SHALL 包含以下 sections:

- **AI & API Keys** (`ai-keys`)
- **Remote Backtest Engine** (`remote-engine`)
- **Appearance** (`appearance`)
- **Language** (`language`)
- **Chart** (`chart`)
- **Local Storage** (`local-storage`)
- **Import / Export** (`import-export`)
- **About** (`about`)

IntersectionObserver SHALL 高亮视口内最上方的 section 对应的导航项。点击导航项 SHALL smooth-scroll 到对应 section。

#### Scenario: 滚动高亮

- **WHEN** 用户向下滚动,Remote Engine section 进入视口顶部
- **THEN** 左侧导航中 "Remote Backtest Engine" 高亮
- **THEN** 滚出视口后高亮移到下一项

### Requirement: AI & API Keys section

section 内容 SHALL 包含:

- 每个 provider(OpenAI / Anthropic / DeepSeek / Kimi / Google Gemini)一行 `ProviderCard`:
  - Logo + provider 名 + 模型 default 单选钮(单选组)
  - API key 输入框(默认 masked,有 toggle reveal)
  - Model 名输入
  - "Test" 按钮(调现有 provider connect check)+ "Edit" 按钮
- 底部: "AI response language" 分段 `[Follow input] [Always 中文] [Always English]`

autosave: 每个输入框 blur 或 debounce 500ms 后自动持久化。

#### Scenario: 修改 API key

- **WHEN** 用户在 OpenAI row 的 API key 输入框输入新值
- **THEN** 失焦时(或停顿 500ms)自动调 `settingsStore.setProviderConfig("openai", { apiKey })`
- **THEN** toast "Saved"

#### Scenario: 切换默认 provider

- **WHEN** 用户点 Anthropic row 的默认 radio
- **THEN** `settingsStore.setDefaultProvider("anthropic")`
- **THEN** 其他 row 的 radio 取消

### Requirement: Remote Backtest Engine section

section SHALL 含一个 `RemoteEngineCard`,挂载时调 `cremote.getEngineStatus()`,内容:

- 版本 badge(`v0.1.0`)
- Supported intervals 串
- 支持市场(通常 "futures")
- 数据 range(`2023-01-01 → 今天`)
- 最近一次 aggregator 同步时间(relative)
- Active tasks 计数
- 状态徽章: getEngineStatus 成功 = 绿色 "Connected",失败 = 红色 "Offline"
- Refresh 按钮(2s debounce)

当前 `claw-config.json` 覆盖的 `remoteBaseURL` SHALL 也在此 card 中显示。

#### Scenario: 成功获取状态

- **WHEN** SettingsScreen 挂载,engine 可达
- **THEN** card 渲染完整数据,徽章绿色
- **THEN** "Last checked" 显示 "just now"

#### Scenario: engine offline

- **WHEN** `cremote.getEngineStatus` 抛错
- **THEN** card 显示 "Offline" 徽章,所有 value 灰化显示旧值(若有)
- **THEN** Refresh 按钮可用,可手动重试

### Requirement: Appearance section

Appearance section SHALL 含:

- **Theme**: 3 个可视 tile(Auto / Dark / Light),每个 tile 显示对应主题的预览缩略图
- 当前 theme 的 tile SHALL 有高亮边框

#### Scenario: 切换 theme

- **WHEN** 用户点 Light tile
- **THEN** `settingsStore.setTheme("light")`
- **THEN** 整个 app 切到 light 主题
- **THEN** 该 tile 高亮,Auto/Dark 去高亮

### Requirement: Chart section(蜡烛颜色约定)

Chart section SHALL 含 "Candle color convention" 两个 tile:

- "Green up / Red down"(默认)
- "Red up / Green down"(中文市场习惯)

选择持久化为 `settingsStore.candleConvention`。

#### Scenario: 切换 convention

- **WHEN** 用户点 "Red up / Green down"
- **THEN** `settingsStore.setCandleConvention("red-up")`
- **THEN** 所有 ClawChart.Candles 重绘,颜色翻转

### Requirement: Language section

Language section SHALL 含 UI 语言选择(English / 中文),两个 chip。选择持久化。

#### Scenario: 切 UI 语言

- **WHEN** 用户点 "中文"
- **THEN** `settingsStore.setLanguage("zh")` → i18next 切换
- **THEN** 整个 UI 文案更新

### Requirement: Local Storage section

Local Storage section SHALL 含:

- 当前 SQLite DB 文件大小(通过新 IPC `window.claw.db.size()` 获取)
- "Clear cache" 按钮 + 确认 dialog,清除非用户数据(LLM cache、临时 screener 结果等)
- "Export all data" 按钮(本 change 中为 stub: 打开 file picker 但不实际写文件)

#### Scenario: 显示 DB 大小

- **WHEN** section 进入视口
- **THEN** 调 `window.claw.db.size()` 取 size
- **THEN** 显示 "Local database: 24.5 MB"

#### Scenario: Clear cache 流程

- **WHEN** 用户点 Clear cache,确认 dialog
- **THEN** 调 `window.claw.db.clearCache()`(新 IPC)
- **THEN** 重新查 size,显示更新后的数字

### Requirement: Import / Export section

section SHALL 含:

- "Import strategies" 按钮 — 打开文件选择器,接受 .json
- "Export all strategies" 按钮 — 打开保存对话框

本 change 中两个 handler SHALL 仅打开对话框,实际 import/export 逻辑 SHALL 为 stub(toast "Coming soon"),留给后续 change `settings-import-export-impl` 实现。

#### Scenario: 点击 Import

- **WHEN** 用户点 "Import strategies"
- **THEN** 文件选择器打开
- **WHEN** 选中一文件
- **THEN** 不做任何解析,toast "Import coming soon"

#### Scenario: 点击 Export

- **WHEN** 用户点 "Export all strategies"
- **THEN** 保存对话框打开
- **WHEN** 选了保存路径
- **THEN** toast "Export coming soon",不写文件

### Requirement: About section

About section SHALL 含:

- 应用名 + 版本号(`Claw Trader v0.1.0`)
- Author / 版权
- 链接: GitHub repo / 文档 / 许可

简单静态内容,不涉及动态数据。

#### Scenario: About 渲染

- **WHEN** 滚动到 About section
- **THEN** 显示版本 + 链接
- **THEN** 链接点击在外部浏览器打开(Electron shell.openExternal)

### Requirement: 视觉回归快照

`e2e/visual/settings.spec.ts` SHALL 覆盖(每个 section 一个 baseline 太多,按布局关键状态拍):

- `dark-top.png`、`light-top.png`:section nav + AI & API Keys section 可见
- `dark-engine-card.png`:Remote Engine card 展开 + 徽章连接
- `dark-engine-offline.png`:Remote Engine offline 态

#### Scenario: 4 baseline

- **WHEN** `pnpm test:visual settings.spec.ts`
- **THEN** 4 baseline 匹配

---

