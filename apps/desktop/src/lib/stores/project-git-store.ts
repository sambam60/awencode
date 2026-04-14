import { create } from "zustand";
import { fetchProjectGitInfo, type ProjectGitInfo } from "@/lib/git";

interface ProjectGitState {
  byProjectPath: Record<string, ProjectGitInfo | null>;
  setProjectGitInfo: (projectPath: string, info: ProjectGitInfo | null) => void;
  refreshProjectGitInfo: (projectPath: string) => Promise<ProjectGitInfo | null>;
}

function sameProjectGitInfo(a: ProjectGitInfo | null | undefined, b: ProjectGitInfo | null): boolean {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  return (
    a.branch === b.branch &&
    a.sha === b.sha &&
    a.originUrl === b.originUrl &&
    a.hasUpstream === b.hasUpstream &&
    a.branchAhead === b.branchAhead &&
    a.needsPublish === b.needsPublish
  );
}

function setProjectGitInfoState(
  state: ProjectGitState,
  projectPath: string,
  info: ProjectGitInfo | null,
): ProjectGitState {
  const current = state.byProjectPath[projectPath];
  if (sameProjectGitInfo(current, info)) return state;
  return {
    ...state,
    byProjectPath: {
      ...state.byProjectPath,
      [projectPath]: info,
    },
  };
}

export const useProjectGitStore = create<ProjectGitState>((set) => ({
  byProjectPath: {},
  setProjectGitInfo: (projectPath, info) =>
    set((state) => setProjectGitInfoState(state, projectPath, info)),
  refreshProjectGitInfo: async (projectPath) => {
    const info = await fetchProjectGitInfo(projectPath);
    set((state) => setProjectGitInfoState(state, projectPath, info));
    return info;
  },
}));
