import { create } from "zustand";

interface AppState {
  theme: "light" | "dark";
  commandBarOpen: boolean;
  projectName: string | null;
  /** Working directory for codex (thread/start, turn/start cwd). */
  projectPath: string | null;
  toggleTheme: () => void;
  setCommandBarOpen: (open: boolean) => void;
  setProjectName: (name: string | null) => void;
  setProjectPath: (path: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  theme: "light",
  commandBarOpen: false,
  projectName: null,
  projectPath: null,
  toggleTheme: () =>
    set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),
  setCommandBarOpen: (open) => set({ commandBarOpen: open }),
  setProjectName: (name) => set({ projectName: name }),
  setProjectPath: (path) => set({ projectPath: path }),
}));
