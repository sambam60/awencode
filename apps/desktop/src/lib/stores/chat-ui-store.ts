import { create } from "zustand";

interface ChatUiState {
  /** Per-thread file explorer open preference (chat view). */
  fileTreeOpenByAgentId: Record<string, boolean>;
  /** Prompt draft for queued threads (persisted per project). */
  composeDraftByAgentId: Record<string, string>;
  setAgentFileTreeOpen: (agentId: string, open: boolean) => void;
  setAllFileTreePrefs: (prefs: Record<string, boolean>) => void;
  setComposeDraft: (agentId: string, text: string) => void;
  setAllComposeDrafts: (drafts: Record<string, string>) => void;
  reset: () => void;
}

export const useChatUiStore = create<ChatUiState>((set) => ({
  fileTreeOpenByAgentId: {},
  composeDraftByAgentId: {},
  setAgentFileTreeOpen: (agentId, open) =>
    set((s) => ({
      fileTreeOpenByAgentId: { ...s.fileTreeOpenByAgentId, [agentId]: open },
    })),
  setAllFileTreePrefs: (fileTreeOpenByAgentId) => set({ fileTreeOpenByAgentId }),
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
  reset: () => set({ fileTreeOpenByAgentId: {}, composeDraftByAgentId: {} }),
}));
