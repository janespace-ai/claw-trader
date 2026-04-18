import { create } from 'zustand';
import type { Provider } from '@/types/domain';
import { PROVIDER_MODEL_DEFAULTS } from '@/services/llm/client';
import type { AILangPolicy } from '@/services/i18n';
import type { CandleConvention, ThemePref } from '@/services/theme';

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
  remoteBaseURL: 'http://localhost:8081',
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
    set({
      defaultProvider: defProv ?? 'anthropic',
      providers: { ...defaultProviders(), ...(provs ?? {}) },
      remoteBaseURL: url ?? 'http://localhost:8081',
      language: lang ?? 'en',
      theme: theme ?? 'auto',
      candleConvention: candle ?? (lang === 'zh' ? 'red-up' : 'green-up'),
      aiLanguagePolicy: aiPol ?? 'follow-input',
    });
    if (url) await window.claw.remote.setBaseURL(url);
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
