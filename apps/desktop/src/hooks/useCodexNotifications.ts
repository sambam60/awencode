import { useEffect } from "react";
import { onNotification, rpcRequest } from "@/lib/rpc-client";
import { useThreadStore } from "@/lib/stores/thread-store";
import { useAppListStore } from "@/lib/stores/app-list-store";
import type {
  ActivityKind,
  AgentPlanStep,
  AgentPlanStepStatus,
  ApprovalRequest,
  ApprovalRequestType,
} from "@/lib/stores/thread-store";

interface CodexMessage {
  /** Present on server requests — needed to respond. */
  id?: number;
  method: string;
  params?: Record<string, unknown>;
}

function findAgentIdByCodexThreadId(threadId: string): string | null {
  const agent = useThreadStore.getState().agents.find(
    (a) => a.codexThreadId === threadId,
  );
  return agent?.id ?? null;
}

function threadIdFromParams(params: Record<string, unknown>): string | undefined {
  if (typeof params.threadId === "string") return params.threadId;
  if (typeof params.thread_id === "string") return params.thread_id;
  return undefined;
}

function mapPlanStepStatus(raw: string): AgentPlanStepStatus {
  if (raw === "completed") return "completed";
  if (raw === "inProgress") return "inProgress";
  return "pending";
}

function planStepsFromParams(plan: unknown): AgentPlanStep[] {
  if (!Array.isArray(plan)) return [];
  return plan.map((p) => {
    const o = p as Record<string, unknown>;
    const step = typeof o.step === "string" ? o.step : "";
    const st = typeof o.status === "string" ? o.status : "pending";
    return { step, status: mapPlanStepStatus(st) };
  });
}

