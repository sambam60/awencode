import { create } from "zustand";
import type { LinearIssue } from "@/lib/linear";
import type { ReasoningEffort } from "@/lib/stores/settings-store";

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
  /** Shell only: full command line; streamed stdout/stderr lives in `detail`. */
  shellCommand?: string;
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
  /** Raw total token count for the thread when the server reports it. */
  totalTokens?: number | null;
  /** Model context window when reported alongside token usage. */
  modelContextWindow?: number | null;
  /** Window fill 0–100 when known (drives context ring on thread cards). */
  contextUsagePercent?: number | null;
  files: string[];
  /** Latest aggregated unified diff for the current turn. */
  diff?: string | null;
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
  /** Timestamp for the currently running or most recent turn. */
  lastTurnStartedAt?: number | null;
  /** Cached duration for the most recent finished turn. */
  lastTurnDurationMs?: number | null;
  /** Agent plan / todo steps from `turn/plan/updated`. */
  planSteps?: AgentPlanStep[];
  /** GitHub origin URL parsed from git remote. */
  originUrl?: string | null;
  /** Short SHA of the HEAD commit when this thread was opened. */
  sha?: string | null;
  /** GitHub PR status details fetched from the API. */
  prStatus?: PrStatus | null;
  /** Explicit Linear issues linked to this thread. */
  linkedLinearIssues?: LinearIssue[];
  /** Distinct models used by this thread over time. */
  modelsUsed?: string[];
  /** Thread-scoped composer model selection (falls back to settings default when unset). */
  selectedModelId?: string | null;
  /** Thread-scoped composer reasoning level (falls back to settings default when unset). */
  selectedReasoningEffort?: ReasoningEffort | null;
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
  addAgent: (agent: Agent, options?: { select?: boolean }) => void;
  setAgentCodexThreadId: (agentId: string, threadId: string) => void;
  appendAgentMessage: (agentId: string, message: AgentMessage) => void;
  appendAgentStreamingDelta: (agentId: string, delta: string) => void;
  flushAgentStreamingBuffer: (agentId: string) => void;
  setAgentTurnInProgress: (agentId: string, value: boolean) => void;
  setAgentStatus: (agentId: string, status: AgentStatus) => void;
  updateAgentGitInfo: (agentId: string, info: { branch?: string; sha?: string; originUrl?: string }) => void;
  updateAgentPrStatus: (agentId: string, prStatus: PrStatus | null) => void;
  setAgentLinkedLinearIssues: (agentId: string, issues: LinearIssue[]) => void;
  upsertAgentLinkedLinearIssue: (agentId: string, issue: LinearIssue) => void;
  addAgentActivity: (agentId: string, activity: AgentActivity) => void;
  updateAgentActivity: (agentId: string, activityId: string, patch: Partial<AgentActivity>) => void;
  appendAgentThinkingDelta: (agentId: string, delta: string) => void;
  finalizeAgentThinking: (agentId: string) => void;
  finalizeRunningAgentActivities: (agentId: string) => void;
  clearAgentActivities: (agentId: string) => void;
  setAgentPendingApproval: (agentId: string, approval: ApprovalRequest | null) => void;
  updateAgentTitle: (agentId: string, title: string) => void;
  setAgentPlan: (agentId: string, planSteps: AgentPlanStep[]) => void;
  updateAgentProgress: (agentId: string, progress: number) => void;
  setAgentCurrentTurnId: (agentId: string, turnId: string | null) => void;
  setAgentTurnTiming: (
    agentId: string,
    patch: { lastTurnStartedAt?: number | null; lastTurnDurationMs?: number | null },
  ) => void;
  updateAgentUsage: (
    agentId: string,
    usage: {
      tokens?: string;
      totalTokens?: number | null;
      modelContextWindow?: number | null;
      contextUsagePercent?: number | null;
    },
  ) => void;
  updateAgentDiff: (
    agentId: string,
    diff: string | null,
    files: string[],
  ) => void;
  setAgentSelectedModelId: (agentId: string, modelId: string) => void;
  setAgentSelectedReasoningEffort: (agentId: string, effort: ReasoningEffort) => void;
  addAgentModel: (agentId: string, model: string) => void;
  removeAgent: (agentId: string) => void;
  /** Drop messages from `fromIndex` onward and reset in-flight UI state (prompt edit / rollback). */
  truncateAgentMessagesFrom: (agentId: string, fromIndex: number) => void;
  /** In-place user message text only — does not call the model. */
  replaceUserMessageContent: (agentId: string, index: number, content: string) => void;
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
  setAgents: (agents) =>
    set({
      agents: agents.map((agent) => ({
        ...agent,
        activities: agent.activities ?? [],
        linkedLinearIssues: agent.linkedLinearIssues ?? [],
        planSteps: agent.planSteps ?? [],
        modelsUsed: agent.modelsUsed ?? [],
        selectedModelId: agent.selectedModelId ?? null,
        selectedReasoningEffort: agent.selectedReasoningEffort ?? null,
      })),
    }),
  addAgent: (agent, options) =>
    set((s) => ({
      agents: [
        ...s.agents,
        {
          ...agent,
          activities: agent.activities ?? [],
          linkedLinearIssues: agent.linkedLinearIssues ?? [],
          planSteps: agent.planSteps ?? [],
          modelsUsed: agent.modelsUsed ?? [],
          selectedModelId: agent.selectedModelId ?? null,
          selectedReasoningEffort: agent.selectedReasoningEffort ?? null,
        },
      ],
      selectedAgentId:
        options?.select === false ? s.selectedAgentId : agent.id,
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

  setAgentLinkedLinearIssues: (agentId, issues) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === agentId ? { ...a, linkedLinearIssues: issues } : a,
      ),
    })),

  upsertAgentLinkedLinearIssue: (agentId, issue) =>
    set((s) => ({
      agents: s.agents.map((a) => {
        if (a.id !== agentId) return a;
        const existing = a.linkedLinearIssues ?? [];
        const next = existing.some((x) => x.id === issue.id || x.identifier === issue.identifier)
          ? existing.map((x) =>
              x.id === issue.id || x.identifier === issue.identifier ? issue : x,
            )
          : [...existing, issue];
        return { ...a, linkedLinearIssues: next };
      }),
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

  finalizeRunningAgentActivities: (agentId) =>
    set((s) => ({
      agents: s.agents.map((a) => {
        if (a.id !== agentId) return a;
        const now = Date.now();
        return {
          ...a,
          activities: (a.activities ?? []).map((act) => {
            if (act.status !== "running") return act;
            return {
              ...act,
              id:
                act.id === STREAMING_THINKING_ACTIVITY_ID
                  ? `thinking-${act.startedAt}`
                  : act.id,
              status: "done" as const,
              durationMs: now - act.startedAt,
            };
          }),
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

  setAgentTurnTiming: (agentId, patch) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === agentId
          ? {
              ...a,
              ...(patch.lastTurnStartedAt !== undefined && {
                lastTurnStartedAt: patch.lastTurnStartedAt,
              }),
              ...(patch.lastTurnDurationMs !== undefined && {
                lastTurnDurationMs: patch.lastTurnDurationMs,
              }),
            }
          : a,
      ),
    })),

  updateAgentUsage: (agentId, usage) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === agentId
          ? {
              ...a,
              ...(usage.tokens !== undefined && { tokens: usage.tokens }),
              ...(usage.totalTokens !== undefined && {
                totalTokens: usage.totalTokens,
              }),
              ...(usage.modelContextWindow !== undefined && {
                modelContextWindow: usage.modelContextWindow,
              }),
              ...(usage.contextUsagePercent !== undefined && {
                contextUsagePercent: usage.contextUsagePercent,
              }),
            }
          : a,
      ),
    })),

  updateAgentDiff: (agentId, diff, files) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === agentId
          ? {
              ...a,
              diff,
              files,
            }
          : a,
      ),
    })),

  setAgentSelectedModelId: (agentId, modelId) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === agentId ? { ...a, selectedModelId: modelId.trim() || null } : a,
      ),
    })),

  setAgentSelectedReasoningEffort: (agentId, effort) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === agentId ? { ...a, selectedReasoningEffort: effort } : a,
      ),
    })),

  addAgentModel: (agentId, model) =>
    set((s) => ({
      agents: s.agents.map((a) => {
        if (a.id !== agentId) return a;
        const next = model.trim();
        if (!next) return a;
        const existing = a.modelsUsed ?? [];
        if (existing.includes(next)) return a;
        return { ...a, modelsUsed: [...existing, next] };
      }),
    })),

  removeAgent: (agentId) =>
    set((s) => ({
      agents: s.agents.filter((a) => a.id !== agentId),
      selectedAgentId: s.selectedAgentId === agentId ? null : s.selectedAgentId,
    })),

  truncateAgentMessagesFrom: (agentId, fromIndex) =>
    set((s) => ({
      agents: s.agents.map((a) => {
        if (a.id !== agentId) return a;
        const nextMessages =
          fromIndex <= 0 ? [] : a.messages.slice(0, fromIndex);
        return {
          ...a,
          messages: nextMessages,
          activities: [],
          streamingBuffer: "",
          turnInProgress: false,
          currentTurnId: null,
          pendingApproval: null,
          planSteps: [],
        };
      }),
    })),

  replaceUserMessageContent: (agentId, index, content) =>
    set((s) => ({
      agents: s.agents.map((a) => {
        if (a.id !== agentId) return a;
        const msg = a.messages[index];
        if (!msg || msg.role !== "you") return a;
        const messages = a.messages.map((m, i) =>
          i === index ? { ...m, content } : m,
        );
        return { ...a, messages };
      }),
    })),
}));
