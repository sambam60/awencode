import { useEffect } from "react";
import { onNotification, rpcRequest } from "@/lib/rpc-client";
import { useThreadStore } from "@/lib/stores/thread-store";
import { useAppListStore } from "@/lib/stores/app-list-store";

/** Parsed codex notification (method + params). */
interface CodexNotification {
  method: string;
  params?: {
    threadId?: string;
    turnId?: string;
    delta?: string;
    data?: Array<{ id: string; name: string; isAccessible?: boolean }>;
    [k: string]: unknown;
  };
}

function findAgentIdByCodexThreadId(threadId: string): string | null {
  const agents = useThreadStore.getState().agents;
  const agent = agents.find((a) => a.codexThreadId === threadId);
  return agent?.id ?? null;
}

export function useCodexNotifications() {
  const appendAgentStreamingDelta = useThreadStore((s) => s.appendAgentStreamingDelta);
  const flushAgentStreamingBuffer = useThreadStore((s) => s.flushAgentStreamingBuffer);
  const setAgentTurnInProgress = useThreadStore((s) => s.setAgentTurnInProgress);
  const setAgentStatus = useThreadStore((s) => s.setAgentStatus);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    onNotification((payload: string) => {
      let msg: CodexNotification;
      try {
        msg = JSON.parse(payload) as CodexNotification;
      } catch {
        return;
      }
      const method = msg.method;
      const params = msg.params ?? {};
      const threadId = params.threadId;

      if (method === "turn/started" && threadId) {
        const agentId = findAgentIdByCodexThreadId(threadId);
        if (agentId) {
          setAgentTurnInProgress(agentId, true);
          setAgentStatus(agentId, "active");
        }
      } else if (method === "item/agentMessage/delta" && threadId && typeof params.delta === "string") {
        const agentId = findAgentIdByCodexThreadId(threadId);
        if (agentId) {
          appendAgentStreamingDelta(agentId, params.delta);
        }
      } else if (method === "turn/completed" && threadId) {
        const agentId = findAgentIdByCodexThreadId(threadId);
        if (agentId) {
          flushAgentStreamingBuffer(agentId);
          setAgentTurnInProgress(agentId, false);
          setAgentStatus(agentId, "review");
        }
      } else if (method === "app/list/updated" && Array.isArray(params.data)) {
        useAppListStore.getState().setApps(
          params.data.map((a) => ({
            id: a.id,
            name: a.name,
            isAccessible: a.isAccessible ?? false,
          })),
        );
      }
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [appendAgentStreamingDelta, flushAgentStreamingBuffer, setAgentTurnInProgress, setAgentStatus]);

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
