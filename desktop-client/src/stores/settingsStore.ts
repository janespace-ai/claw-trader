import { create } from 'zustand';
import type { Provider } from '@/types/domain';
import { PROVIDER_MODEL_DEFAULTS } from '@/services/llm/client';
import type { AILangPolicy } from '@/services/i18n';
import type { CandleConvention, ThemePref } from '@/services/theme';

/**
 * Last-resort fallback for the service-api URL.
 *
 * The actual resolution order at runtime is:
 *   1. SQLite user setting (`remote.baseURL`) — set via the Settings UI
 *   2. Main-process AppConfig from `window.claw.config.get()`, which in
 *      turn resolves <userData>/claw-config.json  →  VITE_REMOTE_BASE_URL
 *      build-time env  →  this constant
 *   3. This constant (if both the renderer IPC and the env miss)
 *
 * Keep this in sync with FALLBACK_REMOTE_BASE_URL in `electron/config.ts`.
 */
const FALLBACK_REMOTE_BASE_URL = 'http://localhost:8081';

/** Read VITE_REMOTE_BASE_URL baked in by Vite at build time. Empty
 *  string is treated the same as "not set". */
function buildTimeEnvURL(): string | undefined {
  // import.meta.env is populated by Vite; `.env` / `.env.local` / inline
  // `VITE_REMOTE_BASE_URL=... pnpm build` all work.
  const raw = (import.meta.env as Record<string, unknown>).VITE_REMOTE_BASE_URL;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return undefined;
}

/** Ask the Electron main process for the resolved AppConfig. Returns
 *  undefined in browser-only mode (no `window.claw`). */
async function mainProcessConfigURL(): Promise<string | undefined> {
  const configApi = (globalThis as { claw?: { config?: { get?: () => Promise<{ remoteBaseURL?: string }> } } }).claw?.config;
  if (!configApi?.get) return undefined;
  try {
    const cfg = await configApi.get();
    if (cfg && typeof cfg.remoteBaseURL === 'string' && cfg.remoteBaseURL.trim()) {
      return cfg.remoteBaseURL.trim();
    }
  } catch {
    // IPC failure shouldn't break boot — fall through to next layer.
  }
  return undefined;
}

/** Full resolver: SQLite → main-process AppConfig → build-time env → fallback. */
async function resolveInitialRemoteURL(sqliteValue: string | undefined): Promise<string> {
  if (sqliteValue && sqliteValue.trim()) return sqliteValue.trim();
  const mainURL = await mainProcessConfigURL();
  if (mainURL) return mainURL;
  const envURL = buildTimeEnvURL();
  if (envURL) return envURL;
  return FALLBACK_REMOTE_BASE_URL;
}

export interface ProviderConfig {
  apiKey: string;
  baseURL?: string;
  model: string;
  connected?: boolean | null;
}

interface SettingsState {
  defaultProvider: Provider;
  providers: Record<Provider, ProviderConfig>;

  remoteBaseURL: string;
  remoteConnected: boolean | null;

  theme: ThemePref;
  language: 'en' | 'zh';
  candleConvention: CandleConvention;
  aiLanguagePolicy: AILangPolicy;

  // Actions
  load: () => Promise<void>;
  setProviderConfig: (p: Provider, cfg: Partial<ProviderConfig>) => Promise<void>;
  setDefaultProvider: (p: Provider) => Promise<void>;
  setRemoteBaseURL: (url: string) => Promise<void>;
  setTheme: (t: ThemePref) => Promise<void>;
  setLanguage: (l: 'en' | 'zh') => Promise<void>;
  setCandleConvention: (c: CandleConvention) => Promise<void>;
  setAILangPolicy: (p: AILangPolicy) => Promise<void>;
  checkRemoteHealth: () => Promise<void>;
}

const defaultProviders = (): Record<Provider, ProviderConfig> => ({
  openai:    { apiKey: '', model: PROVIDER_MODEL_DEFAULTS.openai },
  deepseek:  { apiKey: '', model: PROVIDER_MODEL_DEFAULTS.deepseek },
  kimi:      { apiKey: '', model: PROVIDER_MODEL_DEFAULTS.kimi },
  anthropic: { apiKey: '', model: PROVIDER_MODEL_DEFAULTS.anthropic },
  google:    { apiKey: '', model: PROVIDER_MODEL_DEFAULTS.google },
});

export const useSettingsStore = create<SettingsState>((set, get) => ({
  defaultProvider: 'anthropic',
  providers: defaultProviders(),
  // Pre-load initial placeholder; real value is resolved in load() below.
  remoteBaseURL: FALLBACK_REMOTE_BASE_URL,
  remoteConnected: null,
  theme: 'auto',
  language: 'en',
  candleConvention: 'green-up',
  aiLanguagePolicy: 'follow-input',

  async load() {
    const db = window.claw.db.settings;
    const [defProv, provs, url, lang, theme, candle, aiPol] = await Promise.all([
      db.get<Provider>('llm.defaultProvider'),
      db.get<Record<Provider, ProviderConfig>>('llm.providers'),
      db.get<string>('remote.baseURL'),
      db.get<'en' | 'zh'>('ui.language'),
      db.get<ThemePref>('ui.theme'),
      db.get<CandleConvention>('chart.candleUp'),
      db.get<AILangPolicy>('ai.language'),
    ]);

    // Resolve the URL through the full priority chain. `url` (from
    // SQLite) wins if set; otherwise we ask the Electron main process
    // what it resolved (config.json / env / fallback).
    const remoteBaseURL = await resolveInitialRemoteURL(url);

    set({
      defaultProvider: defProv ?? 'anthropic',
      providers: { ...defaultProviders(), ...(provs ?? {}) },
      remoteBaseURL,
      language: lang ?? 'en',
      theme: theme ?? 'auto',
      candleConvention: candle ?? (lang === 'zh' ? 'red-up' : 'green-up'),
      aiLanguagePolicy: aiPol ?? 'follow-input',
    });

    // Push the resolved URL to the Electron main process so the remote
    // IPC client uses the same value we just picked. (In the SQLite-hit
    // path this is idempotent — main already had it from AppConfig.)
    await window.claw.remote.setBaseURL(remoteBaseURL);
    await get().checkRemoteHealth();
  },

  async setProviderConfig(p, cfg) {
    const providers = { ...get().providers, [p]: { ...get().providers[p], ...cfg } };
    set({ providers });
    await window.claw.db.settings.set('llm.providers', providers);
  },

  async setDefaultProvider(p) {
    set({ defaultProvider: p });
    await window.claw.db.settings.set('llm.defaultProvider', p);
  },

  async setRemoteBaseURL(url) {
    set({ remoteBaseURL: url });
    await window.claw.db.settings.set('remote.baseURL', url);
    await window.claw.remote.setBaseURL(url);
    await get().checkRemoteHealth();
  },

  async setTheme(t) {
    set({ theme: t });
    await window.claw.db.settings.set('ui.theme', t);
  },

  async setLanguage(l) {
    set({ language: l });
    await window.claw.db.settings.set('ui.language', l);
  },

  async setCandleConvention(c) {
    set({ candleConvention: c });
    await window.claw.db.settings.set('chart.candleUp', c);
  },

  async setAILangPolicy(p) {
    set({ aiLanguagePolicy: p });
    await window.claw.db.settings.set('ai.language', p);
  },

  async checkRemoteHealth() {
    const r = (await window.claw.remote.health()) as { ok: boolean };
    set({ remoteConnected: !!r?.ok });
  },
}));
