// System prompt for the Preview Backtest workspace's Signal Review
// persona. Unlike the Strategist, the persona is mostly a *follow-up
// chat* grounded in verdicts that the backend already produced via
// `startSignalReview`. The frontend streams those verdicts into the
// transcript and opens the composer so the user can ask things like
// "Why did you flag the LINK entry?".
//
// If the backend Signal Review endpoint is not available (pre-rollout),
// the UI falls back to a local-only mode: this same prompt receives the
// trades + metrics context and is asked to produce a client-side review.

import type { components } from '@/types/api';

export type SignalVerdict = components['schemas']['SignalVerdict'];

export interface SignalReviewContext {
  /** Symbols in the preview run. */
  symbols: string[];
  /** The backend-produced verdict list (empty when in fallback mode). */
  verdicts: SignalVerdict[];
  /** Compact summary — counts of good/questionable/bad. */
  summary: { good?: number; questionable?: number; bad?: number };
  /** Preview backtest window (human-readable). */
  windowLabel: string;
  replyLang?: 'en' | 'zh';
}

const ROLE_BLOCK = `
You are Signal Review, an AI analyst embedded in a trading backtest
tool. Your job is to help the trader reason about individual preview
signals: whether an entry looks justified, whether it was a fluke, and
what a well-calibrated trader would do next.

You are NOT an investment advisor. You describe signal quality and
reasoning; the trader makes final decisions. Never recommend placing
live trades with real money. Never claim certainty about future PnL.
`;

function languageDirective(lang: 'en' | 'zh' | undefined): string {
  return lang === 'zh'
    ? '重要：用简体中文回复。信号编号 (signal_id) 和交易对保持英文字母数字。'
    : 'IMPORTANT: Reply in English. Signal IDs and symbol tickers stay English.';
}

export function signalReviewSystemPrompt(ctx: SignalReviewContext): string {
  const summaryLine = [
    ctx.summary.good != null ? `${ctx.summary.good} good` : null,
    ctx.summary.questionable != null ? `${ctx.summary.questionable} questionable` : null,
    ctx.summary.bad != null ? `${ctx.summary.bad} bad` : null,
  ]
    .filter(Boolean)
    .join(', ');

  const verdictLines = ctx.verdicts
    .slice(0, 40)
    .map(
      (v) =>
        `  - ${v.signal_id} (${v.symbol} @ ${new Date(v.entry_ts * 1000).toISOString()}): ${v.verdict}${v.note ? ' — ' + v.note : ''}`,
    )
    .join('\n');

  const contextBlock = `
PREVIEW CONTEXT
- Symbols: ${ctx.symbols.join(', ') || '(none)'}
- Window: ${ctx.windowLabel}
- Verdict summary: ${summaryLine || '(pending)'}
- Top verdicts (first 40):
${verdictLines || '  (none produced yet)'}

RULES
- When asked about a specific signal, reference its ID and symbol.
- If the verdict list is empty, say so honestly and offer to produce a
  client-side review from the trades + chart context — do not invent
  verdicts.
- Keep replies short and concrete (≤ 150 words unless asked to expand).
`;

  return [ROLE_BLOCK, contextBlock, languageDirective(ctx.replyLang)].join('\n\n');
}

/** Initial auto-populated transcript line once verdicts arrive. */
export function signalReviewIntro(ctx: SignalReviewContext): string {
  const total = ctx.verdicts.length;
  if (total === 0) {
    return 'No verdicts yet — the backend review is still running (or unavailable). Ask me anything about the preview results.';
  }
  const bad = ctx.verdicts.filter((v) => v.verdict === 'bad').length;
  const questionable = ctx.verdicts.filter((v) => v.verdict === 'questionable').length;
  const flags = bad + questionable;
  if (flags === 0) {
    return `Scanned ${total} entries. None look suspicious — the preview holds up on signal quality.`;
  }
  return `Scanned ${total} entries. ${flags} worth a second look (${bad} bad, ${questionable} questionable). Click a verdict to jump the chart.`;
}
