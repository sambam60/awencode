import { useState, useRef, useEffect } from "react";
import { Box, Clock, FileDiff, GitBranch, Loader2, Play, Square } from "lucide-react";
import {
  getAgentContextPercent,
  getAgentDiffStats,
  getAgentTimeLabel,
  getAgentTokenLabel,
} from "@/lib/agent-metrics";
import { cn } from "@/lib/utils";
import { ATTENTION_COLOR, agentStatusVisual, statusColor } from "@/lib/status";
import { useThreadStore } from "@/lib/stores/thread-store";
import { interruptTurn } from "@/lib/codex-turn";
import { sendChatTurn } from "@/lib/send-chat-turn";
import { useChatUiStore } from "@/lib/stores/chat-ui-store";
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

function snippetText(agent: Agent, queuedDraft: string): string {
  const buf = agent.streamingBuffer?.trim();
  if (buf) return buf;
  const last = lastAgentMessageContent(agent);
  if (last) {
    const tail = last.length > 280 ? `…${last.slice(-280)}` : last;
    return tail;
  }
  const d = queuedDraft.trim();
  if (agent.status === "queued" && d.length > 0) {
    return d.length > 280 ? `${d.slice(0, 277)}…` : d;
  }
  return agent.lastAction;
}

function modelSummaryForCard(models: string[]): string {
  if (models.length <= 2) return models.join(", ");
  return `${models.slice(0, 2).join(", ")} +${models.length - 2}`;
}

/** SVG ring: arc length tracks `percent` (null = track empty). */
function ContextUsageRing({ percent }: { percent: number | null }) {
  const r = 4;
  const c = 2 * Math.PI * r;
  const cx = 6;
  const cy = 6;
  const p = percent == null ? 0 : Math.min(100, Math.max(0, percent));
  const offset = c - (p / 100) * c;
  const empty = percent == null;
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 12 12"
      className="shrink-0"
      aria-hidden
    >
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        className="stroke-border-light"
        strokeWidth={1.25}
      />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        className="stroke-text-primary"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={empty ? c : offset}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
    </svg>
  );
}

function MetaItem({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-1.5 min-w-0 max-w-[min(100%,11rem)]">
      <span className="shrink-0 w-3 flex justify-center text-text-tertiary [&>svg]:block">
        {icon}
      </span>
      <span className="min-w-0 text-[11px] text-text-secondary leading-snug truncate font-sans">
        {children}
      </span>
    </div>
  );
}

