import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { StrategyLibraryCard } from './StrategyLibraryCard';
import type { WorkspaceStrategy, ChatMessage } from '@/stores/strategySessionStore';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, opts?: { defaultValue?: string; n?: number }) => {
      let s = opts?.defaultValue ?? _key;
      if (opts?.n != null) s = s.replace('{{n}}', String(opts.n));
      return s;
    },
  }),
}));

const NOW_S = Math.floor(Date.now() / 1000);

function fixture(overrides: Partial<WorkspaceStrategy> = {}): WorkspaceStrategy {
  return {
    id: 's-1',
    name: 'BTC 均值回归 v3',
    code_type: 'strategy',
    code: '',
    current_version: 1,
    created_at: NOW_S - 5 * 86400,
    updated_at: NOW_S - 2 * 86400, // 2 days ago
    draft_code: 'class S: ...',
    draft_symbols: ['BTC/USDT', 'ETH/USDT'],
    saved_code: 'class S: ...',
    saved_symbols: ['BTC/USDT', 'ETH/USDT'],
    saved_at: NOW_S - 2 * 86400,
    last_backtest: { task_id: 't1', summary: { pnl_pct: 18.3 }, ran_at: NOW_S - 2 * 86400 },
    is_archived_draft: false,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('StrategyLibraryCard — saved strategy with backtest', () => {
  it('renders name + saved badge + green PnL pill + symbol count', () => {
    render(
      <StrategyLibraryCard
        strategy={fixture()}
        lastMessage={null}
        favorite={false}
        onClick={() => {}}
      />,
    );
    expect(screen.getByText('BTC 均值回归 v3')).toBeTruthy();
    expect(screen.getByText('已保存')).toBeTruthy();
    expect(screen.getByText('+18.3%')).toBeTruthy();
    expect(screen.getByText('2 syms')).toBeTruthy();
  });

  it('shows "—" snippet when no chat history', () => {
    render(
      <StrategyLibraryCard
        strategy={fixture()}
        lastMessage={null}
        favorite={false}
        onClick={() => {}}
      />,
    );
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('shows AI/user chat snippet when present (with role prefix)', () => {
    const msg: ChatMessage = {
      strategy_id: 's-1',
      msg_idx: 5,
      role: 'assistant',
      content: '调到 RSI 21 之后波动小很多, 最大回撤 -8% → -4%',
      created_at: NOW_S,
      metadata: null,
    };
    render(
      <StrategyLibraryCard
        strategy={fixture()}
        lastMessage={msg}
        favorite={false}
        onClick={() => {}}
      />,
    );
    expect(screen.getByText(/AI: 调到 RSI 21/)).toBeTruthy();
  });
});

describe('StrategyLibraryCard — draft strategy', () => {
  it('renders draft badge and gray PnL pill for no-backtest strategies', () => {
    render(
      <StrategyLibraryCard
        strategy={fixture({
          name: '未命名',
          saved_at: null,
          last_backtest: null,
          is_archived_draft: false,
        })}
        lastMessage={null}
        favorite={false}
        onClick={() => {}}
      />,
    );
    expect(screen.getByText('草稿')).toBeTruthy();
    // dash pill
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('renders red PnL pill when backtest is negative', () => {
    render(
      <StrategyLibraryCard
        strategy={fixture({
          last_backtest: { task_id: 't', summary: { pnl_pct: -2.1 }, ran_at: NOW_S },
        })}
        lastMessage={null}
        favorite={false}
        onClick={() => {}}
      />,
    );
    expect(screen.getByText('-2.1%')).toBeTruthy();
  });

  it('renders archived draft badge', () => {
    render(
      <StrategyLibraryCard
        strategy={fixture({ saved_at: null, is_archived_draft: true })}
        lastMessage={null}
        favorite={false}
        onClick={() => {}}
      />,
    );
    expect(screen.getByText('归档草稿')).toBeTruthy();
  });
});

describe('StrategyLibraryCard — interactions', () => {
  it('clicking the card body fires onClick (open strategy)', () => {
    const onClick = vi.fn();
    render(
      <StrategyLibraryCard
        strategy={fixture()}
        lastMessage={null}
        favorite={false}
        onClick={onClick}
      />,
    );
    fireEvent.click(screen.getByText('BTC 均值回归 v3'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('clicking the star fires onToggleFavorite (and stops propagation)', () => {
    const onClick = vi.fn();
    const onToggle = vi.fn();
    render(
      <StrategyLibraryCard
        strategy={fixture()}
        lastMessage={null}
        favorite={false}
        onClick={onClick}
        onToggleFavorite={onToggle}
      />,
    );
    fireEvent.click(screen.getByText('☆'));
    expect(onToggle).toHaveBeenCalledWith(true);
    expect(onClick).not.toHaveBeenCalled();
  });
});
