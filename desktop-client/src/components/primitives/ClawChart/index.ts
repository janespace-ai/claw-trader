// Barrel for the ClawChart primitive family.
// Declarative React wrappers around lightweight-charts, all theme-aware.

import { Candles } from './Candles';
import { Mini } from './Mini';
import { Equity } from './Equity';

export const ClawChart = {
  Candles,
  Mini,
  Equity,
};

export type { CandlePoint, OverlayLine, ChartMarker, VisibleTimeRange } from './Candles';
export type { EquityPoint } from './Equity';
