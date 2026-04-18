import { useTranslation } from 'react-i18next';
import { useAppStore, type Tab } from '@/stores/appStore';
import { useSettingsStore } from '@/stores/settingsStore';

interface Props {
  onOpenSettings: () => void;
}

export function TopBar({ onOpenSettings }: Props) {
  const { t } = useTranslation();
  const tab = useAppStore((s) => s.currentTab);
  const setTab = useAppStore((s) => s.setTab);
  const remoteConnected = useSettingsStore((s) => s.remoteConnected);

  const tabs: { key: Tab; labelKey: string }[] = [
    { key: 'screener', labelKey: 'nav.screener' },
    { key: 'strategies', labelKey: 'nav.strategies' },
    { key: 'backtest', labelKey: 'nav.backtest' },
  ];

  return (
    <div className="flex items-center justify-between h-14 px-5 bg-surface-secondary border-b border-border-subtle">
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-md bg-accent-primary text-fg-inverse font-bold grid place-items-center">
          C
        </div>
        <span className="font-heading font-semibold text-sm">{t('app.title')}</span>
      </div>

      <div className="flex items-center gap-1">
        {tabs.map((x) => (
          <button
            key={x.key}
            onClick={() => setTab(x.key)}
            className={
              'px-4 py-2 rounded-md text-xs font-medium transition-colors ' +
              (tab === x.key
                ? 'bg-accent-primary-dim text-accent-primary'
                : 'text-fg-secondary hover:text-fg-primary')
            }
          >
            {t(x.labelKey)}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <div
          className={
            'flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-medium ' +
            (remoteConnected
              ? 'bg-[color:var(--accent-green-dim)] text-accent-green'
              : 'bg-[color:var(--accent-red-dim)] text-accent-red')
          }
        >
          <span
            className={
              'w-1.5 h-1.5 rounded-full ' +
              (remoteConnected ? 'bg-accent-green' : 'bg-accent-red')
            }
          />
          {t(remoteConnected ? 'status.connected' : 'status.disconnected')}
        </div>
        <button
          onClick={onOpenSettings}
          className="text-fg-secondary hover:text-fg-primary text-sm px-2"
          aria-label={t('nav.settings')}
        >
          ⚙
        </button>
      </div>
    </div>
  );
}