/** Derive a human-readable label + kind from a tool name / notification method. */
function classifyTool(toolName: string, input?: unknown): { kind: ActivityKind; label: string; detail?: string } {
  const name = toolName.toLowerCase();
  const inputStr = typeof input === "string" ? input : input ? JSON.stringify(input) : undefined;

  if (name.includes("shell") || name === "bash" || name === "run_command") {
    const cmd = inputStr ? inputStr.slice(0, 80) : "";
    return { kind: "shell", label: "shell", detail: cmd };
  }
  if (name.includes("read") || name.includes("view") || name.includes("cat")) {
    const file = inputStr ? inputStr.replace(/^["'{]?/, "").slice(0, 60) : "";
    return { kind: "read_file", label: "read file", detail: file };
  }
  if (name.includes("write") || name.includes("edit") || name.includes("patch") || name.includes("create")) {
    const file = inputStr ? inputStr.slice(0, 60) : "";
    return { kind: "write_file", label: "write file", detail: file };
  }
  if (name.includes("search") || name.includes("grep") || name.includes("find") || name.includes("glob")) {
    return { kind: "search", label: "search", detail: inputStr?.slice(0, 60) };
  }
  return { kind: "tool", label: toolName, detail: inputStr?.slice(0, 80) };
}

/** Derive an activity from a ThreadItem. */
function activityFromItem(item: Record<string, unknown>): { kind: ActivityKind; label: string; detail?: string } | null {
  const type = item.type as string | undefined;
  if (type === "commandExecution") {
    const cmd = typeof item.command === "string" ? item.command : "";
    return { kind: "shell", label: "shell", detail: cmd.slice(0, 80) };
  }
  if (type === "fileChange") {
    const changes = Array.isArray(item.changes) ? item.changes : [];
    const first = changes[0] as { path?: string } | undefined;
    const detail = first?.path ? `${first.path}${changes.length > 1 ? ` +${changes.length - 1}` : ""}` : undefined;
    return { kind: "write_file", label: "edit file", detail };
  }
  if (type === "mcpToolCall") {
    const tool = typeof item.tool === "string" ? item.tool : "mcp";
    return { kind: "tool", label: tool, detail: undefined };
  }
  if (type === "reasoning") {
    return null;
  }
  if (type === "webSearch") {
    const query = typeof item.query === "string" ? item.query : "";
    return { kind: "search", label: "web search", detail: query.slice(0, 60) };
  }
  return null;
}

export function useCodexNotifications() {
  const appendAgentStreamingDelta = useThreadStore((s) => s.appendAgentStreamingDelta);
  const flushAgentStreamingBuffer = useThreadStore((s) => s.flushAgentStreamingBuffer);
  const setAgentTurnInProgress = useThreadStore((s) => s.setAgentTurnInProgress);
  const setAgentStatus = useThreadStore((s) => s.setAgentStatus);
  const addAgentActivity = useThreadStore((s) => s.addAgentActivity);
  const updateAgentActivity = useThreadStore((s) => s.updateAgentActivity);
  const appendAgentThinkingDelta = useThreadStore((s) => s.appendAgentThinkingDelta);
  const finalizeAgentThinking = useThreadStore((s) => s.finalizeAgentThinking);
  const clearAgentActivities = useThreadStore((s) => s.clearAgentActivities);
  const setAgentPendingApproval = useThreadStore((s) => s.setAgentPendingApproval);
  const updateAgentTitle = useThreadStore((s) => s.updateAgentTitle);
  const setAgentPlan = useThreadStore((s) => s.setAgentPlan);
  const setAgentCurrentTurnId = useThreadStore((s) => s.setAgentCurrentTurnId);
  const addAgentModel = useThreadStore((s) => s.addAgentModel);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    onNotification((payload: string) => {
      let msg: CodexMessage;
      try {
        msg = JSON.parse(payload) as CodexMessage;
      } catch {
        return;
      }

      const method = msg.method;
      const params = msg.params ?? {};
      const rpcId = msg.id; // present for server requests
      const threadId = threadIdFromParams(params);

      console.log("[codex]", method, params);

      if (!threadId) {
        if (method === "app/list/updated" && Array.isArray(params.data)) {
          useAppListStore.getState().setApps(
            (params.data as Array<{ id: string; name: string; isAccessible?: boolean }>).map((a) => ({
              id: a.id,
              name: a.name,
              isAccessible: a.isAccessible ?? false,
            })),
          );
        }
        return;
      }

      const agentId = findAgentIdByCodexThreadId(threadId);
      if (!agentId) return;

      switch (method) {
        case "thread/name/updated": {
          const name =
            typeof params.threadName === "string"
              ? params.threadName
              : typeof params.thread_name === "string"
                ? params.thread_name
                : null;
          if (name != null && name.length > 0) {
            queueMicrotask(() => {
              updateAgentTitle(agentId, name);
            });
          }
          break;
        }

        case "turn/plan/updated": {
          setAgentPlan(agentId, planStepsFromParams(params.plan));
          break;
        }

        case "turn/started": {
          clearAgentActivities(agentId);
          setAgentPlan(agentId, []);
          const turn = params.turn as Record<string, unknown> | undefined;
          const turnId = typeof turn?.id === "string" ? turn.id : null;
          setAgentCurrentTurnId(agentId, turnId);
          setAgentTurnInProgress(agentId, true);
          setAgentStatus(agentId, "active");
          break;
        }

        case "model/rerouted":
        case "model/routed":
        case "model/reroute": {
          const fromModel =
            typeof params.fromModel === "string" ? params.fromModel : null;
          const toModel =
            typeof params.toModel === "string" ? params.toModel : null;
          if (fromModel) addAgentModel(agentId, fromModel);
          if (toModel) addAgentModel(agentId, toModel);
          break;
        }

        case "item/agentMessage/delta": {
          const delta = typeof params.delta === "string" ? params.delta : "";
          if (delta) appendAgentStreamingDelta(agentId, delta);
          break;
        }

        case "turn/completed": {
          finalizeAgentThinking(agentId);
          flushAgentStreamingBuffer(agentId);
          setAgentTurnInProgress(agentId, false);
          setAgentCurrentTurnId(agentId, null);
          setAgentStatus(agentId, "review");
          break;
        }

        // ─── Item lifecycle (primary tool call tracking) ───────────

        case "item/started": {
          const item = params.item as Record<string, unknown> | undefined;
          if (!item) break;
          const itemId = typeof item.id === "string" ? item.id : `item-${Date.now()}`;
          const info = activityFromItem(item);
          if (info) {
            addAgentActivity(agentId, {
              id: itemId,
              kind: info.kind,
              label: info.label,
              detail: info.detail,
              status: "running",
              startedAt: Date.now(),
            });
          }
          break;
        }

        case "item/completed": {
          const item = params.item as Record<string, unknown> | undefined;
          if (!item) break;
          const itemId = typeof item.id === "string" ? item.id : null;
          if (itemId) {
            const agent = useThreadStore.getState().agents.find((a) => a.id === agentId);
            const act = agent?.activities?.find((a) => a.id === itemId);
            updateAgentActivity(agentId, itemId, {
              status: "done",
              durationMs: act ? Date.now() - act.startedAt : undefined,
            });
          }
          break;
        }

        // ─── Streaming output deltas ──────────────────────────────

        case "item/commandExecution/outputDelta": {
          const itemId = typeof params.itemId === "string" ? params.itemId : null;
          const delta = typeof params.delta === "string" ? params.delta : "";
          if (itemId && delta) {
            const agent = useThreadStore.getState().agents.find((a) => a.id === agentId);
            const act = agent?.activities?.find((a) => a.id === itemId);
            if (act) {
              const existing = act.detail ?? "";
              const combined = existing + delta;
              updateAgentActivity(agentId, itemId, {
                detail: combined.slice(-200),
              });
            }
          }
          break;
        }

        case "item/fileChange/outputDelta": {
          const itemId = typeof params.itemId === "string" ? params.itemId : null;
          const delta = typeof params.delta === "string" ? params.delta : "";
          if (itemId && delta) {
            const agent = useThreadStore.getState().agents.find((a) => a.id === agentId);
            const act = agent?.activities?.find((a) => a.id === itemId);
            if (act) {
              const existing = act.detail ?? "";
              const combined = existing + delta;
              updateAgentActivity(agentId, itemId, {
                detail: combined.slice(-200),
              });
            }
          }
          break;
        }

        // ─── Approval requests (server requests with rpcId) ──────

        case "item/commandExecution/requestApproval": {
          if (rpcId == null) break;
          const approval: ApprovalRequest = {
            rpcId,
            type: "commandExecution" as ApprovalRequestType,
            threadId: threadId!,
            turnId: typeof params.turnId === "string" ? params.turnId : "",
            itemId: typeof params.itemId === "string" ? params.itemId : "",
            command: typeof params.command === "string" ? params.command : null,
            cwd: typeof params.cwd === "string" ? params.cwd : null,
            reason: typeof params.reason === "string" ? params.reason : null,
            availableDecisions: Array.isArray(params.availableDecisions)
              ? (params.availableDecisions as string[])
              : null,
          };
          setAgentPendingApproval(agentId, approval);
          break;
        }

        case "item/fileChange/requestApproval": {
          if (rpcId == null) break;
          const approval: ApprovalRequest = {
            rpcId,
            type: "fileChange" as ApprovalRequestType,
            threadId: threadId!,
            turnId: typeof params.turnId === "string" ? params.turnId : "",
            itemId: typeof params.itemId === "string" ? params.itemId : "",
            reason: typeof params.reason === "string" ? params.reason : null,
          };
          setAgentPendingApproval(agentId, approval);
          break;
        }

        case "item/permissions/requestApproval": {
          if (rpcId == null) break;
          const approval: ApprovalRequest = {
            rpcId,
            type: "permissions" as ApprovalRequestType,
            threadId: threadId!,
            turnId: typeof params.turnId === "string" ? params.turnId : "",
            itemId: typeof params.itemId === "string" ? params.itemId : "",
            reason: typeof params.reason === "string" ? params.reason : null,
            permissions: params.permissions,
          };
          setAgentPendingApproval(agentId, approval);
          break;
        }

        case "serverRequest/resolved": {
          setAgentPendingApproval(agentId, null);
          break;
        }

        // ─── Legacy tool call events (fallback) ──────────────────

        case "item/toolCall/created":
        case "item/functionCall/created": {
          const callId = typeof params.callId === "string" ? params.callId
            : typeof params.id === "string" ? params.id
            : String(Date.now());
          const toolName = typeof params.name === "string" ? params.name
            : typeof params.tool === "string" ? params.tool
            : "tool";
          const { kind, label, detail } = classifyTool(toolName, params.input ?? params.arguments);
          addAgentActivity(agentId, {
            id: callId,
            kind,
            label,
            detail,
            status: "running",
            startedAt: Date.now(),
          });
          break;
        }

        case "item/toolCall/completed":
        case "item/functionCall/completed":
        case "item/toolCallOutput/created": {
          const callId = typeof params.callId === "string" ? params.callId
            : typeof params.id === "string" ? params.id
            : null;
          if (callId) {
            const agent = useThreadStore.getState().agents.find((a) => a.id === agentId);
            const act = agent?.activities?.find((a) => a.id === callId);
            updateAgentActivity(agentId, callId, {
              status: "done",
              durationMs: act ? Date.now() - act.startedAt : undefined,
            });
          }
          break;
        }

        // ─── Reasoning / thinking ────────────────────────────────

        case "item/reasoning":
        case "item/thinking":
        case "item/reasoning/textDelta":
        case "item/reasoning/summaryTextDelta": {
          const text = typeof params.text === "string" ? params.text
            : typeof params.content === "string" ? params.content
            : typeof params.delta === "string" ? params.delta : "";
          if (text.length > 0) {
            appendAgentThinkingDelta(agentId, text);
          }
          break;
        }

        default:
          break;
      }
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [
    appendAgentStreamingDelta,
    flushAgentStreamingBuffer,
    setAgentTurnInProgress,
    setAgentStatus,
    addAgentActivity,
    updateAgentActivity,
    appendAgentThinkingDelta,
    finalizeAgentThinking,
    clearAgentActivities,
    setAgentPendingApproval,
    updateAgentTitle,
    setAgentPlan,
    setAgentCurrentTurnId,
    addAgentModel,
  ]);

  useEffect(() => {
    const t = setTimeout(() => {
      rpcRequest<{ data?: Array<{ id: string; name: string; isAccessible?: boolean }> }>("app/list", {})
        .then((res) => {
          if (Array.isArray(res?.data)) {
            useAppListStore.getState().setApps(
              res.data.map((a) => ({
                id: a.id,
                name: a.name,
                isAccessible: a.isAccessible ?? false,
              })),
            );
          }
        })
        .catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, []);
}
