import { create } from "zustand";

export type AgentStatus = "queued" | "active" | "review" | "deployed";

export interface AgentMessage {
  role: "you" | "agent";
  content: string;
  /** Image data URLs attached to this message (user messages only). */
  imageUrls?: string[];
}

export type ActivityKind =
  | "shell"
  | "read_file"
  | "write_file"
  | "search"
  | "tool"
  | "log";

export interface AgentActivity {
  id: string;
  kind: ActivityKind;
  label: string;
  detail?: string;
  status: "running" | "done" | "error";
  durationMs?: number;
  startedAt: number;
}

/** In-flight reasoning stream; finalized to `thinking-${startedAt}` on turn end. */
export const STREAMING_THINKING_ACTIVITY_ID = "__thinking_stream__";

const THINKING_DETAIL_MAX = 150_000;

// ─── Approval requests ──────────────────────────────────────────────────────

export type ApprovalRequestType = "commandExecution" | "fileChange" | "permissions";

export interface ApprovalRequest {
  /** JSON-RPC id from the server request — needed to respond. */
  rpcId: number;
  type: ApprovalRequestType;
  threadId: string;
  turnId: string;
  itemId: string;
  /** Shell command (commandExecution only). */
  command?: string | null;
  /** Working directory (commandExecution only). */
  cwd?: string | null;
  /** Human-readable reason from the server. */
  reason?: string | null;
  /** Permissions being requested (permissions only). */
  permissions?: unknown;
  /** Available decisions the client may present. */
  availableDecisions?: string[] | null;
}

/** Mirrors Codex `TurnPlanStep` / `TurnPlanStepStatus` for UI. */
export type AgentPlanStepStatus = "pending" | "inProgress" | "completed";

export interface AgentPlanStep {
  step: string;
  status: AgentPlanStepStatus;
}

export interface Agent {
  id: string;
  title: string;
  branch: string;
  status: AgentStatus;
  lastAction: string;
  progress: number;
  time: string;
  tokens: string;
  files: string[];
  pr: string | null;
  messages: AgentMessage[];
  /** Live activity feed — tool calls, shell commands, file reads, etc. */
  activities?: AgentActivity[];
  blocked: boolean;
  blockReason?: string;
  deployedAt?: string;
  /** Codex app-server thread id when this agent is backed by a real thread. */
  codexThreadId?: string | null;
  /** Pending approval request from the server (null when none). */
  pendingApproval?: ApprovalRequest | null;
  /** Accumulated streaming delta for the current assistant message. */
  streamingBuffer?: string;
  /** True while a turn is in progress (waiting for turn/completed). */
  turnInProgress?: boolean;
  /** Current in-flight turn id (from `turn/started`); required for `turn/interrupt`. */
  currentTurnId?: string | null;
  /** Agent plan / todo steps from `turn/plan/updated`. */
  planSteps?: AgentPlanStep[];
  /** GitHub origin URL parsed from git remote. */
  originUrl?: string | null;
  /** Short SHA of the HEAD commit when this thread was opened. */
  sha?: string | null;
  /** GitHub PR status details fetched from the API. */
  prStatus?: PrStatus | null;
}

export interface PrStatus {
  checksState: "success" | "failure" | "pending" | "none";
  approvals: number;
  comments: number;
  mergeable: boolean;
  prNumber: number | null;
  prUrl: string | null;
}

interface ThreadState {
  agents: Agent[];
  selectedAgentId: string | null;
  selectAgent: (id: string | null) => void;
  setAgents: (agents: Agent[]) => void;
  addAgent: (agent: Agent) => void;
  setAgentCodexThreadId: (agentId: string, threadId: string) => void;
  appendAgentMessage: (agentId: string, message: AgentMessage) => void;
  appendAgentStreamingDelta: (agentId: string, delta: string) => void;
  flushAgentStreamingBuffer: (agentId: string) => void;
  setAgentTurnInProgress: (agentId: string, value: boolean) => void;
  setAgentStatus: (agentId: string, status: AgentStatus) => void;
  updateAgentGitInfo: (agentId: string, info: { branch?: string; sha?: string; originUrl?: string }) => void;
  updateAgentPrStatus: (agentId: string, prStatus: PrStatus | null) => void;
  addAgentActivity: (agentId: string, activity: AgentActivity) => void;
  updateAgentActivity: (agentId: string, activityId: string, patch: Partial<AgentActivity>) => void;
  appendAgentThinkingDelta: (agentId: string, delta: string) => void;
  finalizeAgentThinking: (agentId: string) => void;
  clearAgentActivities: (agentId: string) => void;
  setAgentPendingApproval: (agentId: string, approval: ApprovalRequest | null) => void;
  updateAgentTitle: (agentId: string, title: string) => void;
  setAgentPlan: (agentId: string, planSteps: AgentPlanStep[]) => void;
  updateAgentProgress: (agentId: string, progress: number) => void;
  setAgentCurrentTurnId: (agentId: string, turnId: string | null) => void;
}

function progressFromPlanSteps(steps: AgentPlanStep[]): number {
  if (steps.length === 0) return 0;
  const done = steps.filter((s) => s.status === "completed").length;
  return Math.round((100 * done) / steps.length);
}

