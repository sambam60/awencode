import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Agent } from "@/lib/stores/thread-store";
import type { BoardColumn } from "@/lib/stores/board-ui-store";

export type WorkspaceSubView = "orchestrator" | "chat" | "settings";

export interface ProjectWorkspaceData {
  agents: Agent[];
  selectedAgentId: string | null;
  boardCollapsedCols: Partial<Record<BoardColumn, boolean>>;
  chatFileTreeOpenByAgentId: Record<string, boolean>;
  /** Persisted prompt text for threads still in Queue (unsent draft). */
  chatComposeDraftByAgentId: Record<string, string>;
  lastView: WorkspaceSubView;
}

function emptyProjectWorkspace(): ProjectWorkspaceData {
  return {
    agents: [],
    selectedAgentId: null,
    boardCollapsedCols: {},
    chatFileTreeOpenByAgentId: {},
    chatComposeDraftByAgentId: {},
    lastView: "orchestrator",
  };
}

interface ProjectWorkspaceStore {
  projects: Record<string, ProjectWorkspaceData>;
  upsertProject: (projectPath: string, data: ProjectWorkspaceData) => void;
}

export const useProjectWorkspaceStore = create<ProjectWorkspaceStore>()(
  persist(
    (set) => ({
      projects: {},
      upsertProject: (projectPath, data) =>
        set((s) => ({
          projects: { ...s.projects, [projectPath]: data },
        })),
    }),
    { name: "awencode-workspace-v1" },
  ),
);

export function getProjectWorkspace(projectPath: string): ProjectWorkspaceData {
  const ws = useProjectWorkspaceStore.getState().projects[projectPath];
  if (!ws) return emptyProjectWorkspace();
  return {
    ...emptyProjectWorkspace(),
    ...ws,
    chatFileTreeOpenByAgentId: ws.chatFileTreeOpenByAgentId ?? {},
    chatComposeDraftByAgentId: ws.chatComposeDraftByAgentId ?? {},
  };
}
