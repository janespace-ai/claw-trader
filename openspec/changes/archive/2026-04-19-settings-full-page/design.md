## Context

Settings is a low-traffic screen but the first thing a new user sees — needs to feel polished. Pencil shows 6-7 sections plus sub-groupings; that's a lot of UI real estate. Full-page at 1800px tall means scroll, with sticky nav on the left for orientation.

## Goals / Non-Goals

**Goals:**
- Pixel match `0qnH2` + `uWni9`.
- All sections functional (even if some actions like Import/Export are stubs in this change).
- Engine status card shows real data when available, "unavailable" banner otherwise.
- User edits persist immediately (no "Save" button — autosave to SQLite).

**Non-Goals:**
- Import/Export actual implementation (stubs only).
- Cloud sync.
- Multi-profile support.

## Decisions

### D1. Single scrollable page + sticky section nav

**Decision.** Left column (220px wide, `$surface-secondary` bg) with section links; right column scrolls. Clicking a link scrolls-into-view using `scrollIntoView({ behavior: "smooth", block: "start" })`. Current section highlighted via IntersectionObserver.

### D2. Autosave, no explicit Save button

**Decision.** Every input commits on blur (or after 500ms debounce for text fields). Toast "Saved" appears briefly on commit. If validation fails (e.g. bad URL), input goes red, toast "Invalid format" shown, value not persisted.

This matches the existing SettingsStore pattern (`setProviderConfig`, `setTheme`, etc. all autosave).

### D3. Remote Engine card refreshes on focus + manual button

**Decision.** On component mount + on window focus event, call `cremote.getEngineStatus()`. Also expose "Refresh" button. Display status age ("Last checked 3m ago") for transparency.

Failed calls → banner "Engine offline" + don't hide the card (show last-known values in muted color).

### D4. `Import/Export` is a section, actual import/export stubbed

**Decision.** UI is complete — file picker button for import, download button for export. Handlers log to console + toast "Coming soon" for now. Follow-up change `settings-import-export-impl` does the real work.

### D5. Local Storage section queries Electron APIs

**Decision.** `window.claw.db.size()` (new IPC channel) returns SQLite file size. `Clear cache` → `window.claw.db.clearCache()` (also new IPC, careful — clears non-user data: LLM provider cache, etc.; does NOT clear strategies/settings).

These IPC additions are small — ship them in this change.

### D6. Settings deeplinking via `route.section`

**Decision.** `appStore.navigate({ kind: "settings", section: "ai-keys" })` scrolls to the matching section on load. Useful for "Open settings → API Keys" from elsewhere in the UI.

Sections: `ai-keys | remote-engine | appearance | language | chart | local-storage | import-export | about`.

## Risks / Trade-offs

- **[Autosave races with rapid edits]** → Debounce per-field; last-write-wins. Good enough.

- **[API key input fields should mask by default]** → Yes, with toggle to reveal. Not in Pencil explicitly but a security nicety.

- **[Theme change during settings has a visible flash]** → Theme switch re-runs theme variables; charts redraw. Minor flash acceptable; if users complain, add a transition on CSS vars.

- **[Refresh spam on Engine card]** → Debounce 2s between refreshes. Prevents accidental double-clicks hammering the endpoint.

## Migration Plan

1. Implement new SettingsScreen.
2. Rewire TopBar gear icon to navigate to route instead of toggling modal state.
3. Delete old SettingsModal.

## Open Questions

- "Appearance" section's theme tiles — should the "Light" tile render the light preview even in dark mode? → Yes. Each tile is a self-contained preview, style scoped.
- Section order? Pencil shows: Settings group (AI & API Keys, Remote Engine, Appearance) then Data group (Local Storage, Import/Export) then About. Follow that. → Yes.
