## 1. Assets — export hero screenshots

- [x] 1.1 Create directory `docs/screenshots/`.
- [x] 1.2 Export `MZuaq` (Workspace — Strategy Design, Light) from `design/trader.pen` via `mcp__pencil__export_nodes` at 2× scale to `docs/screenshots/workspace-strategy-design-light.png`.
- [x] 1.3 Export `TR0Ib` (Workspace — Deep Backtest, Light) at 2× to `docs/screenshots/deep-backtest-light.png`.
- [x] 1.4 Export `wBWkN` (Multi-Symbol Grid, Light) at 2× to `docs/screenshots/multi-symbol-grid-light.png`.
- [x] 1.5 Verify each exported PNG is ≤ 500 KB. If any overflows, re-export that single file at 1.5× scale.

## 2. English `README.md`

- [x] 2.1 Replace the existing empty `README.md` with a full document that starts with:
      `# claw-trader`
      `**English** · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md)`
- [x] 2.2 Hero area: include the Multi-Symbol Grid screenshot as the primary image, plus a short tagline referring to "quant research platform for everyday users". No crypto/coin language.
- [x] 2.3 Add "What you can do" section — 3-5 bullets covering: design strategies in Python, AI-drafted strategies & screeners, backtest against historical K-line data, multi-symbol screening, per-symbol deep analysis.
- [x] 2.4 Add "What it isn't" section — bullets covering: no live execution, no trading bot, not financial advice, not a managed service.
- [x] 2.5 Add "Quick start" section — literal commands verified in recent E2E: `docker compose -f docker-compose.yml -f docker-compose.test.yml up -d` for data-aggregator, and the equivalent for backtest-engine + timescaledb + sandbox build steps.
- [x] 2.6 Add "Architecture" section — one ASCII diagram showing `data-aggregator` → `timescaledb` ← `backtest-engine` → `sandbox containers`, with `desktop-client` calling the two Go services.
- [x] 2.7 Add "Data sources & AI providers" section — factual: "Historical K-line data from Gate.io's public S3 dataset + REST API (no API key required). AI features: any OpenAI-compatible provider — tested against OpenAI, Anthropic, DeepSeek, Google Gemini, Moonshot." This is the ONLY place Gate.io is named.
- [x] 2.8 Add "Privacy" section — state that API keys are stored locally only, that no telemetry phones home, that all computation (including AI calls) is initiated from the user's machine.
- [x] 2.9 Add "Disclaimer" section — 4-5 sentences covering research/educational framing, no financial advice, past backtest ≠ future returns, user's compliance responsibility.
- [x] 2.10 Add "License" section — one sentence naming MIT + link to `LICENSE` + the copyright line `Copyright (c) 2026 janespace`.
- [x] 2.11 Add "Contributing" section — brief: "PRs welcome; please open an issue first to discuss non-trivial changes. This repo uses [OpenSpec](openspec/) for proposal-driven development."
- [x] 2.12 Confirm the document is ≥ 200 content lines (excluding nav bar and image lines).

## 3. Simplified Chinese `README.zh-CN.md`

- [x] 3.1 Create `README.zh-CN.md` starting with `# claw-trader` and nav bar:
      `[English](README.md) · **简体中文** · [繁體中文](README.zh-TW.md)`
- [x] 3.2 Translate hero + tagline. Headline phrase: "给普通人的开源量化研究平台。写策略、跑回测、找想法。本地运行，自带 API Key。" Use the same hero image as the English version.
- [x] 3.3 Translate "能用它做什么" — bullets mirror §2.3 English content. Use mainland terminology: `回测`, `策略`, `筛选器`, `多币种`, `指标`.
- [x] 3.4 Translate "它不是什么" — bullets mirror §2.4. Use: `不做实盘`, `不是交易机器人`, `不构成投资建议`, `不是托管服务`.
- [x] 3.5 Translate "快速开始" — identical command blocks (commands are English), Chinese prose around them.
- [x] 3.6 Translate "架构" — same ASCII diagram, Chinese labels for annotations.
- [x] 3.7 Translate "数据源与 AI" — this is the ONLY section where `币` or `加密货币` MAY appear, and only if describing Gate.io's scope factually.
- [x] 3.8 Translate "隐私 / 本地运行".
- [x] 3.9 Translate "免责声明" with equivalent meaning to §2.9. Include: "研究与学习用途", "不构成任何投资建议", "历史回测结果不代表未来收益", "使用者须自行遵守所在司法管辖区的法律法规".
- [x] 3.10 Translate "许可证" — MIT + link to `LICENSE` + `版权所有 (c) 2026 janespace`.
- [x] 3.11 Translate "贡献" — mirror §2.11.

