import type { IpcMain, WebContents } from 'electron';
import { BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Map of active streams so the renderer can cancel them.
const streams = new Map<string, AbortController>();

export type Provider = 'openai' | 'deepseek' | 'kimi' | 'anthropic' | 'google';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamParams {
  provider: Provider;
  model: string;
  apiKey: string;
  baseURL?: string; // for OpenAI-compat providers
  messages: ChatMessage[];
}

function activeWebContents(): WebContents | null {
  const wnd = BrowserWindow.getAllWindows()[0];
  return wnd?.webContents ?? null;
}

function push(streamId: string, event: 'chunk' | 'done' | 'error', payload: string) {
  const wc = activeWebContents();
  if (!wc) return;
  wc.send(`llm:${event}`, streamId, payload);
}

export function registerLLMHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('llm:stream', async (_e, params: StreamParams) => {
    const streamId = randomUUID();
    const controller = new AbortController();
    streams.set(streamId, controller);

    // Don't await — push chunks over IPC as they arrive.
    void runStream(streamId, params, controller.signal)
      .catch((err) => push(streamId, 'error', String(err?.message ?? err)))
      .finally(() => streams.delete(streamId));

    return { streamId };
  });

  ipcMain.handle('llm:stop', (_e, streamId: string) => {
    const c = streams.get(streamId);
    c?.abort();
    streams.delete(streamId);
  });
}

async function runStream(streamId: string, p: StreamParams, signal: AbortSignal): Promise<void> {
  switch (p.provider) {
    case 'openai':
    case 'deepseek':
    case 'kimi':
      return streamOpenAICompat(streamId, p, signal);
    case 'anthropic':
      return streamAnthropic(streamId, p, signal);
    case 'google':
      return streamGoogle(streamId, p, signal);
    default:
      throw new Error(`unknown provider: ${p.provider}`);
  }
}

/** OpenAI, DeepSeek, Kimi all use the OpenAI Chat Completions format. */
async function streamOpenAICompat(streamId: string, p: StreamParams, signal: AbortSignal) {
  const client = new OpenAI({
    apiKey: p.apiKey,
    baseURL: p.baseURL || defaultBaseURL(p.provider),
  });

  let full = '';
  const stream = await client.chat.completions.create(
    {
      model: p.model,
      messages: p.messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    },
    { signal },
  );

  for await (const event of stream) {
    const chunk = event.choices?.[0]?.delta?.content;
    if (chunk) {
      full += chunk;
      push(streamId, 'chunk', chunk);
    }
  }
  push(streamId, 'done', full);
}

async function streamAnthropic(streamId: string, p: StreamParams, signal: AbortSignal) {
  const client = new Anthropic({ apiKey: p.apiKey });

  // Anthropic Messages API: system is separate, other roles go in `messages`.
  const sys = p.messages.find((m) => m.role === 'system')?.content;
  const turns = p.messages.filter((m) => m.role !== 'system');

  let full = '';
  const stream = client.messages.stream(
    {
      model: p.model,
      max_tokens: 4096,
      system: sys,
      messages: turns.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
    },
    { signal },
  );

  stream.on('text', (text) => {
    full += text;
    push(streamId, 'chunk', text);
  });

  await stream.finalMessage();
  push(streamId, 'done', full);
}

async function streamGoogle(streamId: string, p: StreamParams, signal: AbortSignal) {
  const client = new GoogleGenerativeAI(p.apiKey);
  const model = client.getGenerativeModel({ model: p.model });

  const history = p.messages
    .filter((m) => m.role !== 'system')
    .slice(0, -1)
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
  const latest = p.messages[p.messages.length - 1]?.content ?? '';

  // Note: Gemini's Node SDK does not wire AbortSignal through the streaming
  // iterator yet; we poll the signal between chunks.
  const chat = model.startChat({ history });
  const resp = await chat.sendMessageStream(latest);

  let full = '';
  for await (const chunk of resp.stream) {
    if (signal.aborted) break;
    const text = chunk.text();
    if (text) {
      full += text;
      push(streamId, 'chunk', text);
    }
  }
  push(streamId, 'done', full);
}

function defaultBaseURL(provider: Provider): string | undefined {
  switch (provider) {
    case 'deepseek':
      return 'https://api.deepseek.com';
    case 'kimi':
      return 'https://api.moonshot.cn/v1';
    default:
      return undefined;
  }
}
