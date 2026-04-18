## Context

The repo is going public-by-default and currently has a single-line README. Its three services (`data-aggregator`, `backtest-engine`, `desktop-client`) are working end-to-end as of `9df4e62`; the design file at `design/trader.pen` has 8 fully drawn light-theme mockups; the license is already MIT. What is missing is the "front door" every GitHub visitor sees first.

Two prior explore-mode conversations surfaced the key constraints that shape this design:

1. **Positioning**: the README must NOT lead with crypto / 炒币 / 数字货币 language. The project is framed as "a research-first quant platform for everyday users". Gate.io appears factually in a "Data sources" subsection, never in the hero/tagline/features. This is an honest reframing — the core engine (`Bar` abstraction, Python sandbox, time-series store) is market-agnostic; the Gate.io connector is one connector.

2. **Audience**: everyday users curious about quant strategy research — not institutional quants, not day-traders. They are Docker-capable or willing to learn, skeptical of marketing hype, and value local-first / private-by-default software.

## Goals / Non-Goals

**Goals:**

- A visitor to github.com/.../claw-trader sees, within 5 seconds: what this is, what it looks like, how to try it, and what its boundaries are.
- Non-English readers (zh-CN, zh-TW) get a first-class experience — the other-language READMEs are not stubs that redirect to English.
- Copy tone is neutral, truthful, and slightly technical — no marketing superlatives, no return promises, no emoji confetti.
- The three files are structurally isomorphic: section order, section count, and feature bullets map 1:1, so future edits can be replicated mechanically.

**Non-Goals:**

- Complete user documentation (strategy DSL reference, API docs, deployment guide) — those belong under `docs/`, not the root README.
- Marketing / SEO copy optimisation.
- Screenshots of dark-theme mockups — the light theme is what most GitHub readers see by default and the only variant we want featured.
- Localisation into languages beyond zh-CN and zh-TW (ja, ko, es, etc.) — out of scope for this change; infrastructure (nav bar pattern) is extensible if needed later.
- Any code/config changes to make the "quick start" path work — we reference what works today (the commands verified in our recent E2E pass), not aspirational flows.

## Decisions

### D1: Three standalone files at the repo root, not a `docs/` dispatcher

**Choice:** `README.md`, `README.zh-CN.md`, `README.zh-TW.md` all at the repo root.

**Rationale:** GitHub's repo page renders `README.md` from the root automatically. A dispatcher pattern (a 3-link README.md pointing at `docs/*.md`) makes the landing page feel unfinished — the visitor's first impression is "this project has no README". Standalone files also mean each language gets a proper GitHub preview when shared (Twitter cards, Slack link unfurls).

**Trade-off:** Three files to maintain in lockstep. Mitigated by D3 (structural isomorphism) and the `tasks.md` update-propagation checklist.

### D2: English is canonical for naming / terminology; zh-CN and zh-TW are localisations

**Choice:** English `README.md` is authored first; the two Chinese files translate from it. If a term conflicts between English and Chinese, English wins on product naming, Chinese wins on idiomatic flow.

**Rationale:** All code identifiers (`backtest-engine`, `data-aggregator`, `docker compose`) are English. Keeping English as the source prevents drift in technical terms. Chinese translations are "same content, natural reading" — not literal word-for-word — so that "multi-symbol analysis" becomes "多币种分析" / "多幣種分析" rather than a clumsy transliteration.

### D3: Structural isomorphism across the three files

**Choice:** All three READMEs share the same section order and section headings map 1:1. Screenshot URLs and code-block contents are identical (commands are language-neutral); only the prose around them is localised.

```
  English section              →  zh-CN                  →  zh-TW
  ──────────────────────────      ─────────────────────     ─────────────────────
  "What you can do"               "能用它做什么"             "能用它做什麼"
  "What it isn't"                 "它不是什么"               "它不是什麼"
  "Quick start"                   "快速开始"                 "快速開始"
  "Architecture"                  "架构"                     "架構"
  "Data sources & AI"             "数据源与 AI"              "資料來源與 AI"
  "Privacy"                       "隐私 / 本地运行"          "隱私 / 本地執行"
  "Disclaimer"                    "免责声明"                 "免責聲明"
  "License · Contributing"        "许可证 · 贡献"            "授權 · 貢獻"
```

**Rationale:** Anyone doing a side-by-side comparison (translators, reviewers, auditors) sees the same shape. When a future change adds/removes a section, it mechanically touches all three files — no "which version is newest?" ambiguity.

### D4: Language navigation bar at the top, not at the bottom or in a sidebar

**Choice:** The first line below the H1 in each README is:

```
[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md)
```

The current language is bolded and unlinked. GitHub renders `·` middle dots cleanly and the whole line stays on one row even on narrow screens.

**Rationale:** Nav must be visible above the fold. Bottom placement means a reader has to scroll a ~300-line page to find the language switcher — they'd just close the tab instead. A badge row is an alternative but takes extra image bandwidth.

### D5: Screenshots — 2-3 exported PNGs from `design/trader.pen`, committed as static assets

**Choice:** Export these frames from the Pencil file at 2× scale and store under `docs/screenshots/`:

