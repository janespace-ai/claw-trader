## Why

Pencil frame `0qnH2` (`Screen / Settings`) + `uWni9` (Light) redesigns Settings as a full-page screen with left-side section navigation. Current code renders Settings as a modal overlay with a flat list. The mock is richer: AI & API Keys, Remote Backtest Engine status card, Appearance (theme tiles), Language, Candle convention, AI response language, Local Storage (new section), Import/Export (new section), About (new section).

Settings frame is 1800px tall — the only non-900 frame — implying scrollable with sticky section nav.

## What Changes

**Convert modal → full-page**:
- Delete `SettingsModal` overlay
- New `src/screens/SettingsScreen.tsx` as a routed screen (`route.kind === "settings"`)
- Left sticky section nav (5-7 items)
- Right content area scrolls through sections OR nav click jumps to section

**Remote Backtest Engine card** (new):
- In the "AI & API Keys" or its own section
- Calls `cremote.getEngineStatus()` on mount
- Renders: version badge, supported intervals list, data range, connected status (green if getEngineStatus 200, red otherwise)
- Refresh button to re-query

**New sections not in current modal**:
- **Local Storage** — summary of SQLite size (via Electron API), "Clear cache" button (with confirmation), "Export all data" button
- **Import/Export** — strategies import from JSON, export all strategies
- **About** — version, credits, links to GitHub/docs

**Appearance section**:
- Theme: three tiles (Auto / Dark / Light) with visual preview (Pencil has this)
- Candle color convention: two tiles (green-up red-down / red-up green-down)
- UI language: two chips (English / 中文 in its native script)

**AI & API Keys section**:
- One `ProviderCard` per provider (OpenAI / Anthropic / DeepSeek / Kimi / Google Gemini)
- Each: logo + name + API key input + model input + Test button + Edit button
- Default model radio (one per row)
- "AI response language" toggle at bottom

## Capabilities

### New Capabilities
- `ui-settings`: Full-page settings screen with section navigation, all new sections (Remote Engine / Local Storage / Import-Export / About), and the visual upgrades to existing sections.

### Modified Capabilities
*(None — the current SettingsModal is deleted; no existing capability had the section-heavy Pencil layout specced.)*

## Impact

**New files**
- `src/screens/SettingsScreen.tsx` + sub-components (per section)
- `src/components/settings/ProviderCard.tsx` (matches Pencil `ProviderCard`)
- `src/components/settings/ThemeTile.tsx`
- `src/components/settings/RemoteEngineCard.tsx`
- `src/components/settings/LocalStorageSection.tsx`
- `src/components/settings/ImportExportSection.tsx`
- `src/components/settings/AboutSection.tsx`
- `e2e/visual/settings.spec.ts`

**Modified files**
- `src/pages/SettingsPage.tsx` — delete or merge into `SettingsScreen`
- `src/App.tsx` — `route.kind === "settings"` → `<SettingsScreen section={route.section} />`
- TopBar gear icon click → `appStore.navigate({ kind: "settings" })` instead of local modal state
- `docs/design-alignment.md` — ProviderCard, theme tiles, engine status card

**Deleted files**
- `src/pages/SettingsPage.tsx` (modal implementation)

**Depends on**
- `ui-foundation` (routing)
- `api-contract-new-capabilities` — `cremote.getEngineStatus`

**Out of scope**
- Real import/export implementation (button exists, opens file picker, actual parsing in a follow-up).
- Cloud backup.
- Settings sync between devices.
