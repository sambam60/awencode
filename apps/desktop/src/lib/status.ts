import type { Agent, AgentStatus } from "./stores/thread-store";

export const STATUS_CONFIG: Record<
  AgentStatus,
  { label: string; color: string }
> = {
  queued: { label: "Queue", color: "var(--accent-grey)" },
  active: { label: "Active", color: "var(--accent-blue)" },
  review: { label: "Review", color: "var(--accent-amber)" },
  deployed: { label: "Deployed", color: "var(--accent-green)" },
};

export function statusColor(agent: Agent): string {
  if (agent.blocked) return "var(--accent-red)";
  return STATUS_CONFIG[agent.status].color;
}

export const BOARD_COLUMNS: AgentStatus[] = [
  "queued",
  "active",
  "review",
];