- `workspace-strategy-design-light.png` (frame `MZuaq`) — shows K-line + AI strategist panel; conveys "strategy research" without showing specific symbols as the hero.
- `deep-backtest-light.png` (frame `TR0Ib`) — shows equity curve + metrics; conveys "analysis output".
- `multi-symbol-grid-light.png` (frame `wBWkN`) — visually striking 3×3 mini-chart grid; good as the hero image.

Reference from each README as a single hero image (grid) followed by inline references in feature bullets.

**Rationale:** Design mockups > live screenshots at this stage — the mockups are pixel-clean, free of placeholder "LOREM IPSUM" or user data leakage, and they render identically on all platforms. The `.pen` source of truth stays in the repo; exported PNGs are binary artefacts (~200-400 KB each) committed directly.

**Alternative considered:** Use GIFs / animated demos. Rejected because (a) the UI is static enough that stills work, (b) GIFs balloon repo size, (c) creating them needs a running dev environment which contradicts the README's "this is the landing page" purpose.

### D6: Localise the positioning vocabulary, not just translate it

**Choice:** The headline translations are intentionally non-literal:

| English                                      | zh-CN                         | zh-TW                          |
|----------------------------------------------|-------------------------------|--------------------------------|
| "quant research platform for everyday users" | "给普通人的开源量化研究平台"  | "給一般使用者的開源量化研究平臺" |
| "research-first — no live trading"           | "只做研究，不做实盘"          | "只做研究，不做實盤"           |
| "bring your own keys"                        | "自带 API Key"                | "自備 API Key"                 |

zh-TW uses slightly more formal register than zh-CN (e.g., "使用者" vs "用户", "執行" vs "运行"). No slang in either. "crypto" / "币" / "幣" never appear in a headline or feature bullet.

**Rationale:** Mechanical translation ("量化研究平台對一般使用者") reads like machine output and undermines trust. Native-register copy signals that the author actually cares about the reader's experience.

### D7: Disclaimer is short, literal, and appears near the end — not the top

**Choice:** A ~4-line disclaimer block immediately above `License`. Exactly:

> This is a research and educational tool. It does not execute trades. Nothing in this repository is financial advice and past backtest results do not predict future returns. You are responsible for complying with the laws and regulations of your jurisdiction when using any data source or integrating with any third-party service.

Translated into zh-CN and zh-TW with equivalent meaning and equivalent formality.

**Rationale:** Top-of-page disclaimers get ignored. End-of-page ones are read by the subset of users who actually made it past the quick-start — exactly the subset who need to see it. Short length avoids legal-theatre bloat.

### D8: No badges in the hero (beyond MIT)

**Choice:** Include **only** the MIT license badge in the hero row. No Go version badge, no "built with React" shields, no GitHub stars badge, no CI status (there is no CI yet).

**Rationale:** Badge rows age badly. Stars count is zero on a fresh public repo; CI badges linking to non-existent workflows look broken. A single MIT badge is evergreen and conveys the one thing that matters to an evaluating reader.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Translations drift apart over time as someone edits one language and forgets the others. | `tasks.md` includes an explicit "update all three files together" reminder in the "future-edit checklist" section; `spec.md` encodes the structural-isomorphism requirement so CI / review can catch drift. |
| Screenshots become stale when the UI changes. | Screenshots come from `design/trader.pen`, which IS the design source of truth. When the UI evolves, the `.pen` file is updated first; re-exporting is a one-command step documented in tasks.md. |
| "Quant platform for everyday users" positioning is aspirational — current UX still expects Docker fluency. | Quick-start is honest about the Docker requirement. The "what it isn't" section explicitly says "not a one-click installer". |
| zh-TW translation quality is hard to verify without a native reviewer. | Translation follows documented conventions (D6 table); terminology is cross-referenced against the existing `desktop-client` i18n bundles which already have zh-CN/zh-TW vetted strings. Flag in tasks.md for optional review. |
| Large screenshots inflate `git clone` size. | Budget: each PNG ≤ 500 KB; 3 PNGs ≤ 1.5 MB total. If this overflows, re-export at 1.5× scale instead of 2×. |
| "Gate.io is the current data connector" language may mislead readers into thinking other connectors are imminent. | Use "currently" / "current data connector" — present tense, no future promises. A one-line "adding other data sources is out of scope for this release" clarifies the scope without closing the door. |
| Repo's public status changes could make the disclaimer wording inadequate. | Disclaimer explicitly mentions compliance with local jurisdictions and makes no representation about any specific venue. Reviewed against common OSS research-tool disclaimers. |

## Migration Plan

Not applicable. There is no previous full README to migrate — the existing file is effectively empty. The implementation replaces it in place.

## Open Questions

- **Q1**: Do we want a `CONTRIBUTING.md` stub now, or just a "Contributing" section in the README that says "PRs welcome; please open an issue first"?
  *Proposed answer*: README section only. A separate `CONTRIBUTING.md` should wait until actual contribution conventions emerge.

- **Q2**: Do we include a short "Status" line (e.g. "Early alpha — APIs may change")?
  *Proposed answer*: yes, one line in the hero area. Sets honest expectations for a fresh public repo.

- **Q3**: Do we mention the `openspec/` folder in the README?
  *Proposed answer*: one line near the architecture section — "This repo uses OpenSpec to version proposals and specs (see `openspec/`)". Useful for contributors, harmless for end users who can ignore it.
