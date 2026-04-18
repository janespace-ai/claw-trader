import { create } from 'zustand';
import type { ChatMessage } from '@/types/domain';
import type { StreamHandle } from '@/services/llm/client';

interface ConversationState {
  id: string | null;
  messages: ChatMessage[];
  streaming: boolean;
  partial: string;
  activeHandle: StreamHandle | null;

  newConversation: () => void;
  append: (msg: ChatMessage) => void;
  setPartial: (s: string) => void;
  setStreaming: (b: boolean, handle?: StreamHandle | null) => void;
  stopStream: () => void;
  reset: () => void;
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  id: null,
  messages: [],
  streaming: false,
  partial: '',
  activeHandle: null,

  newConversation() {
    set({ id: crypto.randomUUID(), messages: [], streaming: false, partial: '' });
  },
  append(msg) {
    set((s) => ({ messages: [...s.messages, msg] }));
  },
  setPartial(s) {
    set({ partial: s });
  },
  setStreaming(b, handle) {
    set({ streaming: b, activeHandle: handle ?? null });
  },
  stopStream() {
    get().activeHandle?.stop();
    set({ streaming: false, activeHandle: null, partial: '' });
  },
  reset() {
    set({ id: null, messages: [], streaming: false, partial: '', activeHandle: null });
  },
}));
