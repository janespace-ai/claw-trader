## Why

The repository's `README.md` is effectively empty — it contains only the line `# claw-trader`, with no description, no screenshots, no quick-start, no architecture overview, no license mention. For a public OSS repo this is the single highest-impact gap: every potential user, contributor, or reviewer lands on GitHub's repo page and sees nothing. The project already has polished design assets, three working services, and a clean MIT license, but none of that is visible to anyone who hasn't cloned the repo.

The project's positioning also needs sharpening. `claw-trader` is currently perceived as a crypto-trading tool, but the architecture (generic OHLCV backtest engine + Python sandbox + time-series aggregator + token-themed desktop client) is really a research-first quant platform that happens to ship a Gate.io data connector today. The README is where that framing gets established.

Finally, the primary audience — everyday users curious about quant strategies — spans English, Simplified Chinese, and Traditional Chinese speakers. A single-language README leaves ~2/3 of them guessing. Three parallel READMEs at the repo root (with cross-language nav) is the minimum viable internationalisation that GitHub's repo page can show natively.

## What Changes

- Replace the empty `README.md` with a **full English README** (~250-400 lines) covering: hero screenshots, tagline, what-you-can-do / what-it-isn't, quick-start (`docker compose`), architecture diagram, data & AI providers, local-first privacy, disclaimer, license, contributing pointer.
- Add **`README.zh-CN.md`** — a localised Simplified Chinese translation (not a literal one). Terminology follows mainland conventions ("回测", "数据库", "客户端", "筛选器").
- Add **`README.zh-TW.md`** — a localised Traditional Chinese translation. Terminology follows Taiwan conventions ("回測", "資料庫", "用戶端", "篩選器"). Tone slightly more formal than the zh-CN version.
- Each of the three files opens with a **language navigation bar**: `English · 简体中文 · 繁體中文`, with the current language marked.
- Add **`docs/screenshots/`** with 2-3 PNGs exported from `design/trader.pen`: the light-theme Multi-Symbol Grid, Deep Backtest, and Strategy Design frames. These are the hero images at the top of each README.
- **Positioning rule**: none of the three READMEs lead with "crypto" / "炒币" / "加密貨幣" in headlines, taglines, or feature bullets. Gate.io is mentioned factually under a "Data sources" subsection, not in the hero.
- **Disclaimer rule**: a short, clear "Research tool, not financial advice" block near the end, in each language. For the public repo context it also mentions the user's responsibility for local compliance.
- **No code changes**. This is a pure documentation / asset change. `desktop-client/`, `data-aggregator/`, `backtest-engine/`, and `openspec/` are untouched aside from the change's own directory.

## Capabilities

### New Capabilities

- `trilingual-readme`: Defines what the top-level README content must cover and which three language variants must exist, with language-invariant structure so future spec-level changes (adding sections, updating tagline, swapping screenshots) can be expressed in one place and applied uniformly to all three files.

### Modified Capabilities

_(none — no runtime behaviour changes; no existing spec is affected.)_

## Impact

- **Affected files**: `README.md` (rewrite), new `README.zh-CN.md`, new `README.zh-TW.md`, new `docs/screenshots/*.png`.
- **Affected code**: none.
- **Affected APIs**: none.
- **Dependencies**: none at runtime. Export of screenshots relies on the Pencil MCP server (`mcp__pencil__export_nodes`) during implementation only.
- **Downstream consumers**: GitHub repo landing page (primary), any mirror or package-registry listing that renders README.md, contributor onboarding.
