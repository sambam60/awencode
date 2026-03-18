import { create } from "zustand";

interface AppState {
  theme: "light" | "dark";
  commandBarOpen: boolean;
  toggleTheme: () => void;
  setCommandBarOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  theme: "light",
  commandBarOpen: false,
  toggleTheme: () =>
    set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),
  setCommandBarOpen: (open) => set({ commandBarOpen: open }),
}));
