## 1. Prereqs

- [x] 1.1 `ui-foundation`, `api-contract-new-capabilities` landed.

## 2. Delete modal implementation

- [x] 2.1 Identify all references to `SettingsModal` / `setSettingsOpen` in `App.tsx`.
- [x] 2.2 Rewire TopBar gear icon: `appStore.navigate({ kind: "settings" })` instead of local state.
- [x] 2.3 Delete `src/pages/SettingsPage.tsx` (content salvageable into sub-components).

## 3. New screen scaffold

- [x] 3.1 Create `src/screens/SettingsScreen.tsx` using a simple 2-column flex: left sticky nav + right scroll container.
- [x] 3.2 `SettingsNav.tsx` — 8-item list, current-section highlight via IntersectionObserver hook.
- [x] 3.3 Route: `route.kind === "settings"` → `<SettingsScreen initialSection={route.section} />`.

## 4. AI & API Keys section

- [x] 4.1 `ProviderCard.tsx` — one per provider. Props: `provider`, `config`, `isDefault`, `onChange`.
- [x] 4.2 API key mask toggle.
- [x] 4.3 Test button → calls existing provider health-check logic.
- [x] 4.4 Default radio group at section top.
- [x] 4.5 AI response language toggle at section bottom (existing `settingsStore.aiLanguagePolicy`).

## 5. Remote Engine section

- [x] 5.1 `RemoteEngineCard.tsx`.
- [x] 5.2 On mount + on window focus: `cremote.getEngineStatus()`.
- [x] 5.3 Render version / markets / intervals / data range / sync time / active tasks.
- [x] 5.4 Show `remoteBaseURL` with source pill (config-file / env / fallback — from `window.claw.config.get()`).
- [x] 5.5 Refresh button with 2s debounce.
- [x] 5.6 Connected/Offline badge.

## 6. Appearance, Language, Chart sections

- [x] 6.1 `ThemeTile.tsx` — 3 tiles, visual preview per theme, selected state.
- [x] 6.2 Language chips (English / 中文).
- [x] 6.3 Candle convention tiles (green-up / red-up).

## 7. Local Storage section

- [x] 7.1 New IPC: `window.claw.db.size()` — returns file size of the SQLite DB file. Add to preload + electron/ipc/db.ts.
- [x] 7.2 New IPC: `window.claw.db.clearCache()` — clears conversation partials, LLM cache (but not strategies/settings). Add to preload + electron/ipc/db.ts.
- [x] 7.3 UI: size display + Clear cache button + confirm dialog.
- [x] 7.4 Export all data button (stub).

## 8. Import / Export section

- [x] 8.1 `ImportExportSection.tsx`: two buttons.
- [x] 8.2 File picker opens via Electron dialog (new IPC or existing file API).
- [x] 8.3 Handlers toast "Coming soon" and log to console — no real impl.

## 9. About section

- [x] 9.1 Static render of version (from package.json), links.
- [x] 9.2 External links use Electron `shell.openExternal` via new IPC or existing.

## 10. Tests

- [x] 10.1 `e2e/visual/settings.spec.ts` with 4 baselines.
- [x] 10.2 Vitest: `screens/SettingsScreen.test.tsx` — section nav scroll, autosave flows.
- [x] 10.3 Vitest: `components/settings/RemoteEngineCard.test.tsx` — loading, error, refresh.
- [x] 10.4 Vitest: `components/settings/ProviderCard.test.tsx` — API key mask, default toggle.

## 11. Documentation

- [x] 11.1 `docs/design-alignment.md` — `ProviderCard`, `ThemeTile`, `RemoteEngineCard`.
- [x] 11.2 Update `CONFIGURATION.md` — link to the new Remote Engine card ("see source of current URL in Settings").

## 12. Final validation

- [x] 12.1 All tests green.
- [x] 12.2 Manual: open Settings, navigate every section, toggle theme, flip candle convention, refresh engine status.
- [x] 12.3 Deeplink test: `navigate({ kind: "settings", section: "about" })` scrolls to About.
- [x] 12.4 Verify old modal path is gone (gear icon no longer opens modal).
