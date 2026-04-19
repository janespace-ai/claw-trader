import { useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { ScreenerScreen } from '@/screens/ScreenerScreen';
import { StrategiesScreen } from '@/screens/StrategiesScreen';
import { StrategyDesign } from '@/screens/workspace/StrategyDesign';
import { PreviewBacktest } from '@/screens/workspace/PreviewBacktest';
import { DeepBacktest } from '@/screens/workspace/DeepBacktest';
import { SymbolDetailScreen } from '@/screens/SymbolDetailScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { useAppStore } from '@/stores/appStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useStrategyStore } from '@/stores/strategyStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';

/**
 * Top-level route renderer. Switches on `appStore.route.kind`.
 *
 *   route.kind === 'screener'      → ScreenerScreen (chart-first)
 *   route.kind === 'strategies'    → StrategiesScreen (card grid + history)
 *   route.kind === 'workspace'     → StrategyDesign | PreviewBacktest |
 *                                    DeepBacktest depending on
 *                                    workspaceStore.mode
 *   route.kind === 'symbol-detail' → SymbolDetailScreen
 *   route.kind === 'settings'      → SettingsScreen (full-page)
 *
 * The AI chat panel is now rendered **inside each screen's**
 * `WorkspaceShell.rightRail` (wrapped in `AIPersonaShell`). The old
 * top-level `<aside><AIPanel /></aside>` was removed to avoid showing
 * duplicate AI panels on the same screen.
 */
export default function App() {
  const route = useAppStore((s) => s.route);
  const workspaceMode = useWorkspaceStore((s) => s.mode);

  const loadSettings = useSettingsStore((s) => s.load);
  const loadStrategies = useStrategyStore((s) => s.load);
  const navigate = useAppStore((s) => s.navigate);

  useEffect(() => {
    void loadSettings();
    void loadStrategies();
  }, [loadSettings, loadStrategies]);

  return (
    <div className="flex flex-col h-full w-full">
      <TopBar onOpenSettings={() => navigate({ kind: 'settings' })} />

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          {route.kind === 'screener' && <ScreenerScreen />}
          {route.kind === 'strategies' && <StrategiesScreen />}
          {route.kind === 'workspace' && workspaceMode === 'design' && <StrategyDesign />}
          {route.kind === 'workspace' && workspaceMode === 'preview' && <PreviewBacktest />}
          {route.kind === 'workspace' && workspaceMode === 'deep' && <DeepBacktest />}
          {route.kind === 'symbol-detail' && (
            <SymbolDetailScreen
              symbol={route.symbol}
              returnTo={route.returnTo}
              backtestTaskId={route.backtestTaskId}
            />
          )}
          {route.kind === 'settings' && (
            <SettingsScreen initialSection={route.section} />
          )}
        </main>
      </div>
    </div>
  );
}
