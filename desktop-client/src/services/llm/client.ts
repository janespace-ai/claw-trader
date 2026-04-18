// Renderer-side thin wrapper around the main-process LLM bridge.

import type { ChatMessage, Provider } from '@/types/domain';

export interface StreamHandle {
  streamId: string;
  stop: () => void;
  onChunk: (cb: (text: string) => void) => void;
  onDone: (cb: (full: string) => void) => void;
  onError: (cb: (err: string) => void) => void;
}

export async function startChatStream(params: {
  provider: Provider;
  model: string;
  apiKey: string;
  baseURL?: string;
  messages: ChatMessage[];
}): Promise<StreamHandle> {
  const { streamId } = await window.claw.llm.stream(params);

  const chunkCbs: Array<(text: string) => void> = [];
  const doneCbs: Array<(full: string) => void> = [];
  const errCbs: Array<(err: string) => void> = [];

  const offChunk = window.claw.llm.onChunk((id, text) => {
    if (id === streamId) chunkCbs.forEach((c) => c(text));
  });
  const offDone = window.claw.llm.onDone((id, full) => {
    if (id === streamId) {
      doneCbs.forEach((c) => c(full));
      offChunk();
      offDone();
      offError();
    }
  });
  const offError = window.claw.llm.onError((id, err) => {
    if (id === streamId) {
      errCbs.forEach((c) => c(err));
      offChunk();
      offDone();
      offError();
    }
  });

  return {
    streamId,
    stop: () => {
      void window.claw.llm.stop(streamId);
      offChunk();
      offDone();
      offError();
    },
    onChunk: (cb) => chunkCbs.push(cb),
    onDone: (cb) => doneCbs.push(cb),
    onError: (cb) => errCbs.push(cb),
  };
}

export const PROVIDER_MODEL_DEFAULTS: Record<Provider, string> = {
  openai: 'gpt-4o',
  deepseek: 'deepseek-chat',
  kimi: 'moonshot-v1-128k',
  anthropic: 'claude-sonnet-4-20250514',
  google: 'gemini-2.0-flash',
};
