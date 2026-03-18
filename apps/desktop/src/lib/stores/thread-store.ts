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
  /** Codex app-server thread id when this agent is backed by a real thread. */
  codexThreadId?: string | null;
  /** Accumulated streaming delta for the current assistant message. */
  streamingBuffer?: string;
  /** True while a turn is in progress (waiting for turn/completed). */
  turnInProgress?: boolean;
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
}

export const useThreadStore = create<ThreadState>((set) => ({
  agents: [],
  selectedAgentId: null,
  selectAgent: (id) => set({ selectedAgentId: id }),
  setAgents: (agents) => set({ agents }),
  addAgent: (agent) =>
    set((s) => ({ agents: [...s.agents, agent], selectedAgentId: agent.id })),

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
}));
