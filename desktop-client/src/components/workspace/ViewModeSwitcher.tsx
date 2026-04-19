import { useTranslation } from 'react-i18next';
import type { ViewMode } from '@/stores/workspaceStore';

interface Props {
  viewMode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

/**
 * Two-chip switcher `[Chart] [Grid]` used in Preview + Deep topbars.
 * Pencil primitive `tb9` (view-switcher chips).
 */
export function ViewModeSwitcher({ viewMode, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex bg-surface-tertiary rounded-md p-0.5 text-[11px]">
      {(['chart', 'grid'] as ViewMode[]).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={
            'px-2 py-1 rounded-sm ' +
            (viewMode === m
              ? 'bg-surface-primary text-fg-primary'
              : 'text-fg-secondary hover:text-fg-primary')
          }
        >
          {t(`view_mode.${m}`)}
        </button>
      ))}
    </div>
  );
}
