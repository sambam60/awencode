import { create } from "zustand";

interface ChatUiState {
  /** Per-thread file explorer open preference (chat view). */
  fileTreeOpenByAgentId: Record<string, boolean>;
  setAgentFileTreeOpen: (agentId: string, open: boolean) => void;
  setAllFileTreePrefs: (prefs: Record<string, boolean>) => void;
  reset: () => void;
}

export const useChatUiStore = create<ChatUiState>((set) => ({
  fileTreeOpenByAgentId: {},
  setAgentFileTreeOpen: (agentId, open) =>
    set((s) => ({
      fileTreeOpenByAgentId: { ...s.fileTreeOpenByAgentId, [agentId]: open },
    })),
  setAllFileTreePrefs: (fileTreeOpenByAgentId) => set({ fileTreeOpenByAgentId }),
  reset: () => set({ fileTreeOpenByAgentId: {} }),
}));