export const useThreadStore = create<ThreadState>((set) => ({
  agents: [],
  selectedAgentId: null,
  selectAgent: (id) => set({ selectedAgentId: id }),
  setAgents: (agents) => set({ agents }),
  addAgent: (agent) =>
    set((s) => ({
      agents: [
        ...s.agents,
        {
          ...agent,
          activities: agent.activities ?? [],
          planSteps: agent.planSteps ?? [],
        },
      ],
      selectedAgentId: agent.id,
    })),

  setAgentCodexThreadId: (agentId, threadId) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === agentId ? { ...a, codexThreadId: threadId } : a,
      ),
    })),

  appendAgentMessage: (agentId, message) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === agentId
          ? { ...a, messages: [...a.messages, message] }
          : a,
      ),
    })),

  appendAgentStreamingDelta: (agentId, delta) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === agentId
          ? { ...a, streamingBuffer: (a.streamingBuffer ?? "") + delta }
          : a,
      ),
    })),

  flushAgentStreamingBuffer: (agentId) =>
    set((s) => ({
      agents: s.agents.map((a) => {
        if (a.id !== agentId) return a;
        const buf = a.streamingBuffer ?? "";
        if (buf.length === 0) return { ...a, streamingBuffer: "" };
        return {
          ...a,
          messages: [...a.messages, { role: "agent" as const, content: buf }],
          streamingBuffer: "",
        };
      }),
    })),

  setAgentTurnInProgress: (agentId, value) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === agentId ? { ...a, turnInProgress: value } : a,
      ),
    })),

  setAgentStatus: (agentId, status) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === agentId ? { ...a, status } : a,
      ),
    })),

  updateAgentGitInfo: (agentId, info) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === agentId
          ? {
              ...a,
              ...(info.branch !== undefined && { branch: info.branch }),
              ...(info.sha !== undefined && { sha: info.sha }),
              ...(info.originUrl !== undefined && { originUrl: info.originUrl }),
            }
          : a,
      ),
    })),

  updateAgentPrStatus: (agentId, prStatus) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === agentId ? { ...a, prStatus } : a,
      ),
    })),

  addAgentActivity: (agentId, activity) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === agentId
          ? { ...a, activities: [...(a.activities ?? []), activity] }
          : a,
      ),
    })),

  updateAgentActivity: (agentId, activityId, patch) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === agentId
          ? {
              ...a,
              activities: (a.activities ?? []).map((act) =>
                act.id === activityId ? { ...act, ...patch } : act,
              ),
            }
          : a,
      ),
    })),

  appendAgentThinkingDelta: (agentId, delta) =>
    set((s) => ({
      agents: s.agents.map((a) => {
        if (a.id !== agentId) return a;
        const activities = a.activities ?? [];
        const idx = activities.findIndex(
          (act) => act.id === STREAMING_THINKING_ACTIVITY_ID,
        );
        if (idx >= 0) {
          const act = activities[idx];
          const combined = (act.detail ?? "") + delta;
          const capped =
            combined.length > THINKING_DETAIL_MAX
              ? combined.slice(-THINKING_DETAIL_MAX)
              : combined;
          return {
            ...a,
            activities: activities.map((x, i) =>
              i === idx ? { ...x, detail: capped } : x,
            ),
          };
        }
        const newAct: AgentActivity = {
          id: STREAMING_THINKING_ACTIVITY_ID,
          kind: "log",
          label: "thinking",
          detail: delta,
          status: "running",
          startedAt: Date.now(),
        };
        return { ...a, activities: [newAct, ...activities] };
      }),
    })),

  finalizeAgentThinking: (agentId) =>
    set((s) => ({
      agents: s.agents.map((a) => {
        if (a.id !== agentId) return a;
        const activities = a.activities ?? [];
        const idx = activities.findIndex(
          (act) => act.id === STREAMING_THINKING_ACTIVITY_ID,
        );
        if (idx < 0) return a;
        const act = activities[idx];
        const now = Date.now();
        const finalized: AgentActivity = {
          ...act,
          id: `thinking-${act.startedAt}`,
          status: "done",
          durationMs: now - act.startedAt,
        };
        return {
          ...a,
          activities: activities.map((x, i) => (i === idx ? finalized : x)),
        };
      }),
    })),

  clearAgentActivities: (agentId) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === agentId ? { ...a, activities: [] } : a,
      ),
    })),

  setAgentPendingApproval: (agentId, approval) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === agentId ? { ...a, pendingApproval: approval } : a,
      ),
    })),

  updateAgentTitle: (agentId, title) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === agentId ? { ...a, title } : a,
      ),
    })),

  setAgentPlan: (agentId, planSteps) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === agentId
          ? {
              ...a,
              planSteps,
              progress: progressFromPlanSteps(planSteps),
            }
          : a,
      ),
    })),

  updateAgentProgress: (agentId, progress) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === agentId ? { ...a, progress } : a,
      ),
    })),

  setAgentCurrentTurnId: (agentId, turnId) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === agentId ? { ...a, currentTurnId: turnId } : a,
      ),
    })),
}));
