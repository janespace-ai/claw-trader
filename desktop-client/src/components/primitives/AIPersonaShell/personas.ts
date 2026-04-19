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

// title / subtitle are i18n keys (not raw strings). AIPersonaShell
// resolves them via `t()` when rendering the header, so switching the
// UI language flips every persona title instantly.
export const PERSONAS: Record<PersonaId, PersonaConfig> = {
  strategist: {
    id: 'strategist',
    title: 'persona.strategist.title',
    subtitle: 'persona.strategist.subtitle',
    composer: true,
  },
  'signal-review': {
    id: 'signal-review',
    title: 'persona.signal_review.title',
    subtitle: 'persona.signal_review.subtitle',
    composer: true,
  },
  optimlens: {
    id: 'optimlens',
    title: 'persona.optimlens.title',
    subtitle: 'persona.optimlens.subtitle',
    composer: true,
  },
  screener: {
    id: 'screener',
    title: 'persona.screener.title',
    subtitle: 'persona.screener.subtitle',
    composer: true,
  },
  'trade-analysis': {
    id: 'trade-analysis',
    title: 'persona.trade_analysis.title',
    subtitle: 'persona.trade_analysis.subtitle',
    composer: false,
  },
  'strategy-history': {
    id: 'strategy-history',
    title: 'persona.strategy_history.title',
    subtitle: 'persona.strategy_history.subtitle',
    composer: false,
  },
  generic: {
    id: 'generic',
    title: 'persona.generic.title',
    composer: true,
  },
};

export function getPersona(id: PersonaId): PersonaConfig {
  return PERSONAS[id] ?? PERSONAS.generic;
}
