import { invoke } from "@tauri-apps/api/core";
import { rpcRespond } from "@/lib/rpc-client";
import type { LinearIssue, LinearTeam } from "@/lib/linear";
import { useSettingsStore } from "@/lib/stores/settings-store";
import { useThreadStore, type Agent, type AgentStatus } from "@/lib/stores/thread-store";

const CREATE_LINEAR_ISSUE_TOOL = "awencode_create_linear_issue";
const LINK_LINEAR_ISSUE_TOOL = "awencode_link_linear_issue";
const LIST_LINEAR_TEAMS_TOOL = "awencode_list_linear_teams";
const SYNC_LINEAR_ISSUES_TOOL = "awencode_sync_linear_issues";

type DynamicToolResult = {
  contentItems: Array<{ type: "inputText"; text: string }>;
  success: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function githubRepoPath(originUrl: string | null | undefined): string | null {
  if (!originUrl) return null;
  const match = originUrl.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
  return match?.[1] ?? null;
}

function appendThreadContext(description: string | null, agent: Agent): string {
  const lines = description ? [description.trim(), "", "---"] : ["---"];
  lines.push("Created from an Awencode thread.");
  lines.push(`Thread: ${agent.title}`);
  if (agent.branch.trim()) {
    lines.push(`Branch: ${agent.branch.trim()}`);
  }
  const repoPath = githubRepoPath(agent.originUrl);
  if (repoPath) {
    lines.push(`Repository: ${repoPath}`);
  }
  if (agent.prStatus?.prUrl) {
    lines.push(`Pull request: ${agent.prStatus.prUrl}`);
  }
  lines.push("Awencode does not expose a shareable thread URL in this build yet.");
  return lines.join("\n");
}

function resultFromText(text: string, success: boolean): DynamicToolResult {
  return {
    contentItems: [{ type: "inputText", text }],
    success,
  };
}

function addLinearActivityError(agentId: string, label: string, message: string) {
  useThreadStore.getState().addAgentActivity(agentId, {
    id: `linear-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: "tool",
    label,
    detail: message,
    status: "error",
    startedAt: Date.now(),
  });
}

function startLinearActivity(agentId: string, label: string, detail: string) {
  const id = `linear-sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  useThreadStore.getState().addAgentActivity(agentId, {
    id,
    kind: "tool",
    label,
    detail,
    status: "running",
    startedAt: Date.now(),
  });
  return id;
}

function finishLinearActivity(
  agentId: string,
  activityId: string,
  status: "done" | "error",
  detail: string,
) {
  const agent = useThreadStore.getState().agents.find((item) => item.id === agentId);
  const activity = agent?.activities?.find((item) => item.id === activityId);
  useThreadStore.getState().updateAgentActivity(agentId, activityId, {
    status,
    detail,
    durationMs: activity ? Date.now() - activity.startedAt : undefined,
  });
}

function inferThreadLinearTeam(agent: Agent): string | null {
  const linkedIssues = agent.linkedLinearIssues ?? [];
  const teamIds = [...new Set(linkedIssues.map((issue) => issue.teamId?.trim()).filter(Boolean))];
  if (teamIds.length === 1) return teamIds[0] ?? null;
  const teamNames = [...new Set(linkedIssues.map((issue) => issue.teamName?.trim()).filter(Boolean))];
  if (teamNames.length === 1) return teamNames[0] ?? null;
  return null;
}

export function buildLinearDynamicTools() {
  return [
    {
      name: CREATE_LINEAR_ISSUE_TOOL,
      description:
        "Create a Linear issue and link it to the current Awencode thread. Requires the user's Linear account to be connected in Awencode Settings. Prefer this over generic Linear MCP when the user asks to create or file an issue from the current thread. If the workspace has multiple teams and the team is unclear, call awencode_list_linear_teams first or reuse the thread's existing linked team.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: {
            type: "string",
            description: "Issue title.",
          },
          description: {
            type: "string",
            description:
              "Issue description in markdown. Thread context will be appended automatically.",
          },
          team: {
            type: "string",
            description:
              "Optional Linear team name or id. Omit only when the workspace has a single obvious team.",
          },
        },
        required: ["title"],
      },
    },
    {
      name: LIST_LINEAR_TEAMS_TOOL,
      description:
        "List available Linear teams for the connected workspace. Use this before creating a Linear issue when the correct team is unclear or when create fails because multiple teams exist.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
    },
    {
      name: LINK_LINEAR_ISSUE_TOOL,
      description:
        "Link an existing Linear issue to the current Awencode thread by identifier or id. Requires the user's Linear account to be connected in Awencode Settings. Prefer this over generic Linear MCP when the user asks to attach an issue to this thread.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          issue: {
            type: "string",
            description: "Linear issue identifier or id, for example ENG-123.",
          },
        },
        required: ["issue"],
      },
    },
    {
      name: SYNC_LINEAR_ISSUES_TOOL,
      description:
        "Sync the current thread's linked Linear issues to an Awencode status. Prefer this over generic Linear MCP when the user asks to sync, update, move, or align Linear issue statuses for the current thread.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          status: {
            type: "string",
            description:
              "Optional Awencode status to sync to. Defaults to the thread's current status. Accepted values: queued, active, review, deployed, draft, drafts, running, done.",
          },
        },
      },
    },
  ];
}

