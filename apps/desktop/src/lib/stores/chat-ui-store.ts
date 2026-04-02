import { create } from "zustand";

export interface QueuedMessage {
  id: string;
  text: string;
}

interface ChatUiState {
  /** Per-thread file explorer open preference (chat view). */
  fileTreeOpenByAgentId: Record<string, boolean>;
  /** Per-thread diff panel open preference (chat view). */
  diffPanelOpenByAgentId: Record<string, boolean>;
  /** Prompt draft for queued threads (persisted per project). */
  composeDraftByAgentId: Record<string, string>;
  /** Messages queued while a turn is in progress, keyed by agent id. */
  queuedMessagesByAgentId: Record<string, QueuedMessage[]>;
  setAgentFileTreeOpen: (agentId: string, open: boolean) => void;
  setAllFileTreePrefs: (prefs: Record<string, boolean>) => void;
  setAgentDiffPanelOpen: (agentId: string, open: boolean) => void;
  setComposeDraft: (agentId: string, text: string) => void;
  setAllComposeDrafts: (drafts: Record<string, string>) => void;
  enqueueMessage: (agentId: string, text: string) => void;
  dequeueMessage: (agentId: string) => QueuedMessage | undefined;
  removeQueuedMessage: (agentId: string, messageId: string) => void;
  updateQueuedMessage: (agentId: string, messageId: string, text: string) => void;
  moveQueuedMessage: (agentId: string, messageId: string, direction: "up" | "down") => void;
  clearQueuedMessages: (agentId: string) => void;
  reset: () => void;
}

let queueIdCounter = 0;

export const useChatUiStore = create<ChatUiState>((set, get) => ({
  fileTreeOpenByAgentId: {},
  diffPanelOpenByAgentId: {},
  composeDraftByAgentId: {},
  queuedMessagesByAgentId: {},
  setAgentFileTreeOpen: (agentId, open) =>
    set((s) => ({
      fileTreeOpenByAgentId: { ...s.fileTreeOpenByAgentId, [agentId]: open },
    })),
  setAllFileTreePrefs: (fileTreeOpenByAgentId) => set({ fileTreeOpenByAgentId }),
  setAgentDiffPanelOpen: (agentId, open) =>
    set((s) => ({
      diffPanelOpenByAgentId: { ...s.diffPanelOpenByAgentId, [agentId]: open },
    })),
  setComposeDraft: (agentId, text) =>
    set((s) => {
      const next = { ...s.composeDraftByAgentId };
      if (text.length === 0) {
        delete next[agentId];
      } else {
        next[agentId] = text;
      }
      return { composeDraftByAgentId: next };
    }),
  setAllComposeDrafts: (composeDraftByAgentId) => set({ composeDraftByAgentId }),

  enqueueMessage: (agentId, text) =>
    set((s) => {
      const existing = s.queuedMessagesByAgentId[agentId] ?? [];
      const msg: QueuedMessage = { id: `qm-${++queueIdCounter}`, text };
      return {
        queuedMessagesByAgentId: {
          ...s.queuedMessagesByAgentId,
          [agentId]: [...existing, msg],
        },
      };
    }),

  dequeueMessage: (agentId) => {
    const queue = get().queuedMessagesByAgentId[agentId] ?? [];
    if (queue.length === 0) return undefined;
    const [first, ...rest] = queue;
    set((s) => ({
      queuedMessagesByAgentId: {
        ...s.queuedMessagesByAgentId,
        [agentId]: rest,
      },
    }));
    return first;
  },

  removeQueuedMessage: (agentId, messageId) =>
    set((s) => {
      const existing = s.queuedMessagesByAgentId[agentId] ?? [];
      return {
        queuedMessagesByAgentId: {
          ...s.queuedMessagesByAgentId,
          [agentId]: existing.filter((m) => m.id !== messageId),
        },
      };
    }),

  updateQueuedMessage: (agentId, messageId, text) =>
    set((s) => {
      const existing = s.queuedMessagesByAgentId[agentId] ?? [];
      return {
        queuedMessagesByAgentId: {
          ...s.queuedMessagesByAgentId,
          [agentId]: existing.map((m) => (m.id === messageId ? { ...m, text } : m)),
        },
      };
    }),

  moveQueuedMessage: (agentId, messageId, direction) =>
    set((s) => {
      const existing = [...(s.queuedMessagesByAgentId[agentId] ?? [])];
      const idx = existing.findIndex((m) => m.id === messageId);
      if (idx < 0) return s;
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= existing.length) return s;
      [existing[idx], existing[targetIdx]] = [existing[targetIdx], existing[idx]];
      return {
        queuedMessagesByAgentId: {
          ...s.queuedMessagesByAgentId,
          [agentId]: existing,
        },
      };
    }),

  clearQueuedMessages: (agentId) =>
    set((s) => {
      const next = { ...s.queuedMessagesByAgentId };
      delete next[agentId];
      return { queuedMessagesByAgentId: next };
    }),

  reset: () =>
    set({
      fileTreeOpenByAgentId: {},
      diffPanelOpenByAgentId: {},
      composeDraftByAgentId: {},
      queuedMessagesByAgentId: {},
    }),
}));
