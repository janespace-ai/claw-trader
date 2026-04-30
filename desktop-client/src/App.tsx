import { useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { DeepBacktest } from '@/screens/workspace/DeepBacktest';
import { SymbolDetailScreen } from '@/screens/SymbolDetailScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { useAppStore } from '@/stores/appStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useStrategyStore } from '@/stores/strategyStore';

/**
 * Top-level route renderer.  Switches on `appStore.route.kind`.
 *
 * **NOTE: this file is in mid-rebuild for the unified-strategy-workspace
 * change.**  The new front-door tab (创建/编辑策略) and the new 策略库
 * tab are not yet implemented (Groups 4-5 of tasks.md).  For now:
 *
 *   route.kind === 'workspace'     → DeepBacktest only (drill-down view)
 *   route.kind === 'symbol-detail' → SymbolDetailScreen
 *   route.kind === 'settings'      → SettingsScreen
 *
 * Other route.kind values fall through to a placeholder.  This is
 * intentional for the duration of the rebuild — the legacy ScreenerScreen
 * / StrategiesScreen / StrategyDesign / PreviewBacktest were deleted in
 * Group 14 and their replacements arrive in Groups 4-5.
 */
export default function App() {
  const route = useAppStore((s) => s.route);

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
          {route.kind === 'workspace' && <DeepBacktest />}
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
          {(route.kind === 'screener' || route.kind === 'strategies') && (
            <div className="p-8 text-fg-muted">
              此页面正在重建（unified-strategy-workspace change · Groups 4-5）。
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
