import { useEffect, useRef } from 'react';
import {
  createChart,
  type IChartApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { chartOptionsFromTheme, observeThemeChanges, readThemeVars } from './theme';

export interface EquityPoint {
  ts: number;
  value: number;
}

interface Props {
  data: EquityPoint[];
  /** Optional second series for benchmark comparison (equity variant). */
  compare?: EquityPoint[];
  /** Optional drawdown series. When variant="stacked", renders in lower pane. */
  drawdown?: EquityPoint[];
  height?: number;
  className?: string;
  /** "equity" = single line (or two with compare).
   *  "drawdown" = single area fill.
   *  "stacked" = upper equity + lower drawdown. */
  variant?: 'equity' | 'drawdown' | 'stacked';
}

/**
 * Line / area chart for equity + drawdown. Stacked variant uses two
 * separate chart instances in CSS-flex children with synchronized
 * time scales so panning affects both.
 */
export function Equity({
  data,
  compare,
  drawdown,
  height = 240,
  className,
  variant = 'equity',
}: Props) {
  const topRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const topChartRef = useRef<IChartApi | null>(null);
  const bottomChartRef = useRef<IChartApi | null>(null);

  // Proportions when stacked
  const stacked = variant === 'stacked';
  const topHeight = stacked ? Math.round(height * 0.7) : height;
  const bottomHeight = stacked ? height - topHeight : 0;

  useEffect(() => {
    if (!topRef.current) return;

    const topChart = createChart(topRef.current, chartOptionsFromTheme(topRef.current.clientWidth, topHeight));
    topChartRef.current = topChart;
    const t = readThemeVars();

    // Top pane: equity (+ compare) OR drawdown depending on variant
    if (variant === 'drawdown') {
      const series = topChart.addAreaSeries({
        lineColor: t.accentRed,
        topColor: t.accentRed,
        bottomColor: `${t.accentRed}22`,
        priceLineVisible: false,
      });
      series.setData(data.map((p) => ({ time: p.ts as UTCTimestamp, value: p.value })));
    } else {
      const primary = topChart.addLineSeries({
        color: t.accentPrimary,
        lineWidth: 2,
        priceLineVisible: false,
      });
      primary.setData(data.map((p) => ({ time: p.ts as UTCTimestamp, value: p.value })));
      if (compare && compare.length) {
        const bench = topChart.addLineSeries({
          color: t.accentYellow ?? '#F59E0B',
          lineWidth: 1,
          priceLineVisible: false,
        });
        bench.setData(compare.map((p) => ({ time: p.ts as UTCTimestamp, value: p.value })));
      }
    }

    // Stacked: bottom pane for drawdown
    if (stacked && drawdown && bottomRef.current) {
      const bottomChart = createChart(
        bottomRef.current,
        chartOptionsFromTheme(bottomRef.current.clientWidth, bottomHeight),
      );
      bottomChartRef.current = bottomChart;
      const series = bottomChart.addAreaSeries({
        lineColor: t.accentRed,
        topColor: `${t.accentRed}55`,
        bottomColor: `${t.accentRed}11`,
        priceLineVisible: false,
      });
      series.setData(drawdown.map((p) => ({ time: p.ts as UTCTimestamp, value: p.value })));

      // Synchronize time scales
      const topTS = topChart.timeScale();
      const bottomTS = bottomChart.timeScale();
      const topHandler = () => {
        const range = topTS.getVisibleRange();
        if (range) bottomTS.setVisibleRange(range);
      };
      const bottomHandler = () => {
        const range = bottomTS.getVisibleRange();
        if (range) topTS.setVisibleRange(range);
      };
      topTS.subscribeVisibleTimeRangeChange(topHandler);
      bottomTS.subscribeVisibleTimeRangeChange(bottomHandler);
    }

    // Resize observers
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        if (e.target === topRef.current) topChart.resize(e.contentRect.width, topHeight);
        if (bottomChartRef.current && e.target === bottomRef.current) {
          bottomChartRef.current.resize(e.contentRect.width, bottomHeight);
        }
      }
    });
    ro.observe(topRef.current);
    if (bottomRef.current) ro.observe(bottomRef.current);

    const stopTheme = observeThemeChanges(() => {
      topChart.applyOptions(chartOptionsFromTheme());
      bottomChartRef.current?.applyOptions(chartOptionsFromTheme());
    });

    return () => {
      ro.disconnect();
      stopTheme();
      topChart.remove();
      topChartRef.current = null;
      if (bottomChartRef.current) {
        bottomChartRef.current.remove();
        bottomChartRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, compare, drawdown, variant, stacked, topHeight, bottomHeight]);

  return (
    <div className={className} style={{ width: '100%' }}>
      <div ref={topRef} style={{ width: '100%', height: `${topHeight}px` }} />
      {stacked && <div ref={bottomRef} style={{ width: '100%', height: `${bottomHeight}px` }} />}
    </div>
  );
}
