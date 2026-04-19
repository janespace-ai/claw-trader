/**
 * Persona registry. Each Workspace / screen-level AI has a short
 * identifier; this file holds the per-persona configuration that is
 * safe to ship with `ui-foundation`.
 *
 * Specific prompts, response parsers, and structured-output rendering
 * live in the respective screen changes:
 *
 *   • strategist      → workspace-strategy-design
 *   • signal-review   → workspace-preview-backtest
 *   • optimlens       → workspace-deep-backtest
 *   • screener        → screener-chart-first (auto-run logic)
 *   • trade-analysis  → symbol-detail
 *   • strategy-history → strategy-management-v2
 */

export type PersonaId =
  | 'strategist'
  | 'signal-review'
  | 'optimlens'
  | 'screener'
  | 'trade-analysis'
  | 'strategy-history'
  | 'generic';

export interface PersonaConfig {
  id: PersonaId;
  /** Display title in the panel header. */
  title: string;
  /** Subtitle / model hint shown under the title. */
  subtitle?: string;
  /** Whether the composer (input + send) is shown. Some personas
   *  (trade-analysis, strategy-history) are read-only. */
  composer: boolean;
  /** Default intro message when transcript is empty. */
  intro?: string;
}

export const PERSONAS: Record<PersonaId, PersonaConfig> = {
  strategist: {
    id: 'strategist',
    title: 'AI Strategist',
    subtitle: 'Strategy design',
    composer: true,
  },
  'signal-review': {
    id: 'signal-review',
    title: 'Signal Review',
    subtitle: 'Preview backtest',
    composer: true,
  },
  optimlens: {
    id: 'optimlens',
    title: 'OptimLens',
    subtitle: 'Parameter optimization',
    composer: true,
  },
  screener: {
    id: 'screener',
    title: 'Screener Assistant',
    subtitle: 'Coin screening',
    composer: true,
  },
  'trade-analysis': {
    id: 'trade-analysis',
    title: 'Trade Analysis',
    subtitle: 'Per-trade narrative',
    composer: false,
  },
  'strategy-history': {
    id: 'strategy-history',
    title: 'Strategy History',
    subtitle: 'Version timeline',
    composer: false,
  },
  generic: {
    id: 'generic',
    title: 'AI',
    composer: true,
  },
};

export function getPersona(id: PersonaId): PersonaConfig {
  return PERSONAS[id] ?? PERSONAS.generic;
}
