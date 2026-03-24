import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/stores/app-store";
import { useThreadStore, type Agent } from "@/lib/stores/thread-store";
import { useViewStore } from "@/lib/stores/view-store";
import { useBoardUiStore } from "@/lib/stores/board-ui-store";
import { useChatUiStore } from "@/lib/stores/chat-ui-store";
import {
  getProjectWorkspace,
  useProjectWorkspaceStore,
  type ProjectWorkspaceData,
  type WorkspaceSubView,
} from "@/lib/stores/project-workspace-store";

function sanitizeAgentForDisk(a: Agent): Agent {
  const activities = a.activities?.map((act) =>
    act.status === "running" ? { ...act, status: "done" as const } : act,
  );
  return {
    ...a,
    ...(activities !== undefined && { activities }),
    streamingBuffer: undefined,
    turnInProgress: false,
    currentTurnId: null,
    pendingApproval: null,
  };
}

function hydrateAgentFromDisk(a: Agent): Agent {
  return {
    ...sanitizeAgentForDisk(a),
    activities: a.activities ?? [],
    linkedLinearIssues: a.linkedLinearIssues ?? [],
    planSteps: a.planSteps ?? [],
    messages: a.messages ?? [],
    files: a.files ?? [],
    modelsUsed: a.modelsUsed ?? [],
    streamingBuffer: "",
    turnInProgress: false,
    currentTurnId: null,
    pendingApproval: null,
  };
}

function shouldPersistQueuedAgent(agent: Agent, composeDraft: string | undefined): boolean {
  if (agent.status !== "queued") return true;
  if (agent.messages.length > 0) return true;
  return (composeDraft ?? "").trim().length > 0;
}

function buildSnapshot(projectPath: string): ProjectWorkspaceData {
  const { agents, selectedAgentId } = useThreadStore.getState();
  const { collapsedCols } = useBoardUiStore.getState();
  const { fileTreeOpenByAgentId, composeDraftByAgentId } = useChatUiStore.getState();
  const view = useViewStore.getState().view;
  const prevLast =
    useProjectWorkspaceStore.getState().projects[projectPath]?.lastView ??
    "orchestrator";
  let lastView: WorkspaceSubView =
    view === "orchestrator" || view === "chat" || view === "settings"
      ? view
      : prevLast;
  // Leaving for home/onboarding: don't keep "settings" as the restore target —
  // otherwise reopening the project from home jumps back into settings.
  if (
    (view === "home" || view === "onboarding") &&
    lastView === "settings"
  ) {
    lastView = "orchestrator";
  }

  const persistedAgents = agents.filter((agent) =>
    shouldPersistQueuedAgent(agent, composeDraftByAgentId[agent.id]),
  );
  const persistedAgentIds = new Set(persistedAgents.map((agent) => agent.id));
  const persistedSelectedAgentId =
    selectedAgentId && persistedAgentIds.has(selectedAgentId) ? selectedAgentId : null;
  const persistedFileTreeOpenByAgentId = Object.fromEntries(
    Object.entries(fileTreeOpenByAgentId).filter(([agentId]) =>
      persistedAgentIds.has(agentId),
    ),
  );
  const persistedComposeDraftByAgentId = Object.fromEntries(
    Object.entries(composeDraftByAgentId).filter(([agentId, draft]) =>
      persistedAgentIds.has(agentId) && draft.trim().length > 0,
    ),
  );

  return {
    agents: persistedAgents.map(sanitizeAgentForDisk),
    selectedAgentId: persistedSelectedAgentId,
    boardCollapsedCols: { ...collapsedCols },
    chatFileTreeOpenByAgentId: persistedFileTreeOpenByAgentId,
    chatComposeDraftByAgentId: persistedComposeDraftByAgentId,
    lastView,
  };
}

function flushToProject(projectPath: string) {
  useProjectWorkspaceStore
    .getState()
    .upsertProject(projectPath, buildSnapshot(projectPath));
}

