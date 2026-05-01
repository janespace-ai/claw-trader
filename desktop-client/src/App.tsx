import { useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { DeepBacktest } from '@/screens/workspace/DeepBacktest';
import { StrategyWorkspaceScreen } from '@/screens/StrategyWorkspaceScreen';
import { LibraryScreen } from '@/screens/LibraryScreen';
import { SymbolDetailScreen } from '@/screens/SymbolDetailScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { useAppStore } from '@/stores/appStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useStrategyStore } from '@/stores/strategyStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';

/**
 * Top-level route renderer.
 *
 * Post unified-strategy-workspace, the routes are:
 *
 *   route.kind === 'workspace'     → StrategyWorkspaceScreen (the main
 *                                    chat-driven 创建/编辑策略 surface).
 *                                    Until that screen lands (Group 4),
 *                                    we render a placeholder.  When
 *                                    workspaceStore.mode === 'deep' the
 *                                    DeepBacktest "view full report" UI
 *                                    is shown instead.
 *   route.kind === 'library'       → 策略库 (Group 5; placeholder for now)
 *   route.kind === 'symbol-detail' → SymbolDetailScreen
 *   route.kind === 'settings'      → SettingsScreen
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
          {route.kind === 'workspace' && workspaceMode === 'deep' ? (
            <DeepBacktest />
          ) : route.kind === 'workspace' ? (
            <StrategyWorkspaceScreen />
          ) : route.kind === 'library' ? (
            <LibraryScreen />
          ) : route.kind === 'symbol-detail' ? (
            <SymbolDetailScreen
              symbol={route.symbol}
              returnTo={route.returnTo}
              backtestTaskId={route.backtestTaskId}
            />
          ) : (
            <SettingsScreen initialSection={route.section} />
          )}
        </main>
      </div>
    </div>
  );
}

function RebuildPlaceholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="p-12 max-w-2xl mx-auto">
      <h1 className="text-2xl font-heading font-bold text-fg-primary mb-3">{title}</h1>
      <p className="text-sm text-fg-muted leading-relaxed">{note}</p>
      <p className="text-xs text-fg-muted/70 mt-6 italic">
        Pencil reference designs in <code>docs/design/trader.pen</code>.
      </p>
    </div>
  );
}
