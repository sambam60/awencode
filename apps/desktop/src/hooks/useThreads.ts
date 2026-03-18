import { useEffect } from "react";
import { useThreadStore } from "@/lib/stores/thread-store";
import { MOCK_AGENTS } from "@/lib/mock-data";

export function useThreads() {
  const agents = useThreadStore((s) => s.agents);
  const setAgents = useThreadStore((s) => s.setAgents);

  useEffect(() => {
    if (agents.length === 0) {
      setAgents(MOCK_AGENTS);
    }
  }, [agents.length, setAgents]);

  return {
    agents,
    activeAgents: agents.filter((a) => a.status === "active"),
    reviewAgents: agents.filter((a) => a.status === "review"),
    queuedAgents: agents.filter((a) => a.status === "queued"),
    deployedAgents: agents.filter((a) => a.status === "deployed"),
    blockedAgents: agents.filter((a) => a.blocked),
  };
}
