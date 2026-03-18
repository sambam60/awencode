import { create } from "zustand";

export type ViewId = "home" | "onboarding" | "orchestrator" | "chat" | "settings";

interface ViewState {
  view: ViewId;
  setView: (view: ViewId) => void;
}

export const useViewStore = create<ViewState>((set) => ({
  view: "home",
  setView: (view) => set({ view }),
}));
