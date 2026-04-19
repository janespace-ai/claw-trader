// Screener persona — system prompt for the chat-first screener flow.
// The assistant produces Python screener code inside a python fence;
// the UI auto-runs it on submit via screenerRunStore.start().

import { SCREENER_SYSTEM_PROMPT } from '../../index';

export interface ScreenerContext {
  /** Market the user is screening. Defaults to "futures". */
  market: 'spot' | 'futures';
  /** How many days of history to look back. */
  lookbackDays: number;
  /** Reply language hint. */
  replyLang?: 'en' | 'zh';
}

export function screenerSystemPrompt(ctx: ScreenerContext): string {
  const lang =
    ctx.replyLang === 'zh'
      ? '重要：用简体中文回复 prose。Python 代码保持英文。'
      : 'IMPORTANT: Reply in English. Python code stays English.';

  const context = `
SCREENER CONTEXT
- Market: ${ctx.market}
- Lookback: ${ctx.lookbackDays} days

OUTPUT FORMAT
- 1-3 paragraphs explaining the filter logic.
- Exactly one \`python\` fenced block implementing \`def screen(ctx) -> bool\`.
- Prefer concrete numeric thresholds over vague language; the UI will
  execute the code directly.
`;

  return [SCREENER_SYSTEM_PROMPT, context, lang].join('\n\n');
}
