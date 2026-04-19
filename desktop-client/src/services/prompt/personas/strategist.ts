// System prompt for the Strategy Design workspace's AI Strategist
// persona. Builds on the existing STRATEGY_SYSTEM_PROMPT but layers in
// workspace-context (focused symbol, interval, indicators) and
// structured-output instructions so the response is parseable into
// prose + summary card + code block.

import { STRATEGY_SYSTEM_PROMPT } from '../index';

export interface StrategistContext {
  focusedSymbol: string;
  interval: string;
  /** Indicators the user has toggled on in the topbar. */
  indicators?: string[];
  /** Reply language hint. */
  replyLang?: 'en' | 'zh';
}

export function strategistSystemPrompt(ctx: StrategistContext): string {
  const indicators = ctx.indicators?.length
    ? ctx.indicators.join(', ')
    : 'none selected';

  const langDirective =
    ctx.replyLang === 'zh'
      ? '重要：用简体中文回复 prose 和 summary JSON 的文本字段。Python 代码保持英文。'
      : 'IMPORTANT: Reply in English for prose and summary JSON text fields. Python code stays English.';

  const structuredOutput = `
OUTPUT FORMAT (strict order):

1. 1–3 paragraphs of prose explaining the strategy idea.

2. A JSON summary card inside a fenced block tagged \`json summary\`:

\`\`\`json summary
{
  "name": "<short display name>",
  "interval": "<5m | 15m | 30m | 1h | 4h | 1d>",
  "symbols": ["<symbol>"],
  "longCondition": "<plain-language entry condition>",
  "shortCondition": "<plain-language short condition, or empty>",
  "leverage": <number | "N/A">,
  "params": { "<key>": <default value> }
}
\`\`\`

3. Python implementation in a \`python\` fenced block conforming to the
Strategy API documented above.

If the summary JSON is malformed the frontend silently skips the card;
prioritize valid JSON.
`;

  const contextBlock = `
WORKSPACE CONTEXT:
- Focused symbol: ${ctx.focusedSymbol}
- Interval: ${ctx.interval}
- Selected indicators: ${indicators}

Tailor the strategy to this symbol/interval when the user request is
under-specified. Do not switch symbols silently — if the user asks for
a strategy that makes more sense on a different symbol, say so in the
prose first.
`;

  return [STRATEGY_SYSTEM_PROMPT, contextBlock, structuredOutput, langDirective].join(
    '\n\n',
  );
}
