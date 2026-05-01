// Strategist chat runner — drives the full per-turn loop:
//
//   1. Build state-aware system prompt from current strategy state.
//   2. Slice history to the most-recent N messages (sliding window).
//   3. Stream LLM response.
//   4. Parse output (parseStrategistTurn).
//   5. Emit:
//        - 1 plain assistant message holding the prose, AND
//        - if the response contains a mutation, 1 additional
//          'diff-preview' assistant message that the chat pane
//          renders as a DiffPreviewCard awaiting user accept/reject.
//
// The runner does NOT mutate strategy.draft_* directly.  That happens
// only when the user clicks Apply on the diff card — handled by
// the screen via store.patchDraft().
//
// The runner is provider-agnostic — it talks to `services/llm/client`'s
// startChatStream() and trusts the returned StreamHandle.
//
// References:
//   · openspec/changes/unified-strategy-workspace/design.md (state machine)
//   · spec ai-conversation §"One mutation per AI turn"

import { startChatStream } from '@/services/llm/client';
import type { Provider, ChatMessage as LLMMessage } from '@/types/domain';
import {
  buildStrategistPrompt,
  type StrategistContext,
} from '@/services/prompt/personas/strategistV2';
import {
  parseStrategistTurn,
  type StrategistMutation,
} from './strategistOutputParser';

const DEFAULT_HISTORY_WINDOW = 30;

export interface DiffPreviewMetadata {
  kind: 'diff-preview';
  /** What kind of mutation the AI proposed. */
  mutation: StrategistMutation;
  /** Snapshot of draft fields BEFORE this mutation, for diff display. */
  before: {
    code: string | null;
    symbols: string[] | null;
  };
  /** Resolution flag — set when the user accepts or rejects.  If null
   *  the chat renders [应用] / [拒绝] buttons. */
  resolved: 'applied' | 'rejected' | null;
}

export interface RunStrategistTurnArgs {
  /** Provider config from settingsStore. */
  provider: Provider;
  model: string;
  apiKey: string;
  baseURL?: string;
  /** Strategy context — current state code + draft_* + saved snapshot. */
  context: StrategistContext;
  /** Full chat history (oldest → newest).  Runner windows internally. */
  history: LLMMessage[];
  /** The new user message (already appended to history by the caller). */
  userMessage: string;
  /** Optional ceiling on history size sent to the model.  Defaults 30. */
  historyWindow?: number;

  // ---- Side-effect callbacks (the screen / store wires these) ----

  /** Called once with the streaming partial accumulator (each chunk). */
  onChunk?: (full: string) => void;
  /** Called ONCE on success with the parsed result.  Caller is
   *  responsible for persisting (store.appendMessage) the assistant
   *  message + optional diff-preview message. */
  onComplete: (result: {
    prose: string;
    mutation: StrategistMutation | null;
    warnings: string[];
    /** A diff-preview metadata payload to attach to a SECOND assistant
     *  message — null if no mutation. */
    diffPreviewMeta: DiffPreviewMetadata | null;
  }) => Promise<void> | void;
  /** Called on stream error or unparseable output. */
  onError?: (err: string) => void;
}

/**
 * Execute one strategist turn end-to-end.  Caller has already appended
 * the user message to the conversation; this fn handles streaming,
 * parsing, and invoking onComplete with the response payload to persist.
 *
 * Returns a stop() function the caller can wire to a Cancel button.
 */
export async function runStrategistTurn(args: RunStrategistTurnArgs): Promise<{
  stop: () => void;
}> {
  const {
    provider,
    model,
    apiKey,
    baseURL,
    context,
    history,
    userMessage: _userMessage,
    historyWindow = DEFAULT_HISTORY_WINDOW,
    onChunk,
    onComplete,
    onError,
  } = args;

  void _userMessage; // The user message is already in `history`; ignored here.

  const systemPrompt = buildStrategistPrompt(context);

  const windowed = sliceHistory(history, historyWindow);

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt, ts: Date.now() },
    ...windowed,
  ];

  const handle = await startChatStream({
    provider,
    model,
    apiKey,
    baseURL,
    messages,
  });

  let full = '';
  handle.onChunk((chunk) => {
    full += chunk;
    onChunk?.(full);
  });

  handle.onError((err) => {
    onError?.(err);
  });

  handle.onDone(async (complete) => {
    const text = complete || full;
    try {
      const parsed = parseStrategistTurn(text);
      const diffPreviewMeta = parsed.mutation
        ? {
            kind: 'diff-preview' as const,
            mutation: parsed.mutation,
            before: {
              code: context.draftCode ?? null,
              symbols: context.draftSymbols ?? null,
            },
            resolved: null,
          }
        : null;
      await onComplete({
        prose: parsed.prose,
        mutation: parsed.mutation,
        warnings: parsed.warnings,
        diffPreviewMeta,
      });
    } catch (e) {
      onError?.(e instanceof Error ? e.message : String(e));
    }
  });

  return { stop: handle.stop };
}

/** Take the last N messages.  Older ones aren't deleted from
 *  client storage — they just don't enter the LLM context for this
 *  turn.  Group 8 (RAG v2) will replace this with selective retrieval. */
export function sliceHistory(history: LLMMessage[], n: number): LLMMessage[] {
  if (n <= 0 || history.length <= n) return [...history];
  return history.slice(history.length - n);
}
