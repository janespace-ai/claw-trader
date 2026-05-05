// Indicator registry — central source of truth for which indicators
// the chart engine can paint.  Adding a new indicator = drop a new
// file here + add an import + entry below.  IndicatorBar /
// KlineChart / chartIndicatorsStore all discover indicators via this
// registry — no hardcoded lists elsewhere in the codebase.

import type { IndicatorDef } from '../types';

// Overlays — paint on the candle pane.
import MA from './MA';
import EMA from './EMA';
import SMA from './SMA';
import BOLL from './BOLL';
import SAR from './SAR';
import BBI from './BBI';
import AVP from './AVP';
import VWAP from './VWAP';
import SuperTrend from './SuperTrend';
import Ichimoku from './Ichimoku';
import Keltner from './Keltner';

// Subcharts — own pane.
import VOL from './VOL';
import MACD from './MACD';
import RSI from './RSI';
import KDJ from './KDJ';
import CCI from './CCI';
import BIAS from './BIAS';
import BRAR from './BRAR';
import CR from './CR';
import PSY from './PSY';
import DMA from './DMA';
import TRIX from './TRIX';
import OBV from './OBV';
import VR from './VR';
import WR from './WR';
import MTM from './MTM';
import EMV from './EMV';
import DMI from './DMI';
import PVT from './PVT';
import AO from './AO';
import ROC from './ROC';

const ALL: IndicatorDef[] = [
  // Overlays (11)
  MA, EMA, SMA, BOLL, SAR, BBI, AVP,
  VWAP, SuperTrend, Ichimoku, Keltner,
  // Subcharts (20)
  VOL, MACD, RSI, KDJ, CCI, BIAS, BRAR, CR, PSY,
  DMA, TRIX, OBV, VR, WR, MTM, EMV, DMI, PVT, AO, ROC,
];

// Validate uniqueness + classification at import time.  If a contributor
// adds a duplicate name or omits the kind field, this surfaces at boot.
const seen = new Set<string>();
for (const def of ALL) {
  if (seen.has(def.name)) {
    throw new Error(`Duplicate indicator name in registry: ${def.name}`);
  }
  if (def.kind !== 'overlay' && def.kind !== 'subchart') {
    throw new Error(`Indicator ${def.name} has invalid kind: ${def.kind}`);
  }
  seen.add(def.name);
}

export const INDICATOR_REGISTRY: Record<string, IndicatorDef> = Object.fromEntries(
  ALL.map((d) => [d.name, d]),
);

/** Look up an indicator by name. */
export function getIndicatorDef(name: string): IndicatorDef | undefined {
  return INDICATOR_REGISTRY[name];
}

/** All overlay indicators in registration order. */
export function getOverlayIndicators(): IndicatorDef[] {
  return ALL.filter((d) => d.kind === 'overlay');
}

/** All subchart indicators in registration order. */
export function getSubchartIndicators(): IndicatorDef[] {
  return ALL.filter((d) => d.kind === 'subchart');
}

/** Flat name list — used by IndicatorBar to populate its rows. */
export function getAllIndicatorNames(): string[] {
  return ALL.map((d) => d.name);
}
