import { beforeEach, describe, expect, test } from 'vitest';
import { useAppStore } from './appStore';
import { legacyTabToRoute } from '@/types/navigation';

describe('appStore — route + currentTab sync', () => {
  beforeEach(() => {
    useAppStore.getState().navigate({ kind: 'workspace' });
    useAppStore.setState({ aiPanelCollapsed: false, aiPanelWidth: 420 });
  });

  test('navigate({ kind: "library" }) updates currentTab mirror', () => {
    useAppStore.getState().navigate({ kind: 'library' });
    const s = useAppStore.getState();
    expect(s.route.kind).toBe('library');
    expect(s.currentTab).toBe('library');
  });

  test('navigate({ kind: "workspace" }) resolves to workspace tab', () => {
    useAppStore.getState().navigate({ kind: 'workspace', strategyId: 'abc' });
    const s = useAppStore.getState();
    expect(s.route.kind).toBe('workspace');
    expect(s.currentTab).toBe('workspace');
  });

  test('symbol-detail route keeps currentTab unchanged', () => {
    useAppStore.getState().navigate({ kind: 'library' });
    useAppStore.getState().navigate({
      kind: 'symbol-detail',
      symbol: 'BTC_USDT',
      returnTo: { kind: 'library' },
    });
    const s = useAppStore.getState();
    expect(s.route.kind).toBe('symbol-detail');
    // currentTab is held over from the last mappable route
    expect(s.currentTab).toBe('library');
  });

  test('setTab maps to AppRoute correctly', () => {
    useAppStore.getState().setTab('library');
    expect(useAppStore.getState().route.kind).toBe('library');
    useAppStore.getState().setTab('settings');
    expect(useAppStore.getState().route.kind).toBe('settings');
    useAppStore.getState().setTab('workspace');
    expect(useAppStore.getState().route.kind).toBe('workspace');
  });

  test('AI panel collapse toggle', () => {
    useAppStore.getState().toggleAIPanel();
    expect(useAppStore.getState().aiPanelCollapsed).toBe(true);
    useAppStore.getState().toggleAIPanel();
    expect(useAppStore.getState().aiPanelCollapsed).toBe(false);
  });
});

describe('legacyTabToRoute — route fallback for v0 users', () => {
  test('"screener" (legacy) → workspace (new default)', () => {
    expect(legacyTabToRoute('screener')).toEqual({ kind: 'workspace' });
  });

  test('"backtest" (legacy) → workspace', () => {
    expect(legacyTabToRoute('backtest')).toEqual({ kind: 'workspace' });
  });

  test('"strategies" (legacy) → library', () => {
    expect(legacyTabToRoute('strategies')).toEqual({ kind: 'library' });
  });

  test('null / unknown → workspace', () => {
    expect(legacyTabToRoute(null)).toEqual({ kind: 'workspace' });
    expect(legacyTabToRoute('whatever')).toEqual({ kind: 'workspace' });
  });
});
