import { useState, useRef, useCallback, useEffect } from "react";
import {
  Box,
  Brain,
  Clock,
  FileDiff,
  FileEdit,
  FileText,
  GitBranch,
  Loader2,
  Play,
  Search,
  Square,
  Terminal,
  Wrench,
} from "lucide-react";
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
import { useBoardUiStore } from "@/lib/stores/board-ui-store";
import { getModelDisplayName } from "@/lib/stores/settings-store";
import type { Agent, AgentActivity } from "@/lib/stores/thread-store";
import { STREAMING_THINKING_ACTIVITY_ID } from "@/lib/stores/thread-store";

const CARD_MIN_H = 38;
const CARD_MAX_H = 420;
const CARD_COLLAPSED_THRESHOLD = 90;
const CARD_SNIPPET_THRESHOLD = 130;
const CARD_EXPANDED_THRESHOLD = 220;

const SNAP_POINTS = [CARD_MIN_H, CARD_COLLAPSED_THRESHOLD, CARD_SNIPPET_THRESHOLD, CARD_EXPANDED_THRESHOLD, CARD_MAX_H];
const SNAP_RANGE = 30;

function snapHeight(raw: number): number {
  for (const pt of SNAP_POINTS) {
    if (Math.abs(raw - pt) <= SNAP_RANGE) return pt;
  }
  return raw;
}

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
  const labels = models.map((model) => getModelDisplayName(model));
  if (labels.length <= 2) return labels.join(", ");
  return `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
}

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

const ACTIVITY_ICONS: Record<string, typeof Terminal> = {
  shell: Terminal,
  read_file: FileText,
  write_file: FileEdit,
  search: Search,
  tool: Wrench,
  log: Brain,
};

function deduplicateActivities(activities: AgentActivity[]): AgentActivity[] {
  const seen = new Set<string>();
  const result: AgentActivity[] = [];
  for (let i = activities.length - 1; i >= 0; i--) {
    const act = activities[i]!;
    const isThinking =
      act.id === STREAMING_THINKING_ACTIVITY_ID ||
      act.label === "thinking" ||
      act.id.startsWith("thinking-");
    const key = isThinking ? "__thinking__" : act.id;
    if (seen.has(key)) continue;
    seen.add(key);
    result.unshift(act);
  }
  return result;
}

function isThinkingActivity(act: AgentActivity): boolean {
  return (
    act.id === STREAMING_THINKING_ACTIVITY_ID ||
    act.label === "thinking" ||
    act.id.startsWith("thinking-")
  );
}

function activityDurationSeconds(activity: AgentActivity): number | undefined {
  if (activity.status === "running" || activity.durationMs == null) {
    return undefined;
  }
  return Math.max(1, Math.ceil(activity.durationMs / 1000));
}

function activityLabel(activity: AgentActivity, thinking: boolean, running: boolean): string {
  if (thinking && !running) {
    const durationSec = activityDurationSeconds(activity);
    return durationSec !== undefined
      ? `Thought for ${durationSec}s`
      : "Thought for a few seconds";
  }
  if (thinking) return "Thinking";
  if (activity.kind === "shell" && activity.shellCommand) return activity.shellCommand;
  return activity.label;
}

function collapsedActivitySummary(activity: AgentActivity): string {
  const thinking = isThinkingActivity(activity);
  const running = activity.status === "running";

  if (thinking && !running) {
    const durationSec = activityDurationSeconds(activity);
    return durationSec !== undefined ? `Thought ${durationSec}s` : "Thought briefly";
  }

  return activityLabel(activity, thinking, running);
}

function activityDetailText(activity: AgentActivity, thinking: boolean): string | null {
  if (thinking) {
    const trace = activity.detail?.trim();
    return trace || null;
  }
  if (activity.kind === "shell") {
    const output = activity.shellCommand ? (activity.detail ?? "").trim() : "";
    return output || null;
  }
  const detail = activity.detail?.trim();
  return detail || null;
}

function ActivityLine({ activity, showDetail }: { activity: AgentActivity; showDetail: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const thinking = isThinkingActivity(activity);
  const Icon = thinking ? Brain : (ACTIVITY_ICONS[activity.kind] ?? Wrench);
  const running = activity.status === "running";
  const errored = activity.status === "error";

  const label = activityLabel(activity, thinking, running);
  const detail = showDetail ? activityDetailText(activity, thinking) : null;
  const canExpand = detail !== null;

  return (
    <div
      className={cn("min-w-0 py-0.5", canExpand && "cursor-pointer")}
      onClick={canExpand ? (e) => { e.stopPropagation(); setExpanded((v) => !v); } : undefined}
    >
      <div className="flex items-start gap-1.5 min-w-0 sticky top-0 z-[1] bg-bg-card">
        <span className="shrink-0 mt-[1px]">
          <Icon
            size={10}
            strokeWidth={1.75}
            className={cn(
              running ? "text-text-secondary" : errored ? "text-accent-red" : "text-text-faint",
            )}
          />
        </span>
        <div className="flex-1 min-w-0 flex items-baseline gap-1">
          {running ? (
            <span
              className="min-w-0 text-[10.5px] leading-tight truncate font-sans capitalize text-text-secondary inline-block bg-[length:300%_100%] bg-no-repeat animate-shimmer-ai [background-clip:text] [-webkit-background-clip:text] [-webkit-text-fill-color:transparent]"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, currentColor 25%, color-mix(in srgb, currentColor 30%, transparent) 50%, currentColor 75%)",
              }}
            >
              {label}
            </span>
          ) : (
            <span
              className={cn(
                "min-w-0 text-[10.5px] leading-tight truncate font-sans capitalize",
                errored ? "text-accent-red" : "text-text-faint",
              )}
            >
              {label}
            </span>
          )}
          {canExpand && (
            <span className="shrink-0 text-[9px] text-text-faint select-none">
              {expanded ? "▾" : "▸"}
            </span>
          )}
        </div>
      </div>
      {expanded && detail && (
        <div
          className="mt-1 ml-[14px] rounded bg-bg-secondary/60 px-2 py-1.5 max-h-[8em] overflow-y-auto hide-scrollbar"
          onWheel={(e) => {
            const el = e.currentTarget;
            const atTop = el.scrollTop === 0 && e.deltaY < 0;
            const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1 && e.deltaY > 0;
            if (!atTop && !atBottom) e.stopPropagation();
          }}
        >
          <pre className="text-[10px] leading-snug text-text-tertiary whitespace-pre-wrap break-words font-mono m-0">
            {detail.length > 2000 ? `${detail.slice(0, 2000)}…` : detail}
          </pre>
        </div>
      )}
    </div>
  );
}

function useCardResize(agentId: string) {
  const setCardHeight = useBoardUiStore((s) => s.setCardHeight);
  const resizing = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);
  const didDrag = useRef(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      resizing.current = true;
      didDrag.current = false;
      startY.current = e.clientY;
      const card = (e.target as HTMLElement).closest("[data-agent-card]") as HTMLElement | null;
      startH.current = card?.getBoundingClientRect().height ?? 120;

      const onMove = (ev: PointerEvent) => {
        if (!resizing.current) return;
        const delta = ev.clientY - startY.current;
        if (Math.abs(delta) > 3) didDrag.current = true;
        const raw = Math.min(CARD_MAX_H, Math.max(CARD_MIN_H, startH.current + delta));
        setCardHeight(agentId, ev.shiftKey ? raw : snapHeight(raw));
      };
      const onUp = (ev: PointerEvent) => {
        resizing.current = false;
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        if (!ev.shiftKey) {
          const cur = useBoardUiStore.getState().cardHeights[agentId];
          if (cur != null) setCardHeight(agentId, snapHeight(cur));
        }
      };

      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [agentId, setCardHeight],
  );

  const resetHeight = useCallback(() => {
    setCardHeight(agentId, null);
  }, [agentId, setCardHeight]);

  return { onPointerDown, resetHeight, didDrag };
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
  const cardHeight = useBoardUiStore((s) => s.cardHeights[agent.id] ?? null);
  const { onPointerDown: onResizePointerDown, resetHeight, didDrag } = useCardResize(agent.id);

  const isCollapsed = cardHeight !== null && cardHeight < CARD_COLLAPSED_THRESHOLD;
  const showSnippet = cardHeight === null || cardHeight >= CARD_SNIPPET_THRESHOLD;
  const isExpanded = cardHeight !== null && cardHeight >= CARD_EXPANDED_THRESHOLD;
  const showMeta = !isCollapsed;

  useEffect(() => {
    const el = snippetRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [agent.streamingBuffer, agent.messages]);

  const working = Boolean(agent.turnInProgress && agent.codexThreadId);
  const planLen = agent.planSteps?.length ?? 0;
  const showProgressBar =
    !isCollapsed && !compact && planLen > 0 && agent.status !== "queued" && agent.status !== "deployed";
  const showAttentionStrip = agent.status === "active" && agent.blocked;

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
      finalizeRunningAgentActivities,
      flushAgentStreamingBuffer,
      setAgentTurnInProgress,
      setAgentStatus,
      setAgentCurrentTurnId,
    } = useThreadStore.getState();
    finalizeAgentThinking(agent.id);
    finalizeRunningAgentActivities(agent.id);
    flushAgentStreamingBuffer(agent.id);
    setAgentTurnInProgress(agent.id, false);
    setAgentCurrentTurnId(agent.id, null);
    setAgentStatus(agent.id, "review");
  };

  const showHoverInfo = hovered && !working;
  const showQueuedStrip = agent.status === "queued" && !working;
  const canPlayQueued = composeDraft.trim().length > 0 && !playSending;
  const contextPct = getAgentContextPercent(agent);
  const diffStats = getAgentDiffStats(agent);
  const currentModelLabel = agent.selectedModelId
    ? getModelDisplayName(agent.selectedModelId)
    : null;

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

  const handleCardClick = useCallback(() => {
    if (didDrag.current) {
      didDrag.current = false;
      return;
    }
    onOpenThread(agent.id);
  }, [agent.id, didDrag, onOpenThread]);

  const recentActivities = deduplicateActivities((agent.activities ?? []).slice(-8));
  const showActivities = isExpanded && recentActivities.length > 0;
  const hasResizedHeight = cardHeight !== null;

  const latestActivity = (agent.activities ?? []).length > 0
    ? (agent.activities ?? [])[(agent.activities ?? []).length - 1]
    : null;
  const collapsedActivityLabel = latestActivity
    ? collapsedActivitySummary(latestActivity)
    : null;

  return (
    <div
      data-agent-card
      onClick={handleCardClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setStopHovered(false);
      }}
      className={cn(
        "rounded-lg cursor-pointer transition-[border-color,box-shadow] duration-120 relative group/card",
        "bg-bg-card border border-border overflow-hidden",
        selected && "border-border-focus",
        hovered && !selected && "border-border-focus shadow-level-1",
      )}
      style={{
        ...(hasResizedHeight ? { height: cardHeight } : {}),
        minHeight: CARD_MIN_H,
        maxHeight: CARD_MAX_H,
      }}
    >
      {/* Card interior with padding — flex column that fills the card height */}
      <div
        className="flex flex-col h-full"
        style={{
          padding: isCollapsed ? "8px 12px" : compact ? "10px 12px 9px" : "14px 16px 12px",
        }}
      >
        {/* Top-right chrome (absolutely positioned relative to card) */}
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

        {/* ── Top: attention badge ── */}
        {agent.blocked && !isCollapsed && (
          <div
            className="font-mono text-[9.5px] font-semibold uppercase tracking-label-wide mb-1.5 shrink-0"
            style={{ color: ATTENTION_COLOR }}
          >
            Needs attention
          </div>
        )}

        {/* ── Title row — always visible ── */}
        <div
          className={cn(
            "flex gap-2 shrink-0",
            isCollapsed ? "items-center" : "items-start mb-1",
            showQueuedStrip ? "pr-[52px]" : "pr-14",
          )}
        >
          <div
            className={cn(
              "font-medium text-text-primary leading-snug min-w-0 truncate",
              isCollapsed ? "text-[12px] flex-1" : "flex-1 text-[13px]",
              compact && !isCollapsed && "text-[12px]",
            )}
            title={agent.title}
          >
            {agent.title}
          </div>
          {isCollapsed && collapsedActivityLabel && (
            <span
              className="min-w-0 max-w-[60%] shrink text-[10.5px] leading-tight truncate font-sans text-text-faint text-right"
              title={collapsedActivityLabel}
            >
              {collapsedActivityLabel}
            </span>
          )}
          {agent.pr && !compact && !isCollapsed && (
            <span className="font-mono text-[10px] text-text-tertiary whitespace-nowrap shrink-0">
              {agent.pr}
            </span>
          )}
        </div>

        {/* ── Middle: flexible area (snippet + activities) — absorbs available space ── */}
        {showSnippet && !compact && !isCollapsed && (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Snippet — grows with card when user-resized, fixed max-h at default */}
            <div
              className={cn(
                "relative rounded-md overflow-hidden bg-bg-secondary/40 min-h-0",
                hasResizedHeight ? "flex-1" : "shrink-0",
              )}
              style={{
                WebkitMaskImage:
                  "linear-gradient(to bottom, transparent 0%, black 22%, black 78%, transparent 100%)",
                maskImage:
                  "linear-gradient(to bottom, transparent 0%, black 22%, black 78%, transparent 100%)",
              }}
            >
              <div
                ref={snippetRef}
                className={cn(
                  "hide-scrollbar overflow-y-auto overflow-x-hidden px-2 py-1.5 text-[12px] leading-snug text-text-secondary whitespace-pre-wrap break-words",
                  hasResizedHeight ? "h-full" : "max-h-[3.9em]",
                )}
              >
                {snippetText(agent, composeDraft)}
              </div>
            </div>

            {/* Activities — only when expanded */}
            {showActivities && (
              <div className="mt-1.5 shrink-0 max-h-[40%] overflow-y-auto overflow-x-hidden hide-scrollbar">
                {recentActivities.map((act) => (
                  <ActivityLine key={act.id} activity={act} showDetail={isExpanded} />
                ))}
              </div>
            )}
          </div>
        )}

        {showProgressBar && (
          <div className="h-[2px] bg-border-light rounded-sm mt-2 mb-1.5 overflow-hidden shrink-0">
            <div
              className="h-full rounded-sm transition-all duration-300"
              style={{
                width: `${agent.progress}%`,
                background: accent,
              }}
            />
          </div>
        )}

        {/* ── Bottom: meta row — always pinned at bottom, never clips ── */}
        {showMeta && (
          <div className="mt-auto pt-1.5 shrink-0">
            {compact ? (
              <div className="flex justify-between items-center text-text-faint text-[9.5px]">
                <span className="font-mono leading-snug truncate">
                  {agent.branch}
                  {((agent.modelsUsed?.length ?? 0) > 0 || currentModelLabel) && (
                    <>
                      {" • "}
                      {(agent.modelsUsed?.length ?? 0) > 0
                        ? modelSummaryForCard(agent.modelsUsed ?? [])
                        : currentModelLabel}
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
                    : currentModelLabel ?? "—"}
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
        )}
      </div>

      {/* Bottom resize handle */}
      <div
        onPointerDown={onResizePointerDown}
        onDoubleClick={(e) => {
          e.stopPropagation();
          resetHeight();
        }}
        className={cn(
          "absolute bottom-0 left-0 right-0 h-[6px] cursor-ns-resize z-[2]",
          "opacity-0 group-hover/card:opacity-100 transition-opacity duration-120",
        )}
      >
        <div className="mx-auto mt-[3px] w-8 h-[2px] rounded-full bg-text-faint/40" />
      </div>

      {/* Bottom-right corner resize handle */}
      <div
        onPointerDown={onResizePointerDown}
        onDoubleClick={(e) => {
          e.stopPropagation();
          resetHeight();
        }}
        className={cn(
          "absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize z-[3]",
          "opacity-0 group-hover/card:opacity-100 transition-opacity duration-120",
        )}
      >
        <svg
          width="8"
          height="8"
          viewBox="0 0 8 8"
          className="absolute bottom-[3px] right-[3px] text-text-faint/50"
        >
          <line x1="7" y1="1" x2="1" y2="7" stroke="currentColor" strokeWidth="1" />
          <line x1="7" y1="4" x2="4" y2="7" stroke="currentColor" strokeWidth="1" />
        </svg>
      </div>

      {/* Bottom-left corner resize handle */}
      <div
        onPointerDown={onResizePointerDown}
        onDoubleClick={(e) => {
          e.stopPropagation();
          resetHeight();
        }}
        className={cn(
          "absolute bottom-0 left-0 w-3 h-3 cursor-nesw-resize z-[3]",
          "opacity-0 group-hover/card:opacity-100 transition-opacity duration-120",
        )}
      />
    </div>
  );
}
