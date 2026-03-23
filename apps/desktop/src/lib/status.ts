import type { LucideIcon } from "lucide-react";
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleDot,
  Loader,
} from "lucide-react";
import type { Agent, AgentStatus } from "./stores/thread-store";

export const STATUS_CONFIG: Record<
  AgentStatus,
  { label: string; color: string; icon: LucideIcon; spin?: boolean }
> = {
  queued: {
    label: "Drafts",
    color: "var(--accent-grey)",
    icon: CircleDashed,
  },
  active: {
    label: "Running",
    color: "var(--text-links)",
    icon: Loader,
  },
  review: {
    label: "Review",
    color: "#F4B400",
    icon: CircleDot,
  },
  deployed: {
    label: "Done",
    color: "#5F6AD3",
    icon: CircleCheck,
  },
};

export const ATTENTION_COLOR = "#FF4700";

export function statusLabel(status: AgentStatus): string {
  return STATUS_CONFIG[status].label;
}

export function agentStatusLabel(agent: Pick<Agent, "status" | "blocked">): string {
  if (agent.blocked) return "Needs attention";
  return statusLabel(agent.status);
}

export function statusColor(agent: Pick<Agent, "status" | "blocked">): string {
  if (agent.blocked) return ATTENTION_COLOR;
  return STATUS_CONFIG[agent.status].color;
}

export function agentStatusVisual(agent: Pick<Agent, "status" | "blocked">): {
  label: string;
  color: string;
  icon: LucideIcon;
  spin?: boolean;
} {
  if (agent.blocked) {
    return {
      label: "Needs attention",
      color: ATTENTION_COLOR,
      icon: CircleAlert,
    };
  }
  return STATUS_CONFIG[agent.status];
}

export const BOARD_COLUMNS: AgentStatus[] = [
  "queued",
  "active",
  "review",
];
