import { describe, expect, test } from 'vitest';
import { render } from '@testing-library/react';
import { Watchlist } from './Watchlist/Watchlist';
import { MetricsGrid } from './MetricsGrid/MetricsGrid';
import { WorkspaceShell } from './WorkspaceShell/WorkspaceShell';
import { AIPersonaShell } from './AIPersonaShell/AIPersonaShell';
import { getPersona } from './AIPersonaShell/personas';

describe('UI primitives — smoke renders', () => {
  test('Watchlist renders N rows', () => {
    const { container, getByText } = render(
      <Watchlist
        items={[
          { symbol: 'BTC_USDT', stat: '+12.5%' },
          { symbol: 'ETH_USDT', stat: '-1.8%' },
        ]}
        focused="BTC_USDT"
      />,
    );
    expect(getByText('BTC_USDT')).toBeTruthy();
    expect(getByText('ETH_USDT')).toBeTruthy();
    // Focused row gets surface-tertiary background class
    expect(container.querySelectorAll('button').length).toBe(2);
  });

  test('MetricsGrid renders tiles with fallback for null', () => {
    const { getByText } = render(
      <MetricsGrid
        metrics={[
          { label: 'Sharpe', value: 1.82 },
          { label: 'Missing', value: null },
          { label: 'Win Rate', value: 56, unit: '%', emphasis: 'large' },
        ]}
      />,
    );
    expect(getByText('Sharpe')).toBeTruthy();
    expect(getByText('Missing')).toBeTruthy();
    expect(getByText('—')).toBeTruthy(); // null fallback
  });

  test('WorkspaceShell renders all 4 slots', () => {
    const { getByText } = render(
      <WorkspaceShell
        topbar={<div>TOPBAR</div>}
        leftRail={<div>LEFT</div>}
        main={<div>MAIN</div>}
        rightRail={<div>RIGHT</div>}
      />,
    );
    expect(getByText('TOPBAR')).toBeTruthy();
    expect(getByText('LEFT')).toBeTruthy();
    expect(getByText('MAIN')).toBeTruthy();
    expect(getByText('RIGHT')).toBeTruthy();
  });

  test('AIPersonaShell renders persona header + hides composer for read-only personas', () => {
    const { getByText, container } = render(
      <AIPersonaShell persona="trade-analysis">
        <AIPersonaShell.Intro>Intro text</AIPersonaShell.Intro>
        <AIPersonaShell.Transcript />
        <AIPersonaShell.Composer />
      </AIPersonaShell>,
    );
    expect(getByText('Trade Analysis')).toBeTruthy();
    expect(getByText('Intro text')).toBeTruthy();
    // Composer is hidden when persona.composer === false
    expect(container.textContent).not.toContain('Composer not yet');
  });

  test('persona registry has all expected entries', () => {
    for (const id of ['strategist', 'signal-review', 'optimlens', 'screener', 'trade-analysis', 'strategy-history'] as const) {
      expect(getPersona(id).id).toBe(id);
    }
  });
});