export function isLinearDynamicTool(tool: string): boolean {
  return (
    tool === CREATE_LINEAR_ISSUE_TOOL ||
    tool === LIST_LINEAR_TEAMS_TOOL ||
    tool === LINK_LINEAR_ISSUE_TOOL ||
    tool === SYNC_LINEAR_ISSUES_TOOL
  );
}

export async function handleLinearDynamicToolCall(
  agentId: string,
  rpcId: number,
  tool: string,
  args: unknown,
): Promise<boolean> {
  if (!isLinearDynamicTool(tool)) return false;

  try {
    const text = await (() => {
      if (tool === CREATE_LINEAR_ISSUE_TOOL) {
        return createLinearIssueForThread(agentId, args);
      }
      if (tool === LIST_LINEAR_TEAMS_TOOL) {
        return listLinearTeamsForThread(agentId);
      }
      if (tool === LINK_LINEAR_ISSUE_TOOL) {
        return linkLinearIssueToThread(agentId, args);
      }
      return syncLinearIssuesForThread(agentId, args);
    })();
    await rpcRespond(rpcId, resultFromText(text, true));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : typeof error === "string" ? error : "Linear tool failed.";
    console.error(`Linear dynamic tool ${tool} failed`, error);
    addLinearActivityError(agentId, tool, message);
    await rpcRespond(rpcId, resultFromText(message, false));
  }

  return true;
}

function normalizeAwencodeStatus(value: string | null | undefined): AgentStatus | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "queued" || normalized === "draft" || normalized === "drafts") return "queued";
  if (normalized === "active" || normalized === "running") return "active";
  if (normalized === "review") return "review";
  if (normalized === "deployed" || normalized === "done") return "deployed";
  return null;
}

function preferredLinearStateName(status: AgentStatus): string | null {
  return useSettingsStore.getState().linearStatusMappings[status] ?? null;
}

function awencodeStatusLabel(status: AgentStatus): string {
  if (status === "queued") return "drafts";
  if (status === "active") return "running";
  if (status === "review") return "review";
  return "done";
}

function hasNamedState(issue: LinearIssue, candidates: string[]): boolean {
  const stateName = issue.stateName?.trim().toLowerCase();
  if (!stateName) return false;
  return candidates.some((candidate) => stateName.includes(candidate));
}

