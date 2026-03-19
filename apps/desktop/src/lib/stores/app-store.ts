import { create } from "zustand";

export type ThemePreference = "light" | "dark" | "system";

function readStoredTheme(): ThemePreference {
  try {
    const v = localStorage.getItem("awencode-theme");
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "light";
}

function persistTheme(theme: ThemePreference) {
  try {
    localStorage.setItem("awencode-theme", theme);
  } catch {
    /* ignore */
  }
}

interface AppState {
  theme: ThemePreference;
  commandBarOpen: boolean;
  projectName: string | null;
  /** Working directory for codex (thread/start, turn/start cwd). */
  projectPath: string | null;
  setTheme: (theme: ThemePreference) => void;
  toggleTheme: () => void;
  setCommandBarOpen: (open: boolean) => void;
  setProjectName: (name: string | null) => void;
  setProjectPath: (path: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  theme: readStoredTheme(),
  commandBarOpen: false,
  projectName: null,
  projectPath: null,
  setTheme: (theme) => {
    persistTheme(theme);
    set({ theme });
  },
  toggleTheme: () =>
    set((s) => {
      const mq =
        typeof window !== "undefined"
          ? window.matchMedia("(prefers-color-scheme: dark)")
          : { matches: false };
      const resolvedDark =
        s.theme === "dark" || (s.theme === "system" && mq.matches);
      const next: ThemePreference = resolvedDark ? "light" : "dark";
      persistTheme(next);
      return { theme: next };
    }),
  setCommandBarOpen: (open) => set({ commandBarOpen: open }),
  setProjectName: (name) => set({ projectName: name }),
  setProjectPath: (path) => set({ projectPath: path }),
}));
