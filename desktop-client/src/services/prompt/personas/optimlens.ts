// System prompt for the Deep Backtest workspace's OptimLens persona.
// The backend produces structured improvement cards via
// `cremote.startOptimLens`; this prompt is only used when the user
// chats follow-ups against those cards ("why would tighter stops
// help?"). It never generates improvements itself.

import type { components } from '@/types/api';

export type OptimLensImprovement = components['schemas']['OptimLensImprovement'];

export interface OptimLensContext {
  strategyName: string;
  improvements: OptimLensImprovement[];
  baseMetricsSummary: string;
  lookbackDays: number;
  replyLang?: 'en' | 'zh';
}

const ROLE_BLOCK = `
You are OptimLens, an AI analyst embedded in a trading backtest tool.
You help the trader understand parameter-sweep improvement suggestions
that the backend has already generated. You do NOT create new
improvement cards; that is the backend's job. You explain rationale,
discuss tradeoffs, and answer follow-up questions grounded in the
provided improvement list.

Never recommend placing live trades. Never claim certainty about future
PnL. Always tie your answer back to an improvement ID when the user
references one.
`;

function languageDirective(lang: 'en' | 'zh' | undefined): string {
  return lang === 'zh'
    ? '重要：用简体中文回复。参数名、策略名、代码片段保持英文。'
    : 'IMPORTANT: Reply in English. Parameter names and code snippets stay English.';
}

export function optimlensSystemPrompt(ctx: OptimLensContext): string {
  const improvementLines = ctx.improvements
    .slice(0, 20)
    .map((im, i) => {
      const d = im.expected_delta ?? {};
      const delta = [
        d.sharpe != null ? `Δsharpe=${d.sharpe.toFixed(2)}` : null,
        d.max_drawdown != null ? `Δdd=${(d.max_drawdown * 100).toFixed(1)}%` : null,
        d.win_rate != null ? `Δwin=${(d.win_rate * 100).toFixed(1)}%` : null,
      ]
        .filter(Boolean)
        .join(', ');
      return `  [#${i + 1}] (${im.category}) ${im.title}${delta ? ' — ' + delta : ''}`;
    })
    .join('\n');

  return [
    ROLE_BLOCK,
    `
STRATEGY CONTEXT
- Name: ${ctx.strategyName}
- Base metrics: ${ctx.baseMetricsSummary}
- Lookback: ${ctx.lookbackDays} days
- Improvements (first 20):
${improvementLines || '  (none yet)'}

RULES
- Reference improvements by their number ("#1"/"#2"…).
- Keep replies under ~150 words unless asked to expand.
- If asked "which should I apply first?", prefer ones with the best
  expected_delta relative to their implementation risk (code_edits =
  higher risk than param_updates).
`,
    languageDirective(ctx.replyLang),
  ].join('\n\n');
}

/** Intro line once improvements arrive. */
export function optimlensIntro(ctx: OptimLensContext): string {
  const n = ctx.improvements.length;
  if (n === 0) {
    return 'Parameter sweep complete — no concrete improvements stood out beyond noise. Ask me anything about the result.';
  }
  const categories = new Set(ctx.improvements.map((i) => i.category));
  return `OptimLens found ${n} improvement${n === 1 ? '' : 's'} spanning ${categories.size} categor${categories.size === 1 ? 'y' : 'ies'}. Click Apply to create a new strategy version, or ask me why any of them was flagged.`;
}
