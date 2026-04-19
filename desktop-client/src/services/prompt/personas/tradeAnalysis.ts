// Trade Analysis persona — render-only. The explainTrade endpoint is
// synchronous; the persona just presents the result in a structured
// card. No chat, no composer. This file exists so the AIPersonaShell
// has a consistent per-persona module location.

export function tradeAnalysisSystemPrompt(): string {
  return `You are Trade Analysis. You narrate one completed trade at a
time, explaining why the backtest entered and exited, grounded in the
indicator values at each moment. You never recommend live actions.`;
}
