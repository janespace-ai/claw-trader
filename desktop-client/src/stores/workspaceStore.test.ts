import { beforeEach, describe, expect, test } from 'vitest';
import { useWorkspaceStore } from './workspaceStore';

describe('workspaceStore — transitions', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().reset();
  });

  test('starts in design mode with null context', () => {
    const s = useWorkspaceStore.getState();
    expect(s.mode).toBe('design');
    expect(s.currentStrategyId).toBe(null);
    expect(s.currentTaskId).toBe(null);
  });

  test('enterPreview sets mode + strategy + taskId', () => {
    useWorkspaceStore.getState().enterPreview('strat-1', 'task-preview-1');
    const s = useWorkspaceStore.getState();
    expect(s.mode).toBe('preview');
    expect(s.currentStrategyId).toBe('strat-1');
    expect(s.currentTaskId).toBe('task-preview-1');
  });

  test('enterDeep from preview updates taskId, keeps strategy', () => {
    useWorkspaceStore.getState().enterPreview('strat-1', 'task-preview-1');
    useWorkspaceStore.getState().enterDeep('task-deep-1');
    const s = useWorkspaceStore.getState();
    expect(s.mode).toBe('deep');
    expect(s.currentTaskId).toBe('task-deep-1');
    expect(s.currentStrategyId).toBe('strat-1');
  });

  test('back steps deep → preview → design', () => {
    useWorkspaceStore.getState().enterPreview('strat-1', 'task-preview-1');
    useWorkspaceStore.getState().enterDeep('task-deep-1');
    useWorkspaceStore.getState().back();
    expect(useWorkspaceStore.getState().mode).toBe('preview');
    useWorkspaceStore.getState().back();
    expect(useWorkspaceStore.getState().mode).toBe('design');
    // from design, back is a no-op
    useWorkspaceStore.getState().back();
    expect(useWorkspaceStore.getState().mode).toBe('design');
  });

  test('focus updates focused symbol', () => {
    useWorkspaceStore.getState().focus('BTC_USDT');
    expect(useWorkspaceStore.getState().focusedSymbol).toBe('BTC_USDT');
    useWorkspaceStore.getState().focus(null);
    expect(useWorkspaceStore.getState().focusedSymbol).toBe(null);
  });

  test('setViewMode persists to localStorage', () => {
    useWorkspaceStore.getState().setViewMode('grid');
    expect(useWorkspaceStore.getState().viewMode).toBe('grid');
    expect(localStorage.getItem('workspace.viewMode')).toBe('grid');
  });

  test('reset clears mutable context', () => {
    useWorkspaceStore.getState().enterPreview('strat-1', 'task-1');
    useWorkspaceStore.getState().focus('ETH_USDT');
    useWorkspaceStore.getState().reset();
    const s = useWorkspaceStore.getState();
    expect(s.mode).toBe('design');
    expect(s.currentStrategyId).toBe(null);
    expect(s.currentTaskId).toBe(null);
    expect(s.focusedSymbol).toBe(null);
  });
});
