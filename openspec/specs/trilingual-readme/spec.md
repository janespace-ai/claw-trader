### Requirement: Three language-variant README files at the repo root

The repository SHALL contain exactly three README files at its root, one per supported language variant:

- `README.md` — English, the default file GitHub renders on the repo landing page.
- `README.zh-CN.md` — Simplified Chinese, localised for mainland conventions.
- `README.zh-TW.md` — Traditional Chinese, localised for Taiwan conventions.

Each file SHALL be a complete, standalone document. A "redirect" or "see English version" stub file is NOT acceptable.

#### Scenario: All three files exist at the root

- **WHEN** a reviewer lists the repository root
- **THEN** all three filenames (`README.md`, `README.zh-CN.md`, `README.zh-TW.md`) are present
- **AND** each file is at least 200 lines of rendered content (excluding the language nav bar and license footer)

#### Scenario: No file is a translation stub

- **WHEN** a reviewer opens any of the three files
- **THEN** the file contains all sections listed in "README section structure" below
- **AND** no section contains only a "this content is available in English" redirect

### Requirement: Language navigation bar

Each of the three README files SHALL contain a language navigation bar as its first content line below the H1 title. The bar SHALL:

- List all three languages in the order: `English`, `简体中文`, `繁體中文`.
- Link each non-current language to its corresponding file using a relative path.
- Display the current language as bold (`**...**`) and NOT link it.
- Use ` · ` (space + middle dot + space) as the separator.

#### Scenario: Nav bar present and well-formed on the English file

- **WHEN** a reviewer opens `README.md`
- **THEN** the first content line below `# claw-trader` is:
  `**English** · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md)`

#### Scenario: Nav bar present and well-formed on the zh-CN file

- **WHEN** a reviewer opens `README.zh-CN.md`
- **THEN** the first content line below the H1 is:
  `[English](README.md) · **简体中文** · [繁體中文](README.zh-TW.md)`

#### Scenario: Nav bar present and well-formed on the zh-TW file

- **WHEN** a reviewer opens `README.zh-TW.md`
- **THEN** the first content line below the H1 is:
  `[English](README.md) · [简体中文](README.zh-CN.md) · **繁體中文**`

### Requirement: Required README sections

Each of the three READMEs SHALL contain the following top-level sections, in this exact order:

1. H1 title + language nav bar
2. Hero screenshot (single image or small grid) — sourced from `docs/screenshots/`
3. **Tagline** — one sentence, no crypto/币/加密貨幣 vocabulary
4. **What you can do** — 3-5 bullets describing user-facing capabilities
5. **What it isn't** — 2-4 bullets setting boundaries (e.g. "not a trading bot", "no live execution")
6. **Quick start** — a `docker compose` path that a user can copy-paste
7. **Architecture** — one ASCII diagram or brief prose describing the three services
8. **Data sources & AI providers** — factual list; Gate.io mentioned here, never earlier
9. **Privacy** — explicit statement that keys and data stay local
10. **Disclaimer** — 3-5 lines; research/educational framing; mentions compliance responsibility
11. **License** — MIT + copyright line
12. **Contributing** (optional short section or link) — PRs welcome with brief process hint

#### Scenario: Section order matches across all three files

- **WHEN** a reviewer compares the H2 headings of all three READMEs in order
- **THEN** the sequence of headings is semantically equivalent in all three files
- **AND** no file contains an H2 heading that the other two lack (modulo translation)

#### Scenario: Gate.io does not appear above "Data sources & AI providers"

- **WHEN** a reviewer searches for "Gate.io" in any of the three files
- **THEN** every match lives within the "Data sources & AI providers" section or later
- **AND** no match appears in the tagline, "What you can do" bullets, or "What it isn't" bullets

### Requirement: Positioning vocabulary — no crypto language in headlines

Taglines, section headings, feature bullets, and "What you can do" / "What it isn't" entries SHALL NOT contain any of these terms:

- English: `crypto`, `cryptocurrency`, `bitcoin`, `altcoin`, `coin`, `token`
- Simplified Chinese: `炒币`, `加密货币`, `数字货币`, `比特币`, `山寨币`, `数币`
- Traditional Chinese: `炒幣`, `加密貨幣`, `數位貨幣`, `比特幣`, `山寨幣`

These terms MAY appear strictly inside the "Data sources & AI providers" section as factual descriptions of the current data connector.

#### Scenario: Forbidden vocabulary audit passes

- **WHEN** a reviewer greps each README for the forbidden terms (case-insensitive)
- **THEN** all matches appear exclusively within the "Data sources & AI providers" section

### Requirement: Hero screenshots committed as PNG assets

The repository SHALL contain at least **two** PNG screenshots under `docs/screenshots/` referenced by the hero area of each README. Each screenshot SHALL:

- Be exported from a light-theme frame in `design/trader.pen`.
- Be committed as a PNG file under 500 KB.
- Use the same relative URL in all three READMEs (screenshots are language-independent).

#### Scenario: Screenshot files exist and are referenced

- **WHEN** a reviewer lists `docs/screenshots/`
- **THEN** at least two `.png` files are present
- **AND** each is under 500 KB
- **AND** each is referenced by a markdown image tag in all three READMEs
- **AND** every image tag uses a relative path starting with `docs/screenshots/`

### Requirement: Quick-start uses only verified commands

The "Quick start" section of each README SHALL contain only commands that have been verified to work against the current `main`/`docs/trilingual-readme` branch. Aspirational or future commands (e.g. a Homebrew formula that does not yet exist) SHALL NOT appear.

#### Scenario: Quick-start commands are the ones exercised in recent E2E tests

- **WHEN** a reviewer compares the Quick Start steps to the commands that successfully brought up the E2E stack in commits `6538da5` and `9df4e62`
- **THEN** the commands in the README are a subset of those verified commands
- **AND** no command references a script, binary, or endpoint that does not exist in the repo

### Requirement: Disclaimer block in every file

Each README SHALL include a "Disclaimer" section near the end (immediately before License). The disclaimer SHALL:

- State that the project is a research / educational tool.
- State that no part of the repository constitutes financial advice.
- State that past backtest results do not predict future returns.
- State that users are responsible for complying with the laws of their jurisdiction when using any data source or third-party integration.

#### Scenario: Disclaimer present and covers required claims

- **WHEN** a reviewer opens the "Disclaimer" section of any of the three READMEs
- **THEN** the section contains language covering all four points above in the file's language

### Requirement: MIT license reference

Each README SHALL include a "License" section that names MIT and points to the `LICENSE` file at the repo root.

#### Scenario: License section is complete

- **WHEN** a reviewer opens the "License" section of any of the three READMEs
- **THEN** the text identifies the license as MIT
- **AND** includes a link to `LICENSE`
- **AND** includes the copyright line (`Copyright (c) 2026 janespace` or its translated form)

### Requirement: No code or configuration changes outside the change directory

Applying this change SHALL only touch these paths:

- `README.md` (rewrite)
- `README.zh-CN.md` (create)
- `README.zh-TW.md` (create)
- `docs/screenshots/*.png` (create)
- `openspec/changes/add-trilingual-readme/**` (the change itself, created by the proposal flow)
- `openspec/specs/trilingual-readme/` (created on archive sync)

No files under `desktop-client/`, `data-aggregator/`, `service-api/`, or `design/` SHALL be modified.

#### Scenario: Git diff scope check

- **WHEN** `git status` is run after applying all tasks
- **THEN** the only modified / new paths fall within the six categories listed above
