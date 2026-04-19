// Runtime config loader for the main process.
//
// Resolves the initial `remoteBaseURL` with this priority chain:
//
//   1. <userData>/claw-config.json with a {"remoteBaseURL": "..."} field
//      Highest priority. Ops / power users drop this in after install
//      to point the app at their own backend without rebuilding.
//
//   2. process.env.VITE_REMOTE_BASE_URL
//      Build-time env var baked into the renderer bundle by Vite. Also
//      honoured here so the main process's initial baseURL matches what
//      the renderer will see on first paint.
//
//   3. Last-resort fallback: http://localhost:8081.
//      Single source of truth for the default, exported so the renderer
//      store can reference the same literal.
//
// The Settings UI (persisted via SQLite) always overrides whatever this
// loader returns — but that happens later in the lifecycle, once the
// renderer has loaded and called `remote.setBaseURL`.
import fs from 'node:fs';
import path from 'node:path';

/** Last-resort fallback when no env, no config file, and no persisted
 *  user setting are available. Kept as a single exported constant so it
 *  cannot drift between main and renderer. */
export const FALLBACK_REMOTE_BASE_URL = 'http://localhost:8081';

export interface AppConfig {
  /** Resolved initial URL (never undefined — falls back to localhost). */
  remoteBaseURL: string;
  /** Where the value came from. Useful for logs + debug UI. */
  source: 'config-file' | 'env' | 'fallback';
  /** Absolute path the loader inspected, even if the file wasn't there. */
  configPath: string;
}

/** The filename the loader expects inside Electron's `userData` dir. */
export const CONFIG_FILENAME = 'claw-config.json';

/** Load runtime config. Non-existent file and malformed JSON both fall
 *  through silently to the next layer of the chain — the renderer's
 *  Settings page remains the definitive place to change URLs. */
export function loadAppConfig(userDataPath: string): AppConfig {
  const configPath = path.join(userDataPath, CONFIG_FILENAME);

  // 1. Config file
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw) as { remoteBaseURL?: unknown };
    if (typeof parsed.remoteBaseURL === 'string' && parsed.remoteBaseURL.trim()) {
      return {
        remoteBaseURL: stripTrailingSlashes(parsed.remoteBaseURL.trim()),
        source: 'config-file',
        configPath,
      };
    }
  } catch (err: unknown) {
    // ENOENT (no file) is normal; log parse errors so ops can spot typos.
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code && code !== 'ENOENT') {
      // eslint-disable-next-line no-console
      console.warn(`[config] ${configPath} exists but could not be parsed:`, err);
    }
  }

  // 2. Build-time env (Vite bakes VITE_* into the renderer bundle; here
  // we read the same name via process.env so the main process agrees).
  const envURL = process.env.VITE_REMOTE_BASE_URL?.trim();
  if (envURL) {
    return {
      remoteBaseURL: stripTrailingSlashes(envURL),
      source: 'env',
      configPath,
    };
  }

  // 3. Fallback
  return {
    remoteBaseURL: FALLBACK_REMOTE_BASE_URL,
    source: 'fallback',
    configPath,
  };
}

function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, '');
}