## 4. Traditional Chinese `README.zh-TW.md`

- [x] 4.1 Create `README.zh-TW.md` starting with `# claw-trader` and nav bar:
      `[English](README.md) · [简体中文](README.zh-CN.md) · **繁體中文**`
- [x] 4.2 Translate hero + tagline. Headline phrase: "給一般使用者的開源量化研究平臺。寫策略、跑回測、找想法。本地執行，自備 API Key。" Tone is slightly more formal than zh-CN.
- [x] 4.3 Translate "能用它做什麼" — bullets mirror §2.3. Use Taiwan terminology: `回測`, `策略`, `篩選器`, `多幣種`, `指標`, `資料庫` (not `数据库`), `用戶端` (not `客户端`).
- [x] 4.4 Translate "它不是什麼".
- [x] 4.5 Translate "快速開始" — same commands, Traditional prose.
- [x] 4.6 Translate "架構" — same ASCII diagram, Traditional labels.
- [x] 4.7 Translate "資料來源與 AI".
- [x] 4.8 Translate "隱私 / 本地執行".
- [x] 4.9 Translate "免責聲明" with equivalent meaning. Include: "研究與教育用途", "不構成任何投資建議", "歷史回測結果不代表未來收益", "使用者須自行遵守所在地之法律與法規".
- [x] 4.10 Translate "授權" — MIT + link to `LICENSE` + `版權所有 (c) 2026 janespace`.
- [x] 4.11 Translate "貢獻".

## 5. Cross-file consistency audit

- [x] 5.1 Diff the three files' H2 heading sequences. Confirm semantic 1:1 mapping (same count, same order, semantically equivalent).
- [x] 5.2 Grep all three files for forbidden vocabulary outside the "Data sources & AI providers" section: `crypto`, `cryptocurrency`, `bitcoin`, `coin`, `token`, `炒币`, `加密货币`, `数字货币`, `比特币`, `炒幣`, `加密貨幣`, `數位貨幣`, `比特幣`. Confirm zero matches outside that section.
- [x] 5.3 Confirm every markdown image tag uses the same `docs/screenshots/...` path across all three files.
- [x] 5.4 Confirm every code fence contains identical command text in all three files (the prose around may differ, the commands must not).
- [x] 5.5 Open each README locally and verify language nav bar links work (relative paths resolve to the right file).

## 6. Commit + push

- [x] 6.1 Verify `git status` shows only: new `README.zh-CN.md`, new `README.zh-TW.md`, modified `README.md`, new `docs/screenshots/*.png`, and new `openspec/changes/add-trilingual-readme/**`.
- [x] 6.2 Stage all four content paths + the openspec change directory.
- [x] 6.3 Commit with message: `Add trilingual README (EN / zh-CN / zh-TW) + hero screenshots`.
      Body summarises: positioning as research-first quant platform; three root files with shared structure; Gate.io mentioned only under Data sources; MIT license surfaced; hero images from `design/trader.pen` light-theme frames.
- [x] 6.4 Push the `docs/trilingual-readme` branch to origin. Do not open a PR or merge to main — the user will decide when to merge.

## 7. Future-edit checklist (documentation aid, not blocking)

- [x] 7.1 Record in the archived tasks: when editing a section in one README, the same section must be edited in the other two. Any edit that touches only one language is a change-request bug.
- [x] 7.2 Record: screenshots are re-exported from `design/trader.pen` whenever light-theme frames change. Do not edit PNGs by hand.
