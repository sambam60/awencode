import { useEffect, useRef } from "react";
import {
  refreshLinkedLinearIssuesForAgent,
  syncLinkedLinearIssuesForAgentStatus,
} from "@/lib/linear-thread-tools";
import { useSettingsStore } from "@/lib/stores/settings-store";
import { useThreadStore } from "@/lib/stores/thread-store";

function linkedIssueSignature(issueIds: string[]): string {
  return issueIds.join("|");
}

function linkedAgentSignature(
  agents: Array<{ id: string; linkedLinearIssues?: Array<{ identifier: string }> }>,
): string {
  return agents
    .map((agent) => `${agent.id}:${linkedIssueSignature((agent.linkedLinearIssues ?? []).map((issue) => issue.identifier).sort())}`)
    .join("||");
}

export function useLinearIssueStatusSync() {
  const agents = useThreadStore((s) => s.agents);
  const linearAutoSyncEnabled = useSettingsStore((s) => s.linearAutoSyncEnabled);
  const previousRef = useRef<Record<string, { status: string; issues: string }>>({});
  const refreshInFlightRef = useRef<Record<string, boolean>>({});
  const agentIssuesSignature = linkedAgentSignature(agents);
  const hasLinkedAgents = agents.some((agent) => (agent.linkedLinearIssues ?? []).length > 0);

  useEffect(() => {
    if (!linearAutoSyncEnabled) {
      previousRef.current = Object.fromEntries(
        agents.map((agent) => [
          agent.id,
          {
            status: agent.status,
            issues: linkedIssueSignature((agent.linkedLinearIssues ?? []).map((issue) => issue.identifier).sort()),
          },
        ]),
      );
      return;
    }

    const previous = previousRef.current;
    const next: Record<string, { status: string; issues: string }> = {};

    for (const agent of agents) {
      const issueIds = (agent.linkedLinearIssues ?? []).map((issue) => issue.identifier).sort();
      const issues = linkedIssueSignature(issueIds);
      next[agent.id] = { status: agent.status, issues };

      if (issueIds.length === 0) {
        continue;
      }

      const prior = previous[agent.id];
      if (!prior || prior.status !== agent.status || prior.issues !== issues) {
        void syncLinkedLinearIssuesForAgentStatus(agent.id, agent.status).catch(() => {});
      }
    }

    previousRef.current = next;
  }, [agents, linearAutoSyncEnabled]);

  useEffect(() => {
    if (!linearAutoSyncEnabled) return;
    if (!hasLinkedAgents) return;

    let cancelled = false;

    const refreshAll = () => {
      if (cancelled || document.visibilityState === "hidden") return;
      for (const agent of useThreadStore.getState().agents) {
        if ((agent.linkedLinearIssues ?? []).length === 0) continue;
        if (refreshInFlightRef.current[agent.id]) continue;
        refreshInFlightRef.current[agent.id] = true;
        void refreshLinkedLinearIssuesForAgent(agent.id)
          .catch((error) => {
            console.warn("linear linked issue refresh failed", error);
          })
          .finally(() => {
            delete refreshInFlightRef.current[agent.id];
          });
      }
    };

    refreshAll();
    const intervalId = window.setInterval(refreshAll, 15000);
    const onFocus = () => refreshAll();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshAll();
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [agentIssuesSignature, hasLinkedAgents, linearAutoSyncEnabled]);
}
