import { useTranslation } from 'react-i18next';
import { useAppStore, type Tab } from '@/stores/appStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';

interface Props {
  onOpenSettings: () => void;
}

export function TopBar({ onOpenSettings }: Props) {
  const { t } = useTranslation();
  const tab = useAppStore((s) => s.currentTab);
  const setTab = useAppStore((s) => s.setTab);
  const enterDesign = useWorkspaceStore((s) => s.enterDesign);
  const remoteConnected = useSettingsStore((s) => s.remoteConnected);

  // "Backtest" tab maps to the workspace route. Clicking it from any
  // other tab should land on the Strategy Design sub-mode rather than
  // whatever mode the user left behind previously.
  const handleTabClick = (key: Tab) => {
    setTab(key);
    if (key === 'backtest') {
      enterDesign();
    }
  };

  const tabs: { key: Tab; labelKey: string }[] = [
    { key: 'screener', labelKey: 'nav.screener' },
    { key: 'strategies', labelKey: 'nav.strategies' },
    { key: 'backtest', labelKey: 'nav.backtest' },
  ];

  return (
    <div className="flex items-center justify-between h-14 px-5 bg-surface-secondary border-b border-border-subtle">
      {/* Brand — Pencil TopBar `tbL`. Logo mark bumped from 28→32px and
          the wordmark from 14→16px so the app title is legible at the
          same glance as the right-hand status pill. */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-md bg-accent-primary text-fg-inverse font-bold grid place-items-center text-lg font-heading">
          C
        </div>
        <span className="font-heading font-semibold text-base">{t('app.title')}</span>
      </div>

      {/* Tabs — Pencil TopBar `tbC`. Larger text (14px vs 12px) + more
          generous padding (10×18 vs 8×16) makes each tab a proper tap
          target and matches the redesigned Pencil `nFWSA`. */}
      <div className="flex items-center gap-1.5">
        {tabs.map((x) => (
          <button
            key={x.key}
            onClick={() => handleTabClick(x.key)}
            className={
              'px-4 py-2.5 rounded-md text-sm font-medium transition-colors ' +
              (tab === x.key
                ? 'bg-accent-primary-dim text-accent-primary font-semibold'
                : 'text-fg-secondary hover:text-fg-primary hover:bg-surface-tertiary')
            }
          >
            {t(x.labelKey)}
          </button>
        ))}
      </div>

      {/* Right-side — Pencil TopBar `tbR`. Status pill text 11→13px and
          the settings button gets a proper 36×36 tap box with a 20px
          glyph instead of a bare text-sm character. */}
      <div className="flex items-center gap-3">
        <div
          className={
            'flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[13px] font-medium ' +
            (remoteConnected
              ? 'bg-[color:var(--accent-green-dim)] text-accent-green'
              : 'bg-[color:var(--accent-red-dim)] text-accent-red')
          }
        >
          <span
            className={
              'w-2 h-2 rounded-full ' +
              (remoteConnected ? 'bg-accent-green' : 'bg-accent-red')
            }
          />
          {t(remoteConnected ? 'status.connected' : 'status.disconnected')}
        </div>
        <button
          onClick={onOpenSettings}
          className="w-9 h-9 rounded-md grid place-items-center text-fg-secondary hover:text-fg-primary hover:bg-surface-tertiary text-lg transition-colors"
          aria-label={t('nav.settings')}
        >
          ⚙
        </button>
      </div>
    </div>
  );
}
