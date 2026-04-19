import { beforeEach, describe, expect, test } from 'vitest';
import { useAppStore } from './appStore';

describe('appStore — route + currentTab sync', () => {
  beforeEach(() => {
    useAppStore.getState().navigate({ kind: 'workspace' });
    useAppStore.setState({ aiPanelCollapsed: false, aiPanelWidth: 420 });
  });

  test('navigate({ kind: "screener" }) updates currentTab mirror', () => {
    useAppStore.getState().navigate({ kind: 'screener' });
    const s = useAppStore.getState();
    expect(s.route.kind).toBe('screener');
    expect(s.currentTab).toBe('screener');
  });

  test('navigate({ kind: "workspace" }) resolves to backtest tab', () => {
    useAppStore.getState().navigate({ kind: 'workspace', strategyId: 'abc' });
    const s = useAppStore.getState();
    expect(s.route.kind).toBe('workspace');
    expect(s.currentTab).toBe('backtest');
  });

  test('symbol-detail route keeps currentTab unchanged', () => {
    useAppStore.getState().navigate({ kind: 'screener' });
    useAppStore.getState().navigate({
      kind: 'symbol-detail',
      symbol: 'BTC_USDT',
      returnTo: { kind: 'screener' },
    });
    const s = useAppStore.getState();
    expect(s.route.kind).toBe('symbol-detail');
    // currentTab is held over from the last mappable route
    expect(s.currentTab).toBe('screener');
  });

  test('legacy setTab still works', () => {
    useAppStore.getState().setTab('strategies');
    const s = useAppStore.getState();
    expect(s.route.kind).toBe('strategies');
    expect(s.currentTab).toBe('strategies');
  });

  test('AI panel collapse toggle', () => {
    useAppStore.getState().toggleAIPanel();
    expect(useAppStore.getState().aiPanelCollapsed).toBe(true);
    useAppStore.getState().toggleAIPanel();
    expect(useAppStore.getState().aiPanelCollapsed).toBe(false);
  });
});