function inferAwencodeStatusFromLinearIssue(issue: LinearIssue): AgentStatus | null {
  const mappings = useSettingsStore.getState().linearStatusMappings;
  for (const status of ["deployed", "review", "active", "queued"] as const) {
    const mapped = mappings[status];
    if (mapped && issue.stateName?.trim().toLowerCase() === mapped.trim().toLowerCase()) {
      return status;
    }
  }

  if (hasNamedState(issue, ["canceled", "cancelled", "duplicate", "declined", "won't", "wont", "not doing"])) {
    return null;
  }
  if (hasNamedState(issue, ["done", "completed", "complete", "shipped", "deployed", "closed"])) {
    return "deployed";
  }
  if (hasNamedState(issue, ["in review", "review", "qa", "testing", "verify", "verification", "ready for review"])) {
    return "review";
  }
  if (hasNamedState(issue, ["in progress", "progress", "started", "doing", "working"])) {
    return "active";
  }
  if (hasNamedState(issue, ["triage", "backlog", "todo", "to do", "queued", "next up"])) {
    return "queued";
  }
  if (issue.stateType === "completed") return "deployed";
  if (issue.stateType === "started") return "active";
  if (issue.stateType === "unstarted") return "queued";
  return null;
}

function inferThreadStatusFromLinearIssues(issues: LinearIssue[]): AgentStatus | null {
  const rank: Record<AgentStatus, number> = {
    queued: 0,
    active: 1,
    review: 2,
    deployed: 3,
  };
  let best: AgentStatus | null = null;
  for (const issue of issues) {
    const next = inferAwencodeStatusFromLinearIssue(issue);
    if (!next) continue;
    if (!best || rank[next] > rank[best]) {
      best = next;
    }
  }
  return best;
}

