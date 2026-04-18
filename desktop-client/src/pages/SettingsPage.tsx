import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '@/stores/settingsStore';
import { setLanguage } from '@/services/i18n';
import { setTheme } from '@/services/theme';
import type { Provider } from '@/types/domain';

interface Props {
  onClose: () => void;
}

export function SettingsModal({ onClose }: Props) {
  const { t } = useTranslation();
  const s = useSettingsStore();

  const providers: Provider[] = ['openai', 'anthropic', 'deepseek', 'google', 'kimi'];

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center overflow-y-auto py-10">
      <div className="bg-surface-primary rounded-xl w-full max-w-3xl p-6 space-y-6 border border-border-subtle">
        <div className="flex items-center justify-between">
          <div className="font-heading text-xl font-semibold">{t('settings.title')}</div>
          <button onClick={onClose} className="text-fg-muted hover:text-fg-primary">✕</button>
        </div>

        {/* Providers */}
        <div className="space-y-3">
          <div className="font-heading font-semibold text-sm">{t('settings.ai_keys')}</div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-fg-muted">Default model</span>
            <select
              value={s.defaultProvider}
              onChange={(e) => s.setDefaultProvider(e.target.value as Provider)}
              className="bg-surface-secondary rounded-md px-3 py-1.5"
            >
              {providers.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          {providers.map((p) => {
            const cfg = s.providers[p];
            return (
              <div
                key={p}
                className="bg-surface-secondary rounded-lg p-3 flex items-center gap-3 text-xs"
              >
                <div className="w-10 text-fg-primary font-mono">{p}</div>
                <input
                  type="password"
                  value={cfg.apiKey}
                  onChange={(e) => s.setProviderConfig(p, { apiKey: e.target.value })}
                  placeholder="api key"
                  className="flex-1 bg-surface-primary rounded-md px-3 py-1.5"
                />
                <input
                  type="text"
                  value={cfg.model}
                  onChange={(e) => s.setProviderConfig(p, { model: e.target.value })}
                  placeholder="model"
                  className="w-40 bg-surface-primary rounded-md px-3 py-1.5 font-mono"
                />
              </div>
            );
          })}
        </div>

        {/* Remote */}
        <div className="space-y-2">
          <div className="font-heading font-semibold text-sm">{t('settings.remote_service')}</div>
          <input
            type="text"
            value={s.remoteBaseURL}
            onChange={(e) => s.setRemoteBaseURL(e.target.value)}
            className="w-full bg-surface-secondary rounded-md px-3 py-1.5 text-xs font-mono"
          />
          <div className="text-xs text-fg-muted">
            Status: {s.remoteConnected === null ? 'checking…' : s.remoteConnected ? t('status.connected') : t('status.disconnected')}
          </div>
        </div>

        {/* Appearance */}
        <div className="space-y-3">
          <div className="font-heading font-semibold text-sm">{t('settings.appearance')}</div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-fg-muted">{t('settings.theme')}</span>
            {(['auto', 'dark', 'light'] as const).map((opt) => (
              <button
                key={opt}
                onClick={async () => {
                  await s.setTheme(opt);
                  await setTheme(opt);
                }}
                className={
                  'px-3 py-1.5 rounded-md ' +
                  (s.theme === opt
                    ? 'bg-accent-primary-dim text-accent-primary'
                    : 'bg-surface-secondary text-fg-secondary')
                }
              >
                {t(`settings.theme.${opt}`)}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="text-fg-muted">{t('settings.language')}</span>
            {(['en', 'zh'] as const).map((opt) => (
              <button
                key={opt}
                onClick={async () => {
                  await s.setLanguage(opt);
                  await setLanguage(opt);
                }}
                className={
                  'px-3 py-1.5 rounded-md ' +
                  (s.language === opt
                    ? 'bg-accent-primary-dim text-accent-primary'
                    : 'bg-surface-secondary text-fg-secondary')
                }
              >
                {opt === 'en' ? 'English' : '简体中文'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="text-fg-muted">{t('settings.candle')}</span>
            {(['green-up', 'red-up'] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => s.setCandleConvention(opt)}
                className={
                  'px-3 py-1.5 rounded-md ' +
                  (s.candleConvention === opt
                    ? 'bg-accent-primary-dim text-accent-primary'
                    : 'bg-surface-secondary text-fg-secondary')
                }
              >
                {t(`settings.candle.${opt === 'green-up' ? 'green_up' : 'red_up'}`)}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="text-fg-muted">{t('settings.ai_lang')}</span>
            {(['follow-input', 'always-en', 'always-zh'] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => s.setAILangPolicy(opt)}
                className={
                  'px-3 py-1.5 rounded-md ' +
                  (s.aiLanguagePolicy === opt
                    ? 'bg-accent-primary-dim text-accent-primary'
                    : 'bg-surface-secondary text-fg-secondary')
                }
              >
                {opt === 'follow-input'
                  ? t('settings.ai_lang.follow')
                  : opt === 'always-en'
                    ? t('settings.ai_lang.en')
                    : t('settings.ai_lang.zh')}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
