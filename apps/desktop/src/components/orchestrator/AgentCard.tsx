import { useState } from "react";
import { cn } from "@/lib/utils";
import { statusColor } from "@/lib/status";
import type { Agent } from "@/lib/stores/thread-store";

interface AgentCardProps {
  agent: Agent;
  selected: boolean;
  onOpenThread: (id: string) => void;
  onOpenDetails: (id: string) => void;
  compact?: boolean;
}

export function AgentCard({ agent, selected, onOpenThread, onOpenDetails, compact }: AgentCardProps) {
  const [hovered, setHovered] = useState(false);
  const accent = statusColor(agent);

  return (
    <div
      onClick={() => onOpenThread(agent.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "rounded-lg cursor-pointer transition-all duration-120 relative",
        "bg-bg-card border border-border",
        selected && "border-border-focus",
        hovered && !selected && "border-border-focus shadow-level-1",
      )}
      style={{
        padding: compact ? "10px 12px 9px" : "14px 16px 12px",
      }}
    >
      {/* Info button — visible on hover, opens detail panel */}
      {hovered && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetails(agent.id);
          }}
          className="absolute top-2.5 right-2.5 w-5 h-5 flex items-center justify-center rounded text-[11px] font-medium text-text-tertiary hover:text-text-primary hover:bg-bg-secondary border border-transparent hover:border-border transition-colors duration-120 cursor-pointer"
          title="View details"
        >
          i
        </button>
      )}

      {agent.blocked && (
        <div
          className="font-mono text-[9.5px] font-semibold uppercase tracking-label-wide mb-1.5"
          style={{ color: "var(--accent-red)" }}
        >
          Blocked
        </div>
      )}

      <div className="flex justify-between items-start mb-1 gap-2">
        <div
          className={cn(
            "font-medium text-text-primary leading-tight flex-1",
            compact ? "text-[12px]" : "text-[13px]",
          )}
        >
          {agent.title}
        </div>
        {agent.pr && !compact && (
          <span className="font-mono text-[10px] text-text-tertiary whitespace-nowrap">
            {agent.pr}
          </span>
        )}
      </div>

      {!compact && (
        <div
          className={cn(
            "text-[12.5px] leading-snug mb-2.5",
            agent.blocked ? "text-accent-red" : "text-text-secondary",
          )}
        >
          {agent.blocked ? agent.blockReason : agent.lastAction}
        </div>
      )}

      {agent.status !== "queued" && agent.status !== "deployed" && !compact && (
        <div className="h-[2px] bg-border-light rounded-sm mb-2.5 overflow-hidden">
          <div
            className="h-full rounded-sm transition-all duration-300"
            style={{
              width: `${agent.progress}%`,
              background: accent,
            }}
          />
        </div>
      )}

      <div
        className={cn(
          "flex justify-between items-center text-text-faint",
          compact ? "text-[9.5px]" : "text-[10.5px]",
        )}
      >
        <span className="font-mono truncate">{agent.branch}</span>
        {!compact && (
          <div className="flex gap-2.5 shrink-0 ml-2 font-sans">
            {agent.time !== "—" && <span>{agent.time}</span>}
            {agent.files.length > 0 && <span>{agent.files.length} files</span>}
          </div>
        )}
      </div>
    </div>
  );
}
