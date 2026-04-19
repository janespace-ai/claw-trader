## 1. Prereqs

- [ ] 1.1 `ui-foundation`, `api-contract-new-capabilities` landed.

## 2. Delete modal implementation

- [ ] 2.1 Identify all references to `SettingsModal` / `setSettingsOpen` in `App.tsx`.
- [ ] 2.2 Rewire TopBar gear icon: `appStore.navigate({ kind: "settings" })` instead of local state.
- [ ] 2.3 Delete `src/pages/SettingsPage.tsx` (content salvageable into sub-components).

## 3. New screen scaffold

- [ ] 3.1 Create `src/screens/SettingsScreen.tsx` using a simple 2-column flex: left sticky nav + right scroll container.
- [ ] 3.2 `SettingsNav.tsx` — 8-item list, current-section highlight via IntersectionObserver hook.
- [ ] 3.3 Route: `route.kind === "settings"` → `<SettingsScreen initialSection={route.section} />`.

## 4. AI & API Keys section

- [ ] 4.1 `ProviderCard.tsx` — one per provider. Props: `provider`, `config`, `isDefault`, `onChange`.
- [ ] 4.2 API key mask toggle.
- [ ] 4.3 Test button → calls existing provider health-check logic.
- [ ] 4.4 Default radio group at section top.
- [ ] 4.5 AI response language toggle at section bottom (existing `settingsStore.aiLanguagePolicy`).

## 5. Remote Engine section

- [ ] 5.1 `RemoteEngineCard.tsx`.
- [ ] 5.2 On mount + on window focus: `cremote.getEngineStatus()`.
- [ ] 5.3 Render version / markets / intervals / data range / sync time / active tasks.
- [ ] 5.4 Show `remoteBaseURL` with source pill (config-file / env / fallback — from `window.claw.config.get()`).
- [ ] 5.5 Refresh button with 2s debounce.
- [ ] 5.6 Connected/Offline badge.

## 6. Appearance, Language, Chart sections

- [ ] 6.1 `ThemeTile.tsx` — 3 tiles, visual preview per theme, selected state.
- [ ] 6.2 Language chips (English / 中文).
- [ ] 6.3 Candle convention tiles (green-up / red-up).

## 7. Local Storage section

- [ ] 7.1 New IPC: `window.claw.db.size()` — returns file size of the SQLite DB file. Add to preload + electron/ipc/db.ts.
- [ ] 7.2 New IPC: `window.claw.db.clearCache()` — clears conversation partials, LLM cache (but not strategies/settings). Add to preload + electron/ipc/db.ts.
- [ ] 7.3 UI: size display + Clear cache button + confirm dialog.
- [ ] 7.4 Export all data button (stub).

## 8. Import / Export section

- [ ] 8.1 `ImportExportSection.tsx`: two buttons.
- [ ] 8.2 File picker opens via Electron dialog (new IPC or existing file API).
- [ ] 8.3 Handlers toast "Coming soon" and log to console — no real impl.

## 9. About section

- [ ] 9.1 Static render of version (from package.json), links.
- [ ] 9.2 External links use Electron `shell.openExternal` via new IPC or existing.

## 10. Tests

- [ ] 10.1 `e2e/visual/settings.spec.ts` with 4 baselines.
- [ ] 10.2 Vitest: `screens/SettingsScreen.test.tsx` — section nav scroll, autosave flows.
- [ ] 10.3 Vitest: `components/settings/RemoteEngineCard.test.tsx` — loading, error, refresh.
- [ ] 10.4 Vitest: `components/settings/ProviderCard.test.tsx` — API key mask, default toggle.

## 11. Documentation

- [ ] 11.1 `docs/design-alignment.md` — `ProviderCard`, `ThemeTile`, `RemoteEngineCard`.
- [ ] 11.2 Update `CONFIGURATION.md` — link to the new Remote Engine card ("see source of current URL in Settings").

## 12. Final validation

- [ ] 12.1 All tests green.
- [ ] 12.2 Manual: open Settings, navigate every section, toggle theme, flip candle convention, refresh engine status.
- [ ] 12.3 Deeplink test: `navigate({ kind: "settings", section: "about" })` scrolls to About.
- [ ] 12.4 Verify old modal path is gone (gear icon no longer opens modal).
