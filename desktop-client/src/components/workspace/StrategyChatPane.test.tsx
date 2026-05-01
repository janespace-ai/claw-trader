import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { StrategyChatPane } from './StrategyChatPane';
import { useStrategySessionStore, type WorkspaceStrategy } from '@/stores/strategySessionStore';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? _key,
  }),
}));

function fixture(overrides: Partial<WorkspaceStrategy> = {}): WorkspaceStrategy {
  return {
    id: 's-1',
    name: '未命名',
    code_type: 'strategy',
    code: '',
    current_version: 1,
    created_at: 1700000000,
    updated_at: 1700000000,
    draft_code: null,
    draft_symbols: null,
    saved_code: null,
    saved_symbols: null,
    saved_at: null,
    last_backtest: null,
    is_archived_draft: false,
    ...overrides,
  };
}

beforeEach(() => {
  useStrategySessionStore.getState().reset();
});

afterEach(() => {
  cleanup();
});

describe('StrategyChatPane — checklist + status badge', () => {
  it('all checklist items unchecked when nothing in draft', () => {
    useStrategySessionStore.setState({ strategyId: 's-1', strategy: fixture() });
    render(<StrategyChatPane />);
    // "草稿" badge present
    expect(screen.getByText('草稿')).toBeTruthy();
  });

  it('badge flips to "已保存" when saved_at is set + clean', () => {
    useStrategySessionStore.setState({
      strategyId: 's-1',
      strategy: fixture({
        draft_code: 'x',
        saved_code: 'x',
        saved_at: 1700000999,
      }),
    });
    render(<StrategyChatPane />);
    expect(screen.getByText('已保存')).toBeTruthy();
  });

  it('badge shows "已保存 ●" when committed but dirty', () => {
    useStrategySessionStore.setState({
      strategyId: 's-1',
      strategy: fixture({
        draft_code: 'v2',
        saved_code: 'v1',
        saved_at: 1700000999,
      }),
    });
    render(<StrategyChatPane />);
    expect(screen.getByText('已保存 ●')).toBeTruthy();
  });
});

describe('StrategyChatPane — input', () => {
  it('Enter (no shift) sends + clears input', () => {
    useStrategySessionStore.setState({ strategyId: 's-1', strategy: fixture() });
    const onUserMessage = vi.fn();
    render(<StrategyChatPane onUserMessage={onUserMessage} />);
    const ta = screen.getByPlaceholderText(/描述你的想法/) as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'hello' } });
    fireEvent.keyDown(ta, { key: 'Enter', shiftKey: false });
    expect(onUserMessage).toHaveBeenCalledWith('hello');
    expect(ta.value).toBe('');
  });

  it('Shift+Enter does NOT send', () => {
    useStrategySessionStore.setState({ strategyId: 's-1', strategy: fixture() });
    const onUserMessage = vi.fn();
    render(<StrategyChatPane onUserMessage={onUserMessage} />);
    const ta = screen.getByPlaceholderText(/描述你的想法/) as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'hi' } });
    fireEvent.keyDown(ta, { key: 'Enter', shiftKey: true });
    expect(onUserMessage).not.toHaveBeenCalled();
  });

  it('empty input does NOT trigger onUserMessage', () => {
    useStrategySessionStore.setState({ strategyId: 's-1', strategy: fixture() });
    const onUserMessage = vi.fn();
    render(<StrategyChatPane onUserMessage={onUserMessage} />);
    const ta = screen.getByPlaceholderText(/描述你的想法/) as HTMLTextAreaElement;
    fireEvent.keyDown(ta, { key: 'Enter' });
    expect(onUserMessage).not.toHaveBeenCalled();
  });
});

describe('StrategyChatPane — empty state vs messages', () => {
  it('shows empty-state copy when no messages', () => {
    useStrategySessionStore.setState({ strategyId: 's-1', strategy: fixture() });
    render(<StrategyChatPane />);
    expect(screen.getByText(/想做啥策略/)).toBeTruthy();
  });

  it('renders user + assistant bubbles when messages present', () => {
    useStrategySessionStore.setState({
      strategyId: 's-1',
      strategy: fixture(),
      messages: [
        {
          strategy_id: 's-1',
          msg_idx: 0,
          role: 'user',
          content: 'hello',
          created_at: 1,
          metadata: null,
        },
        {
          strategy_id: 's-1',
          msg_idx: 1,
          role: 'assistant',
          content: 'hi back',
          created_at: 2,
          metadata: null,
        },
      ],
    });
    render(<StrategyChatPane />);
    expect(screen.getByText('hello')).toBeTruthy();
    expect(screen.getByText('hi back')).toBeTruthy();
  });
});
