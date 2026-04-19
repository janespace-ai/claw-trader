import { useEffect, useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { AIPanel } from '@/components/chat/AIPanel';
import { ScreenerPage } from '@/pages/ScreenerPage';
import { StrategiesPage } from '@/pages/StrategiesPage';
import { BacktestPage } from '@/pages/BacktestPage';
import { SettingsModal } from '@/pages/SettingsPage';
import { useAppStore } from '@/stores/appStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useStrategyStore } from '@/stores/strategyStore';

/**
 * Top-level route renderer. Switches on `appStore.route.kind` (new,
 * canonical) while existing pages continue to consume `currentTab` as
 * a backward-compat string during the migration.
 *
 *   route.kind === 'screener'      → ScreenerPage (flat page; will be
 *                                    replaced by ScreenerScreen in
 *                                    `screener-chart-first`)
 *   route.kind === 'strategies'    → StrategiesPage (will become
 *                                    StrategiesScreen in
 *                                    `strategy-management-v2`)
 *   route.kind === 'workspace'     → BacktestPage today; becomes the
 *                                    3-mode Workspace across #4-#6
 *   route.kind === 'symbol-detail' → TBD (`symbol-detail` change)
 *   route.kind === 'settings'      → SettingsModal today; becomes
 *                                    SettingsScreen in #11
 */
export default function App() {
  const route = useAppStore((s) => s.route);
  const panelW = useAppStore((s) => s.aiPanelWidth);
  const panelCollapsed = useAppStore((s) => s.aiPanelCollapsed);

  const loadSettings = useSettingsStore((s) => s.load);
  const loadStrategies = useStrategyStore((s) => s.load);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    void loadSettings();
    void loadStrategies();
  }, [loadSettings, loadStrategies]);

  return (
    <div className="flex flex-col h-full w-full">
      <TopBar onOpenSettings={() => setSettingsOpen(true)} />

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          {route.kind === 'screener' && <ScreenerPage />}
          {route.kind === 'strategies' && <StrategiesPage />}
          {route.kind === 'workspace' && <BacktestPage />}
          {route.kind === 'symbol-detail' && (
            <div className="p-6 text-fg-muted">
              Symbol detail for {route.symbol} — coming in the{' '}
              <code className="text-fg-primary">symbol-detail</code> change.
            </div>
          )}
          {route.kind === 'settings' && (
            <div className="p-6 text-fg-muted">
              Full Settings screen coming in{' '}
              <code className="text-fg-primary">settings-full-page</code>.
              Meanwhile the modal below handles it.
            </div>
          )}
        </main>

        {!panelCollapsed && (
          <aside
            className="flex-shrink-0 border-l border-border-subtle bg-surface-secondary"
            style={{ width: panelW }}
          >
            <AIPanel />
          </aside>
        )}
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
