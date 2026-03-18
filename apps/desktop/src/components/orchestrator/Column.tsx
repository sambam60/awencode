import { AgentCard } from "./AgentCard";
import type { Agent, AgentStatus } from "@/lib/stores/thread-store";
import { STATUS_CONFIG } from "@/lib/status";

interface ColumnProps {
  status: AgentStatus;
  agents: Agent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isLast?: boolean;
}

export function Column({
  status,
  agents,
  selectedId,
  onSelect,
  isLast,
}: ColumnProps) {
  const config = STATUS_CONFIG[status];

  return (
    <div
      className="flex-1 min-w-[200px]"
      style={{
        paddingRight: isLast ? 0 : 24,
        borderRight: isLast ? "none" : "1px solid var(--border-light)",
        marginRight: isLast ? 0 : 24,
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <span
          className="inline-block w-[5px] h-[5px] rounded-full"
          style={{ background: config.color }}
        />
        <span className="label-mono">{config.label}</span>
        <span className="font-mono text-[10px] text-text-faint">
          {agents.length}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {agents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            selected={selectedId === agent.id}
            onOpenThread={onSelect}
            onOpenDetails={onSelect}
          />
        ))}
        {agents.length === 0 && (
          <div className="p-6 border border-dashed border-border-light rounded-lg text-center font-mono text-xs text-text-faint">
            Empty
          </div>
        )}
      </div>
    </div>
  );
}
