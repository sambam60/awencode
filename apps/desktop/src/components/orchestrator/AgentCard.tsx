import { useState, useRef, useEffect } from "react";
import { Loader2, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { statusColor } from "@/lib/status";
import { useThreadStore } from "@/lib/stores/thread-store";
import { interruptTurn } from "@/lib/codex-turn";
import type { Agent } from "@/lib/stores/thread-store";

interface AgentCardProps {
  agent: Agent;
  selected: boolean;
  onOpenThread: (id: string) => void;
  onOpenDetails: (id: string) => void;
  compact?: boolean;
}

function lastAgentMessageContent(agent: Agent): string | undefined {
  for (let i = agent.messages.length - 1; i >= 0; i--) {
    const m = agent.messages[i];
    if (m?.role === "agent" && m.content.trim()) return m.content;
  }
  return undefined;
}

function snippetText(agent: Agent): string {
  const buf = agent.streamingBuffer?.trim();
  if (buf) return buf;
  const last = lastAgentMessageContent(agent);
  if (last) {
    const tail = last.length > 280 ? `…${last.slice(-280)}` : last;
    return tail;
  }
  return agent.lastAction;
}

export function AgentCard({ agent, selected, onOpenThread, onOpenDetails, compact }: AgentCardProps) {
  const [hovered, setHovered] = useState(false);
  const [stopHovered, setStopHovered] = useState(false);
  const snippetRef = useRef<HTMLDivElement>(null);
  const accent = statusColor(agent);

  const working = Boolean(agent.turnInProgress && agent.codexThreadId);
  const planLen = agent.planSteps?.length ?? 0;
  const showProgressBar =
    !compact && planLen > 0 && agent.status !== "queued" && agent.status !== "deployed";

  useEffect(() => {
    const el = snippetRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [agent.streamingBuffer, agent.messages]);

  const handleStop = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const tid = agent.codexThreadId;
    const turnId = agent.currentTurnId;
    if (!tid || !turnId) return;
    try {
      await interruptTurn(tid, turnId);
    } catch {
      return;
    }
    const {
      finalizeAgentThinking,
      flushAgentStreamingBuffer,
      setAgentTurnInProgress,
      setAgentStatus,
      setAgentCurrentTurnId,
    } = useThreadStore.getState();
    finalizeAgentThinking(agent.id);
    flushAgentStreamingBuffer(agent.id);
    setAgentTurnInProgress(agent.id, false);
    setAgentCurrentTurnId(agent.id, null);
    setAgentStatus(agent.id, "review");
  };

  const showHoverInfo = hovered && !working;

  return (
    <div
      onClick={() => onOpenThread(agent.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setStopHovered(false);
      }}
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
      {/* Working: info + spinner/stop; idle: info on hover only */}
      {working && (
        <div className="absolute top-2.5 right-2.5 z-[1] flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetails(agent.id);
            }}
            className="w-5 h-5 flex items-center justify-center rounded text-[11px] font-medium text-text-tertiary hover:text-text-primary hover:bg-bg-secondary border border-transparent hover:border-border transition-colors duration-120 cursor-pointer"
            title="View details"
          >
            i
          </button>
          <button
            type="button"
            onClick={handleStop}
            onMouseEnter={() => setStopHovered(true)}
            onMouseLeave={() => setStopHovered(false)}
            className={cn(
              "w-5 h-5 flex items-center justify-center rounded transition-colors duration-120 cursor-pointer",
              stopHovered ? "text-accent-red hover:bg-bg-secondary" : "text-text-tertiary hover:text-text-secondary",
            )}
            title={stopHovered ? "Stop agent" : "Agent working — hover to stop"}
          >
            {stopHovered ? (
              <Square size={12} fill="currentColor" strokeWidth={0} />
            ) : (
              <Loader2 size={14} className="animate-spin" strokeWidth={2} />
            )}
          </button>
        </div>
      )}
      {showHoverInfo && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetails(agent.id);
          }}
          className="absolute top-2.5 right-2.5 w-5 h-5 flex items-center justify-center rounded text-[11px] font-medium text-text-tertiary hover:text-text-primary hover:bg-bg-secondary border border-transparent hover:border-border transition-colors duration-120 cursor-pointer z-[1]"
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

      <div
        className={cn(
          "flex justify-between items-start mb-1 gap-2",
          (working || showHoverInfo) && !compact && "pr-14",
        )}
      >
        <div
          className={cn(
            "font-medium text-text-primary leading-tight flex-1 min-w-0",
            compact ? "text-[12px]" : "text-[13px]",
          )}
        >
          {agent.title}
        </div>
        {agent.pr && !compact && (
          <span className="font-mono text-[10px] text-text-tertiary whitespace-nowrap shrink-0">
            {agent.pr}
          </span>
        )}
      </div>

      {!compact && (
        <div
          className="relative mb-2.5 rounded-md overflow-hidden bg-bg-secondary/40"
          style={{
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0%, black 22%, black 78%, transparent 100%)",
            maskImage:
              "linear-gradient(to bottom, transparent 0%, black 22%, black 78%, transparent 100%)",
          }}
        >
          <div
            ref={snippetRef}
            className="hide-scrollbar max-h-[3.9em] overflow-y-auto overflow-x-hidden px-2 py-1.5 text-[12px] leading-snug text-text-secondary whitespace-pre-wrap break-words"
          >
            {snippetText(agent)}
          </div>
        </div>
      )}

      {showProgressBar && (
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
