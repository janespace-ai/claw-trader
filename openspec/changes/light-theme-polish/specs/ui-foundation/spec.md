## ADDED Requirements

### Requirement: 主题 parity 档案

仓库 SHALL 维护 `docs/theme-parity.md` + `docs/theme-parity/` 目录,记录每一屏 dark + light 两种主题的 code 截图与 Pencil 原稿的并排对比。

每屏 SHALL 有 4 张 PNG:
- `<screen>-pencil-dark.png`(来自 `mcp__pencil__export_nodes`)
- `<screen>-pencil-light.png`
- `<screen>-code-dark.png`(来自 Playwright `__screenshots__`)
- `<screen>-code-light.png`

覆盖屏幕:Strategy Design / Preview Backtest / Deep Backtest / Multi-Symbol Grid / Screener / Strategy Management / Symbol Detail / Settings。

#### Scenario: theme-parity.md 完备

- **WHEN** 检查 `docs/theme-parity.md`
- **THEN** 每个 8 个屏幕都有一个 section,含 quartet 图片引用
- **THEN** 每张引用的 PNG 都存在于仓库 `docs/theme-parity/` 下

### Requirement: Light 主题像素级完整度

每一个视觉回归 `light-*` baseline SHALL:

- 存在于 `__screenshots__/<screen>/` 对应 spec 文件下
- 与对应 Pencil light frame 对比无显著 qualitative 差异(spacing、颜色、字体、字重、层次)
- 不含 hardcoded hex / rgb / hsl / 命名颜色值(所有颜色通过 CSS tokens)

#### Scenario: 所有 light baseline 存在

- **WHEN** 列出 `desktop-client/e2e/visual/__screenshots__/` 下所有 PNG
- **THEN** 每个 screen spec 至少有一张 `light-*.png`(总共 ≥ 8 张 light-主题 baseline)

#### Scenario: token 用法无漏

- **WHEN** 运行 `pnpm lint` 开启 `claw/only-token-colors` 规则
- **THEN** 所有 React / TSX 文件无 hex / rgb / hsl 字面量 error
- **THEN** 仅允许的颜色表达式是 CSS 变量或 Tailwind token 类

### Requirement: WCAG AA contrast 合规

每屏 dark + light 两主题的文本/背景组合 SHALL 满足 WCAG AA 对比度(正文 4.5:1,大字 3:1)。

`make test-a11y` SHALL 运行 axe-core(或等效)对每个屏幕的 Playwright-rendered DOM 做对比度检查,任一违规导致 CI 失败(本地 make 等价)。

#### Scenario: a11y 测试通过

- **WHEN** 运行 `make test-a11y`
- **THEN** 8 screens × 2 themes = 16 种组合下,无 AA 违规
- **THEN** 违规信息 JSON 写入 `test-results/a11y.json` 供人工审查
