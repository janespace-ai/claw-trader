import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { setLanguage } from '@/services/i18n';
import { setTheme } from '@/services/theme';
import { useSettingsStore } from '@/stores/settingsStore';
import { ProviderCard } from '@/components/settings/ProviderCard';
import { ThemeTile } from '@/components/settings/ThemeTile';
import { RemoteEngineCard } from './settings/RemoteEngineCard';
import type { Provider } from '@/types/domain';

const SECTIONS = [
  { id: 'providers', label: 'AI & API Keys' },
  { id: 'remote', label: 'Remote Engine' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'language', label: 'Language' },
  { id: 'chart', label: 'Chart' },
  { id: 'storage', label: 'Local Storage' },
  { id: 'import-export', label: 'Import / Export' },
  { id: 'about', label: 'About' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

interface Props {
  initialSection?: string;
}

const PROVIDERS: Provider[] = ['openai', 'anthropic', 'deepseek', 'google', 'kimi'];

/**
 * Full-page settings screen.
 * Pencil frame `0qnH2` (dark) / `uWni9` (light).
 */
export function SettingsScreen({ initialSection }: Props) {
  const { t } = useTranslation();
  const s = useSettingsStore();
  const sectionRefs = useRef<Partial<Record<SectionId, HTMLElement>>>({});
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!initialSection) return;
    const target = sectionRefs.current[initialSection as SectionId];
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [initialSection]);

  const scrollTo = (id: SectionId) => {
    const target = sectionRefs.current[id];
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="flex h-full">
      {/* Section nav */}
      <aside className="w-56 border-r border-border-subtle bg-surface-secondary p-4 shrink-0">
        <div className="font-heading font-semibold text-sm mb-3">{t('settings.title')}</div>
        <nav className="flex flex-col gap-1 text-xs">
          {SECTIONS.map((sec) => (
            <button
              key={sec.id}
              onClick={() => scrollTo(sec.id)}
              className="text-left px-2 py-1.5 rounded-md text-fg-secondary hover:text-fg-primary hover:bg-surface-tertiary"
            >
              {sec.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <div ref={containerRef} className="flex-1 overflow-y-auto p-6 space-y-10">
        {/* Providers */}
        <section
          id="providers"
          ref={(el) => {
            if (el) sectionRefs.current.providers = el;
          }}
          className="space-y-3"
        >
          <div className="font-heading font-semibold text-base">AI & API Keys</div>
          <div className="grid gap-2">
            {PROVIDERS.map((p) => (
              <ProviderCard
                key={p}
                provider={p}
                config={s.providers[p]}
                isDefault={s.defaultProvider === p}
                onChange={(patch) => s.setProviderConfig(p, patch)}
                onSetDefault={() => s.setDefaultProvider(p)}
              />
            ))}
          </div>
          <div className="flex items-center gap-3 text-xs pt-2">
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
        </section>

        {/* Remote engine */}
        <section
          id="remote"
          ref={(el) => {
            if (el) sectionRefs.current.remote = el;
          }}
          className="space-y-3"
        >
          <div className="font-heading font-semibold text-base">Remote Engine</div>
          <RemoteEngineCard />
          <div className="space-y-2">
            <label className="text-xs text-fg-muted">Backend URL override</label>
            <input
              type="text"
              value={s.remoteBaseURL}
              onChange={(e) => s.setRemoteBaseURL(e.target.value)}
              className="w-full bg-surface-secondary rounded-md px-3 py-1.5 text-xs font-mono"
            />
            <div className="text-[11px] text-fg-muted">
              Status:{' '}
              {s.remoteConnected === null
                ? 'checking…'
                : s.remoteConnected
                  ? t('status.connected')
                  : t('status.disconnected')}
            </div>
          </div>
        </section>

        {/* Appearance */}
        <section
          id="appearance"
          ref={(el) => {
            if (el) sectionRefs.current.appearance = el;
          }}
          className="space-y-3"
        >
          <div className="font-heading font-semibold text-base">Appearance</div>
          <div className="grid grid-cols-3 gap-3 max-w-lg">
            {(['auto', 'dark', 'light'] as const).map((opt) => (
              <ThemeTile
                key={opt}
                value={opt}
                selected={s.theme === opt}
                label={t(`settings.theme.${opt}`)}
                onClick={async () => {
                  await s.setTheme(opt);
                  await setTheme(opt);
                }}
              />
            ))}
          </div>
        </section>

        {/* Language */}
        <section
          id="language"
          ref={(el) => {
            if (el) sectionRefs.current.language = el;
          }}
          className="space-y-2"
        >
          <div className="font-heading font-semibold text-base">Language</div>
          <div className="flex items-center gap-3 text-xs">
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
        </section>

        {/* Chart */}
        <section
          id="chart"
          ref={(el) => {
            if (el) sectionRefs.current.chart = el;
          }}
          className="space-y-2"
        >
          <div className="font-heading font-semibold text-base">Chart</div>
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
        </section>

        {/* Local Storage */}
        <section
          id="storage"
          ref={(el) => {
            if (el) sectionRefs.current.storage = el;
          }}
          className="space-y-2"
        >
          <div className="font-heading font-semibold text-base">Local Storage</div>
          <div className="text-xs text-fg-muted">
            Size + Clear-cache IPC ships in a follow-up change. For now, clear
            browser localStorage via devtools if needed.
          </div>
        </section>

        {/* Import / Export */}
        <section
          id="import-export"
          ref={(el) => {
            if (el) sectionRefs.current['import-export'] = el;
          }}
          className="space-y-2"
        >
          <div className="font-heading font-semibold text-base">Import / Export</div>
          <div className="text-xs text-fg-muted">
            Strategy JSON import/export wiring ships in a follow-up change.
          </div>
        </section>

        {/* About */}
        <section
          id="about"
          ref={(el) => {
            if (el) sectionRefs.current.about = el;
          }}
          className="space-y-2"
        >
          <div className="font-heading font-semibold text-base">About</div>
          <div className="text-xs text-fg-secondary">
            Claw Trader — AI-driven crypto strategy design and backtesting.
          </div>
          <div className="text-[11px] text-fg-muted">
            <a
              href="https://github.com/janespace-ai/claw-trader"
              target="_blank"
              rel="noreferrer"
              className="text-accent-primary hover:underline"
            >
              GitHub
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
