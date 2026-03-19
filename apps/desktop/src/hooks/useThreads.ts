import { useThreadStore } from "@/lib/stores/thread-store";

export function useThreads() {
  const agents = useThreadStore((s) => s.agents);

  return {
    agents,
    activeAgents: agents.filter((a) => a.status === "active"),
    reviewAgents: agents.filter((a) => a.status === "review"),
    queuedAgents: agents.filter((a) => a.status === "queued"),
    deployedAgents: agents.filter((a) => a.status === "deployed"),
    blockedAgents: agents.filter((a) => a.blocked),
  };
}
