// Small zustand slice tracking the "auto-run triggered from chat"
// state. Lets the chat bubble show a status row AND the screener page
// show a progress pill, both driven from the same source.

import { create } from 'zustand';
import type { RunState } from '@/services/chat/screenerRunner';

interface AutoRunState {
  /** Last / current auto-run status. `null` = never triggered this session. */
  status: RunState | null;
  /** The conversation message index that triggered the current status, so
   *  MessageList can show the status bubble under the right assistant
   *  message even after newer messages appear. */
  triggerMessageIndex: number | null;

  setStatus: (s: RunState, triggerMessageIndex?: number) => void;
  clear: () => void;
}

export const useAutoRunStore = create<AutoRunState>((set) => ({
  status: null,
  triggerMessageIndex: null,
  setStatus(s, triggerMessageIndex) {
    set((prev) => ({
      status: s,
      triggerMessageIndex:
        triggerMessageIndex !== undefined ? triggerMessageIndex : prev.triggerMessageIndex,
    }));
  },
  clear() {
    set({ status: null, triggerMessageIndex: null });
  },
}));