function addLinearThreadStatusActivity(
  agentId: string,
  nextStatus: AgentStatus,
  issue: LinearIssue | null,
) {
  useThreadStore.getState().addAgentActivity(agentId, {
    id: `linear-thread-status-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: "tool",
    label: "linear status sync",
    detail: issue?.stateName
      ? `Updated thread to ${awencodeStatusLabel(nextStatus)} from linked Linear issue ${issue.identifier} (${issue.stateName}).`
      : `Updated thread to ${awencodeStatusLabel(nextStatus)} from a linked Linear issue.`,
    status: "done",
    startedAt: Date.now(),
  });
}

async function createLinearIssueForThread(agentId: string, args: unknown): Promise<string> {
  const agent = useThreadStore.getState().agents.find((item) => item.id === agentId);
  if (!agent) {
    throw new Error("Awencode could not find the current thread.");
  }

  const input = asRecord(args);
  const title = readString(input.title);
  if (!title) {
    throw new Error("A Linear issue title is required.");
  }

  const inferredTeam = inferThreadLinearTeam(agent);
  let issue: LinearIssue;
  try {
    issue = await invoke<LinearIssue>("linear_create_issue", {
      title,
      description: appendThreadContext(readString(input.description), agent),
      team: readString(input.team) ?? inferredTeam,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : typeof error === "string" ? error : "Linear issue creation failed.";
    if (message.includes("A Linear team is required")) {
      throw new Error(`${message} Call awencode_list_linear_teams, then retry with a team.`);
    }
    throw error;
  }

  useThreadStore.getState().upsertAgentLinkedLinearIssue(agentId, issue);
  return `Created and linked Linear issue ${issue.identifier}: ${issue.title}.`;
}

async function listLinearTeamsForThread(agentId: string): Promise<string> {
  const teams = await invoke<LinearTeam[]>("linear_get_teams");
  if (teams.length === 0) {
    throw new Error("No Linear teams are available for this account.");
  }
  const agent = useThreadStore.getState().agents.find((item) => item.id === agentId);
  const inferredTeam = agent ? inferThreadLinearTeam(agent) : null;
  const summary = teams.map((team) => team.name).join(", ");
  return inferredTeam
    ? `Available Linear teams: ${summary}. This thread is already associated with ${inferredTeam}.`
    : `Available Linear teams: ${summary}.`;
}

async function linkLinearIssueToThread(agentId: string, args: unknown): Promise<string> {
  const input = asRecord(args);
  const issueRef = readString(input.issue) ?? readString(input.identifier) ?? readString(input.id);
  if (!issueRef) {
    throw new Error("A Linear issue identifier is required to link an issue.");
  }

  const issue = await invoke<LinearIssue>("linear_get_issue", { issueId: issueRef });
  useThreadStore.getState().upsertAgentLinkedLinearIssue(agentId, issue);
  return `Linked Linear issue ${issue.identifier}: ${issue.title}.`;
}

async function syncLinearIssuesForThread(agentId: string, args: unknown): Promise<string> {
  const agent = useThreadStore.getState().agents.find((item) => item.id === agentId);
  if (!agent) {
    throw new Error("Awencode could not find the current thread.");
  }
  const linkedIssues = agent.linkedLinearIssues ?? [];
  if (linkedIssues.length === 0) {
    throw new Error("No Linear issues are linked to this thread yet.");
  }

  const input = asRecord(args);
  const requestedStatus = normalizeAwencodeStatus(readString(input.status));
  if (readString(input.status) && !requestedStatus) {
    throw new Error(
      'Unsupported Awencode status. Use queued, active, review, deployed, draft, running, or done.',
    );
  }

  const targetStatus = requestedStatus ?? agent.status;
  const updatedIssues = await syncLinkedLinearIssuesForAgentStatus(agentId, targetStatus);
  const summary = updatedIssues
    .map((issue) => `${issue.identifier}${issue.stateName ? ` -> ${issue.stateName}` : ""}`)
    .join(", ");
  return `Synced ${updatedIssues.length} linked Linear issue${updatedIssues.length === 1 ? "" : "s"} to ${targetStatus}${summary ? `: ${summary}.` : "."}`;
}

export async function syncLinkedLinearIssuesForAgentStatus(
  agentId: string,
  status: AgentStatus,
): Promise<LinearIssue[]> {
  const agent = useThreadStore.getState().agents.find((item) => item.id === agentId);
  const issues = agent?.linkedLinearIssues ?? [];
  if (issues.length === 0) return [];

  return (
    await Promise.all(
      issues.map(async (issue) => {
        const activityId = startLinearActivity(
          agentId,
          `sync ${issue.identifier}`,
          `Syncing to Awencode status "${status}".`,
        );
        try {
          const updated = await invoke<LinearIssue>("linear_update_issue_state", {
            issueId: issue.identifier,
            awencodeStatus: status,
            preferredStateName: preferredLinearStateName(status),
          });
          useThreadStore.getState().upsertAgentLinkedLinearIssue(agentId, updated);
          finishLinearActivity(
            agentId,
            activityId,
            "done",
            updated.stateName
              ? `Synced to Linear state "${updated.stateName}".`
              : `Synced to Awencode status "${status}".`,
          );
          return updated;
        } catch (error) {
          console.error("linear_update_issue_state failed", error);
          const message =
            error instanceof Error ? error.message : typeof error === "string" ? error : "Linear status sync failed.";
          finishLinearActivity(agentId, activityId, "error", message);
          throw new Error(`Failed to sync ${issue.identifier}: ${message}`);
        }
      }),
    )
  );
}

export async function refreshLinkedLinearIssuesForAgent(agentId: string): Promise<void> {
  const agent = useThreadStore.getState().agents.find((item) => item.id === agentId);
  const issues = agent?.linkedLinearIssues ?? [];
  if (issues.length === 0) return;

  const refreshed = await Promise.all(
    issues.map((issue) => invoke<LinearIssue>("linear_get_issue", { issueId: issue.identifier })),
  );
  useThreadStore.getState().setAgentLinkedLinearIssues(agentId, refreshed);

  const nextStatus = inferThreadStatusFromLinearIssues(refreshed);
  const latestAgent = useThreadStore.getState().agents.find((item) => item.id === agentId);
  if (!latestAgent || latestAgent.turnInProgress || !nextStatus || latestAgent.status === nextStatus) {
    return;
  }

  useThreadStore.getState().setAgentStatus(agentId, nextStatus);
  const sourceIssue =
    refreshed.find((issue) => inferAwencodeStatusFromLinearIssue(issue) === nextStatus) ?? null;
  addLinearThreadStatusActivity(agentId, nextStatus, sourceIssue);
}
