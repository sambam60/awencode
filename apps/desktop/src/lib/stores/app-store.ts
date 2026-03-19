import { create } from "zustand";

export type ThemePreference = "light" | "dark" | "system";

export interface ProjectTab {
  path: string;
  name: string;
}

export function tabNameFromPath(path: string): string {
  return path.replace(/\/$/, "").split("/").filter(Boolean).pop() ?? "Project";
}

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
  /** Open project workspaces (tabs). Active tab matches projectPath / projectName. */
  projectTabs: ProjectTab[];
  setTheme: (theme: ThemePreference) => void;
  toggleTheme: () => void;
  setCommandBarOpen: (open: boolean) => void;
  setProjectName: (name: string | null) => void;
  setProjectPath: (path: string | null) => void;
  clearWorkspace: () => void;
  openWorkspaceSolo: (path: string, name: string) => void;
  addOrFocusProjectTab: (path: string, name: string) => void;
  switchProjectTab: (path: string) => void;
  closeProjectTab: (path: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  theme: readStoredTheme(),
  commandBarOpen: false,
  projectName: null,
  projectPath: null,
  projectTabs: [],
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
  setProjectPath: (path) => {
    if (path === null) {
      set({
        projectPath: null,
        projectName: null,
        projectTabs: [],
      });
      return;
    }
    const name = tabNameFromPath(path);
    set({
      projectPath: path,
      projectName: name,
      projectTabs: [{ path, name }],
    });
  },
  clearWorkspace: () =>
    set({
      projectPath: null,
      projectName: null,
      projectTabs: [],
    }),
  openWorkspaceSolo: (path, name) =>
    set({
      projectPath: path,
      projectName: name,
      projectTabs: [{ path, name }],
    }),
  addOrFocusProjectTab: (path, name) =>
    set((s) => {
      const existing = s.projectTabs.some((t) => t.path === path);
      const tabs = existing
        ? s.projectTabs
        : [...s.projectTabs, { path, name }];
      return {
        projectTabs: tabs,
        projectPath: path,
        projectName: name,
      };
    }),
  switchProjectTab: (path) =>
    set((s) => {
      const tab = s.projectTabs.find((t) => t.path === path);
      if (!tab) return s;
      return {
        projectPath: tab.path,
        projectName: tab.name,
      };
    }),
  closeProjectTab: (path) =>
    set((s) => {
      const idx = s.projectTabs.findIndex((t) => t.path === path);
      if (idx < 0) return s;
      const tabs = s.projectTabs.filter((t) => t.path !== path);
      if (tabs.length === 0) {
        return {
          projectPath: null,
          projectName: null,
          projectTabs: [],
        };
      }
      if (s.projectPath !== path) {
        return { projectTabs: tabs };
      }
      const nextIdx = Math.min(idx, tabs.length - 1);
      const next = tabs[nextIdx]!;
      return {
        projectTabs: tabs,
        projectPath: next.path,
        projectName: next.name,
      };
    }),
}));