function hydrateProject(projectPath: string) {
  const ws = getProjectWorkspace(projectPath);
  const agents = ws.agents.map(hydrateAgentFromDisk);
  let selectedAgentId = ws.selectedAgentId;
  if (selectedAgentId && !agents.some((a) => a.id === selectedAgentId)) {
    selectedAgentId = null;
  }

  useThreadStore.getState().setAgents(agents);
  useThreadStore.getState().selectAgent(selectedAgentId);
  useBoardUiStore.getState().setCollapsedCols(ws.boardCollapsedCols);
  useChatUiStore.getState().setAllFileTreePrefs(ws.chatFileTreeOpenByAgentId);
  useChatUiStore.getState().setAllComposeDrafts(ws.chatComposeDraftByAgentId ?? {});

  const setView = useViewStore.getState().setView;
  if (ws.lastView === "chat" && selectedAgentId) {
    setView("chat");
  } else {
    // Don't restore settings from disk — it isn't a sensible "resume" surface
    // (e.g. home → reopen project should land on the board, not settings).
    setView("orchestrator");
  }
}

function clearRuntimeWorkspace() {
  useThreadStore.getState().setAgents([]);
  useThreadStore.getState().selectAgent(null);
  useBoardUiStore.getState().reset();
  useChatUiStore.getState().reset();
}

const FLUSH_DEBOUNCE_MS = 400;

function useWorkspacePersistReady(): boolean {
  const [ready, setReady] = useState(() =>
    useProjectWorkspaceStore.persist.hasHydrated(),
  );

  useEffect(() => {
    if (useProjectWorkspaceStore.persist.hasHydrated()) {
      setReady(true);
      return;
    }
    return useProjectWorkspaceStore.persist.onFinishHydration(() => {
      setReady(true);
    });
  }, []);

  return ready;
}

/** Keeps thread + board + chat UI state in sync with localStorage, scoped by `projectPath`. */
export function useProjectWorkspaceBridge() {
  const projectPath = useAppStore((s) => s.projectPath);
  const workspaceReady = useWorkspacePersistReady();
  const prevPathRef = useRef<string | null>(null);
  const flushTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!workspaceReady) return;

    const prev = prevPathRef.current;
    prevPathRef.current = projectPath;

    if (prev && prev !== projectPath) {
      flushToProject(prev);
    }

    if (projectPath) {
      hydrateProject(projectPath);
    } else {
      clearRuntimeWorkspace();
    }
  }, [projectPath, workspaceReady]);

  useEffect(() => {
    if (!workspaceReady || !projectPath) return;

    /** Workspace key for this subscription period (cleanup must not flush if hydration moved on). */
    const subscribedPath = projectPath;

    const scheduleFlush = () => {
      if (flushTimerRef.current) {
        window.clearTimeout(flushTimerRef.current);
      }
      flushTimerRef.current = window.setTimeout(() => {
        flushTimerRef.current = null;
        const path = useAppStore.getState().projectPath;
        if (path) flushToProject(path);
      }, FLUSH_DEBOUNCE_MS);
    };

    const unThread = useThreadStore.subscribe(scheduleFlush);
    const unBoard = useBoardUiStore.subscribe(scheduleFlush);
    const unChat = useChatUiStore.subscribe(scheduleFlush);
    const unView = useViewStore.subscribe(scheduleFlush);

    return () => {
      unThread();
      unBoard();
      unChat();
      unView();
      if (flushTimerRef.current) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      // Only persist if in-memory state still belongs to this subscription. If another
      // effect already switched `projectPath` and hydrated a different project, the stores
      // hold the new project's data — flushing would corrupt the old workspace key.
      const activePath = useAppStore.getState().projectPath;
      if (activePath === subscribedPath) {
        flushToProject(subscribedPath);
      }
    };
  }, [projectPath, workspaceReady]);
}