export function AgentCard({ agent, selected, onOpenThread, onOpenDetails, compact }: AgentCardProps) {
  const [hovered, setHovered] = useState(false);
  const [stopHovered, setStopHovered] = useState(false);
  const [playSending, setPlaySending] = useState(false);
  const snippetRef = useRef<HTMLDivElement>(null);
  const accent = statusColor(agent);
  const statusVisual = agentStatusVisual(agent);
  const StatusIcon = statusVisual.icon;
  const composeDraft = useChatUiStore((s) => s.composeDraftByAgentId[agent.id] ?? "");

  const working = Boolean(agent.turnInProgress && agent.codexThreadId);
  const planLen = agent.planSteps?.length ?? 0;
  const showProgressBar =
    !compact && planLen > 0 && agent.status !== "queued" && agent.status !== "deployed";
  const showAttentionStrip = agent.status === "active" && agent.blocked;

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
  const showQueuedStrip = agent.status === "queued" && !working;
  const canPlayQueued =
    composeDraft.trim().length > 0 && !playSending;
  const contextPct = getAgentContextPercent(agent);
  const diffStats = getAgentDiffStats(agent);

  const handlePlayQueued = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canPlayQueued) return;
    const text = composeDraft.trim();
    setPlaySending(true);
    try {
      await sendChatTurn(agent.id, text, []);
    } finally {
      setPlaySending(false);
    }
  };

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
      {showAttentionStrip && (
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
          <span className="flex h-5 w-5 items-center justify-center" title={statusVisual.label}>
            <StatusIcon
              size={14}
              strokeWidth={2}
              className={cn("shrink-0", statusVisual.spin && "animate-spin")}
              style={{ color: statusVisual.color }}
            />
          </span>
        </div>
      )}
      {working && !showAttentionStrip && (
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
              <StatusIcon
                size={14}
                strokeWidth={2}
                className="shrink-0 animate-spin"
                style={{ color: statusVisual.color }}
              />
            )}
          </button>
        </div>
      )}
      {showQueuedStrip && (
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
            onClick={handlePlayQueued}
            disabled={!canPlayQueued}
            className={cn(
              "w-5 h-5 flex items-center justify-center rounded transition-colors duration-120",
              canPlayQueued
                ? "text-text-primary hover:bg-bg-secondary border border-border-default hover:border-border-focus cursor-pointer"
                : "text-text-faint cursor-not-allowed opacity-50",
            )}
            title={canPlayQueued ? "Send prompt and start" : "Type a prompt in chat first"}
          >
            {playSending ? (
              <Loader2 size={12} className="animate-spin shrink-0" strokeWidth={2} />
            ) : (
              <Play size={12} strokeWidth={2} className="shrink-0" />
            )}
          </button>
        </div>
      )}
      {showHoverInfo && !showQueuedStrip && !showAttentionStrip && (
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
          style={{ color: ATTENTION_COLOR }}
        >
          Needs attention
        </div>
      )}

      <div
        className={cn(
          "flex justify-between items-start mb-1 gap-2",
          /* Reserve top-right chrome width always so title/snippet don’t reflow on hover (idle “i”). */
          showQueuedStrip ? "pr-[52px]" : "pr-14",
        )}
      >
        <div
          className={cn(
            "font-medium text-text-primary leading-snug flex-1 min-w-0",
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
            {snippetText(agent, composeDraft)}
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

      {compact ? (
        <div
          className={cn(
            "flex justify-between items-center text-text-faint",
            "text-[9.5px]",
          )}
        >
          <span className="font-mono leading-snug truncate">
            {agent.branch}
            {(agent.modelsUsed?.length ?? 0) > 0 && (
              <>
                {" • "}
                {modelSummaryForCard(agent.modelsUsed ?? [])}
              </>
            )}
          </span>
        </div>
      ) : (
        <div className="flex flex-row flex-wrap items-center gap-x-2.5 gap-y-1.5 w-full text-text-secondary">
          <MetaItem icon={<GitBranch size={12} strokeWidth={1.75} />}>
            {agent.branch.trim() ? agent.branch : "—"}
          </MetaItem>
          <MetaItem icon={<Box size={12} strokeWidth={1.75} />}>
            {(agent.modelsUsed?.length ?? 0) > 0
              ? modelSummaryForCard(agent.modelsUsed ?? [])
              : "—"}
          </MetaItem>
          <div className="inline-flex items-center gap-1.5 min-w-0 max-w-[min(100%,11rem)]">
            <ContextUsageRing percent={contextPct} />
            <span className="min-w-0 text-[11px] text-text-secondary leading-snug truncate font-sans">
              {getAgentTokenLabel(agent)}
            </span>
          </div>
          <MetaItem icon={<Clock size={12} strokeWidth={1.75} />}>
            {getAgentTimeLabel(agent)}
          </MetaItem>
          <MetaItem icon={<FileDiff size={12} strokeWidth={1.75} />}>
            {!diffStats ? (
              "—"
            ) : diffStats.additions > 0 || diffStats.deletions > 0 ? (
              <span className="font-mono text-[11px] leading-snug">
                <span className="text-accent-green">+{diffStats.additions}</span>
                <span className="text-text-tertiary"> </span>
                <span className="text-accent-red">-{diffStats.deletions}</span>
              </span>
            ) : (
              `${diffStats.files.length} file${diffStats.files.length === 1 ? "" : "s"}`
            )}
          </MetaItem>
        </div>
      )}
    </div>
  );
}
