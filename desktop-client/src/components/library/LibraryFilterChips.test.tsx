import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LibraryFilterChips, type LibraryFilter } from './LibraryFilterChips';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? _key,
  }),
}));

afterEach(() => cleanup());

const counts = { all: 7, saved: 5, draft: 2, archived: 0, favorite: 1 };

describe('LibraryFilterChips', () => {
  it('renders all 5 filter chips with counts', () => {
    render(
      <LibraryFilterChips
        active={{ kind: 'all' }}
        onSelect={() => {}}
        counts={counts}
      />,
    );
    expect(screen.getByText('全部')).toBeTruthy();
    expect(screen.getByText('已保存')).toBeTruthy();
    expect(screen.getByText('草稿')).toBeTruthy();
    expect(screen.getByText('归档草稿')).toBeTruthy();
    expect(screen.getByText('收藏')).toBeTruthy();
    expect(screen.getByText('(7)')).toBeTruthy();
    expect(screen.getByText('(5)')).toBeTruthy();
    expect(screen.getByText('(2)')).toBeTruthy();
  });

  it('hides count when zero', () => {
    render(
      <LibraryFilterChips
        active={{ kind: 'all' }}
        onSelect={() => {}}
        counts={{ ...counts, archived: 0 }}
      />,
    );
    // (0) should not appear next to "归档草稿"
    expect(screen.queryByText('(0)')).toBeNull();
  });

  it('clicking a chip fires onSelect with the right filter kind', () => {
    const onSelect = vi.fn<(f: LibraryFilter) => void>();
    render(
      <LibraryFilterChips active={{ kind: 'all' }} onSelect={onSelect} counts={counts} />,
    );
    fireEvent.click(screen.getByText('已保存'));
    expect(onSelect).toHaveBeenCalledWith({ kind: 'saved' });
  });

  it('marks the active chip with aria-selected=true', () => {
    render(
      <LibraryFilterChips
        active={{ kind: 'draft' }}
        onSelect={() => {}}
        counts={counts}
      />,
    );
    const tabs = screen.getAllByRole('tab');
    const active = tabs.filter((el) => el.getAttribute('aria-selected') === 'true');
    expect(active).toHaveLength(1);
    expect(active[0].textContent).toContain('草稿');
  });
});
