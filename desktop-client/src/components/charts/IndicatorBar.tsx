// IndicatorBar — single-row flat indicator strip below the K-line.
//
// Pencil reference: frame `o6P9z` (USW3Z++++ · K线 · 紧凑布局).
//
// All indicators (overlays + subcharts) share one horizontal scrollable
// row; clicking any name toggles it.  The store routes the toggle to
// the right array based on the registry's `kind` field — UI is unaware
// of the overlay/subchart distinction.  A subtle 1px separator marks
// the visual boundary between overlays and subcharts; subchart cap of 6
// surfaces an inline notice when exceeded.

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useChartIndicatorsStore,
  SUBCHART_INDICATOR_CAP,
} from '@/stores/chartIndicatorsStore';
import {
  getOverlayIndicators,
  getSubchartIndicators,
} from '@/chart/indicators/registry';

export function IndicatorBar() {
  const { t } = useTranslation();
  const overlays = useChartIndicatorsStore((s) => s.overlays);
  const subcharts = useChartIndicatorsStore((s) => s.subcharts);
  const toggleOverlay = useChartIndicatorsStore((s) => s.toggleOverlay);
  const toggleSubchart = useChartIndicatorsStore((s) => s.toggleSubchart);
  const [notice, setNotice] = useState<string | null>(null);

  // Source-of-truth = registry; the strip lists overlays first, then
  // a subtle separator, then subcharts.  No row labels.
  const overlayDefs = useMemo(() => getOverlayIndicators(), []);
  const subchartDefs = useMemo(() => getSubchartIndicators(), []);

  const onOverlayClick = (name: string) => toggleOverlay(name);
  const onSubchartClick = (name: string) => {
    const r = toggleSubchart(name);
    if (!r.ok && r.reason === 'cap') {
      setNotice(
        t('workspace.indicators.cap', {
          defaultValue: `最多 ${SUBCHART_INDICATOR_CAP} 个子图,先关一个再加`,
          cap: SUBCHART_INDICATOR_CAP,
        }) as string,
      );
      window.setTimeout(() => setNotice(null), 2400);
    }
  };

  return (
    <div className="bg-surface-primary border-t border-b border-border-subtle">
      <div className="flex items-center gap-1.5 px-4 h-9">
        <span className="text-[11px] font-semibold text-fg-muted shrink-0">
          {t('workspace.indicators.label', { defaultValue: '指标' })}
        </span>
        <span aria-hidden className="inline-block w-px h-3.5 bg-border-subtle shrink-0" />
        <div className="flex items-center gap-px overflow-x-auto scrollbar-thin flex-1 min-w-0">
          {overlayDefs.map((d) => (
            <Chip
              key={`o:${d.name}`}
              name={d.name}
              active={overlays.includes(d.name)}
              onClick={() => onOverlayClick(d.name)}
            />
          ))}
          <span
            aria-hidden
            className="inline-block w-px h-3 bg-border-subtle/70 mx-1.5 shrink-0"
          />
          {subchartDefs.map((d) => (
            <Chip
              key={`s:${d.name}`}
              name={d.name}
              active={subcharts.includes(d.name)}
              onClick={() => onSubchartClick(d.name)}
            />
          ))}
        </div>
        <span className="ml-1 text-[10px] font-mono text-fg-muted shrink-0">
          {subcharts.length}/{SUBCHART_INDICATOR_CAP}
        </span>
      </div>
      {notice && (
        <div className="px-4 py-1 text-[11px] text-accent-yellow border-t border-border-subtle">
          {notice}
        </div>
      )}
    </div>
  );
}

function Chip({
  name,
  active,
  onClick,
}: {
  name: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      data-active={active}
      className={
        'shrink-0 px-1.5 py-0.5 rounded-sm font-mono text-[11px] transition-colors ' +
        (active
          ? 'bg-[color:var(--accent-primary-dim)] text-fg-primary font-semibold'
          : 'text-fg-secondary hover:text-fg-primary hover:bg-surface-tertiary')
      }
    >
      {name}
    </button>
  );
}
