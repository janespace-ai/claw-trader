/// <reference types="vite/client" />

// Typed augmentation for the project-specific VITE_* vars Vite bakes
// into the renderer bundle at build time. Add new VITE_* vars here as
// they're introduced.
interface ImportMetaEnv {
  /** Build-time default for the backtest-engine URL. Overridden at
   *  runtime by <userData>/claw-config.json, and always beaten by the
   *  user's Settings-page override persisted in SQLite.  */
  readonly VITE_REMOTE_BASE_URL?: string;

  /** When '1', the app is being served by Vite alone (no Electron main
   *  process). Used by vite.config.ts to skip the electron plugin. */
  readonly CLAW_BROWSER_ONLY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
