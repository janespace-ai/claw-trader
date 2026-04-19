// Barrel for the UI primitives family. Each primitive has its own
// directory; this file is the single import surface for screens.

export { ClawChart } from './ClawChart';
export type { CandlePoint, OverlayLine, ChartMarker, EquityPoint } from './ClawChart';

export { Watchlist } from './Watchlist/Watchlist';
export type { WatchlistItem } from './Watchlist/Watchlist';

export { WorkspaceShell } from './WorkspaceShell/WorkspaceShell';

export { MetricsGrid } from './MetricsGrid/MetricsGrid';
export type { Metric } from './MetricsGrid/MetricsGrid';

export { AIPersonaShell, usePersonaContext } from './AIPersonaShell/AIPersonaShell';
export { PERSONAS, getPersona } from './AIPersonaShell/personas';
export type { PersonaId, PersonaConfig } from './AIPersonaShell/personas';
