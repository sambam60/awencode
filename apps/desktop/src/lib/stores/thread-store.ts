import { create } from "zustand";

export type AgentStatus = "queued" | "active" | "review" | "deployed";

export interface AgentMessage {
  role: "you" | "agent";
  content: string;
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
  blocked: boolean;
  blockReason?: string;
  deployedAt?: string;
}

interface ThreadState {
  agents: Agent[];
  selectedAgentId: string | null;
  selectAgent: (id: string | null) => void;
  setAgents: (agents: Agent[]) => void;
  addAgent: (agent: Agent) => void;
}

export const useThreadStore = create<ThreadState>((set) => ({
  agents: [],
  selectedAgentId: null,
  selectAgent: (id) => set({ selectedAgentId: id }),
  setAgents: (agents) => set({ agents }),
  addAgent: (agent) =>
    set((s) => ({ agents: [...s.agents, agent], selectedAgentId: agent.id })),
}));
