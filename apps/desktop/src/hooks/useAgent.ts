import { useThreadStore } from "@/lib/stores/thread-store";

export function useAgent(agentId: string | null) {
  const agents = useThreadStore((s) => s.agents);
  const agent = agentId ? agents.find((a) => a.id === agentId) ?? null : null;

  return {
    agent,
    isBlocked: agent?.blocked ?? false,
    isActive: agent?.status === "active",
    isReview: agent?.status === "review",
    isDeployed: agent?.status === "deployed",
    isQueued: agent?.status === "queued",
  };
}
