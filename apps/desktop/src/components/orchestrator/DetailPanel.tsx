import React, { useEffect, useMemo, useRef, useState } from "react";
import { DiffPanel, type DiffFileInfo } from "@/components/chat/DiffPanel";
import {
  Archive,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleX,
  CloudUpload,
  GitBranch,
  GitCommit,
  GitMerge,
  GitPullRequest,
  ListFilter,
  Loader2,
  MessageSquare,
  Trash2,
  UserCheck,
  X,
} from "lucide-react";
import {
  MessageRow,
  ActivityFeed,
  StreamingMessage,
  ThinkingIndicator,
  STREAMING_THINKING_ACTIVITY_ID,
} from "@/components/chat/chat-message-rendering";
import { sendChatTurn } from "@/lib/send-chat-turn";
import { cn } from "@/lib/utils";
import { linearIssueMeta, type LinearIssue } from "@/lib/linear";
import { getAgentTimeLabel, getAgentTokenLabel } from "@/lib/agent-metrics";
import { agentStatusLabel, agentStatusVisual, statusColor } from "@/lib/status";
import { GlassConfirmDialog } from "@/components/ui/GlassConfirmDialog";
import { isDefaultGitBranch } from "@/lib/git";
import { rpcRequest } from "@/lib/rpc-client";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "@/lib/stores/app-store";
import { useProjectGitStore } from "@/lib/stores/project-git-store";
import { getModelDisplayName } from "@/lib/stores/settings-store";
import { useThreadStore } from "@/lib/stores/thread-store";
import type { Agent, AgentPlanStep, PrStatus } from "@/lib/stores/thread-store";

/** Tauri `invoke` often rejects with a plain string from Rust; avoid losing the message. */
function extractInvokeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  try {
    const s = JSON.stringify(error);
    return s !== "{}" ? s : fallback;
  } catch {
    return fallback;
  }
}

interface DetailPanelProps {
  agent: Agent;
  onClose: () => void;
  onOpenChat?: () => void;
}

const TABS = ["status", "chat", "diff"] as const;
type Tab = (typeof TABS)[number];

interface GitDiffData {
  diff: string;
  fileCount: number;
  additions: number;
  deletions: number;
  files: DiffFileInfo[];
}

const DETAIL_ACTION_PILL_BASE =
  "flex min-h-9 flex-1 basis-0 items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-medium outline-none backdrop-blur-md transition-[background-color,border-color,backdrop-filter,box-shadow] duration-150";

const DETAIL_ACTION_PILL_IDLE_SURFACE =
  "border-white/25 bg-white/[0.06] dark:border-white/[0.08] dark:bg-white/[0.03]";

/** Shared hover motion so Done / Archive / Delete read as one family (each adds a tint + border). */
const DETAIL_ACTION_PILL_HOVER_FX =
  "hover:backdrop-blur-lg hover:shadow-[0_2px_12px_rgba(0,0,0,0.1)] dark:hover:shadow-[0_2px_18px_rgba(0,0,0,0.32)]";

const DETAIL_ACTION_PILL_FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-blue focus-visible:outline-offset-2";
type GitThreadActionState = {
  currentBranch: string | null;
  branchMatchesThread: boolean;
  hasThreadStagedChanges: boolean;
  hasUpstream: boolean;
  branchAhead: boolean;
  canCommit: boolean;
  canPush: boolean;
};

function githubRepoPath(originUrl: string | null | undefined): string | null {
  if (!originUrl) return null;
  const match = originUrl.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
  return match?.[1] ?? null;
}

function currentPrUrl(agent: Agent): string | null {
  if (agent.prStatus?.prUrl) return agent.prStatus.prUrl;
  const repoPath = githubRepoPath(agent.originUrl);
  if (!repoPath || !agent.pr) return null;
  const prNumber = agent.pr.replace("#", "").trim();
  if (!prNumber) return null;
  return `https://github.com/${repoPath}/pull/${prNumber}`;
}

function comparePrUrl(agent: Agent): string | null {
  const branch = agent.branch.trim();
  if (!branch || isDefaultGitBranch(branch)) return null;
  const repoPath = githubRepoPath(agent.originUrl);
  if (!repoPath) return null;
  return `https://github.com/${repoPath}/compare/${encodeURIComponent(branch)}?expand=1`;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg-card border border-border-light rounded px-3 py-2.5">
      <div className="label-mono mb-1">{label}</div>
      <div className="text-lg font-medium text-text-primary">{value}</div>
    </div>
  );
}

function PlanStepIcon({ status }: { status: AgentPlanStep["status"] }) {
  if (status === "completed") {
    return <CircleCheck size={14} strokeWidth={1.5} className="text-text-faint shrink-0" />;
  }
  if (status === "inProgress") {
    return <Loader2 size={14} strokeWidth={1.75} className="text-text-tertiary shrink-0 animate-spin" />;
  }
  return <CircleDashed size={14} strokeWidth={1.5} className="text-text-tertiary shrink-0" />;
}

function AgentPlanBlock({ steps }: { steps: AgentPlanStep[] }) {
  const [expanded, setExpanded] = useState(false);

  const doneCount = useMemo(
    () => steps.filter((s) => s.status === "completed").length,
    [steps],
  );

  if (steps.length === 0) return null;

  return (
    <div className="border border-border-light rounded-lg overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpanded((v) => !v); }}
        className="flex w-full items-center gap-2.5 px-3 py-2 border-b border-border-light bg-bg-secondary cursor-pointer select-none"
      >
        <ListFilter size={12} strokeWidth={1.75} className="text-text-faint shrink-0" />
        <span className="font-mono text-[9.5px] text-text-faint uppercase tracking-widest">
          {doneCount} of {steps.length} Done
        </span>
        <ChevronDown
          size={12}
          strokeWidth={1.75}
          className={cn(
            "ml-auto text-text-faint shrink-0 transition-transform duration-150",
            expanded && "rotate-180",
          )}
        />
      </div>
      {expanded && <ul>
        {steps.map((s, i) => (
          <li
            key={i}
            className={cn(
              "flex items-start gap-2.5 px-3 py-2.5 text-[12.5px] leading-snug",
              i < steps.length - 1 && "border-b border-border-light",
              s.status === "completed"
                ? "text-text-faint line-through"
                : "text-text-primary",
            )}
          >
            <span className="mt-[1px]">
              <PlanStepIcon status={s.status} />
            </span>
            <span className="flex-1 min-w-0">{s.step}</span>
          </li>
        ))}
        </ul>}
    </div>
  );
}

function PrStatusRow({
  icon,
  label,
  action,
  iconColor,
}: {
  icon: React.ReactNode;
  label: string;
  action?: React.ReactNode;
  iconColor?: string;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border-light last:border-b-0">
      <span className={cn("shrink-0", iconColor)}>{icon}</span>
      <span className="flex-1 text-[12.5px] text-text-primary">{label}</span>
      {action && <span className="shrink-0">{action}</span>}
    </div>
  );
}

function GitActionRow({
  icon,
  label,
  onClick,
  disabled = false,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "group flex w-full items-center gap-3 rounded-md border px-2 py-2 text-left transition-[background-color,border-color,color,opacity] duration-120",
        disabled
          ? "cursor-not-allowed border-transparent text-text-faint opacity-55"
          : "cursor-pointer border-transparent text-text-secondary hover:border-border-light hover:bg-bg-secondary/70 hover:text-text-primary",
      )}
    >
      <span
        className={cn(
          "shrink-0 transition-colors duration-120",
          disabled ? "text-text-faint" : "text-text-tertiary group-hover:text-text-primary",
        )}
      >
        {icon}
      </span>
      <span className="font-sans text-[13px]">{label}</span>
    </button>
  );
}

function PrStatusCard({
  prStatus,
  prUrl,
  onOpenPr,
  framed = true,
  error,
}: {
  prStatus: PrStatus | null;
  prUrl: string | null;
  onOpenPr: () => void;
  framed?: boolean;
  error?: string | null;
}) {
  const checksIcon =
    prStatus?.checksState === "success" ? (
      <CircleCheck size={14} strokeWidth={1.5} className="text-accent-green" />
    ) : prStatus?.checksState === "failure" ? (
      <CircleX size={14} strokeWidth={1.5} className="text-accent-red" />
    ) : prStatus?.checksState === "pending" ? (
      <CircleDot size={14} strokeWidth={1.5} className="text-text-faint" />
    ) : (
      <CircleDashed size={14} strokeWidth={1.5} className="text-text-faint" />
    );

  const noDataLabel = error
    ? "Could not load PR status"
    : prUrl
      ? "No open PR found for this branch"
      : "No pull request yet";

  const checksLabel =
    prStatus?.checksState === "success"
      ? "Checks successful"
      : prStatus?.checksState === "failure"
        ? "Checks failing"
        : prStatus?.checksState === "pending"
          ? "Checks running"
          : noDataLabel;

  const approvalsIcon = (
    <UserCheck size={14} strokeWidth={1.5} className="text-text-faint" />
  );

  const commentsIcon = (
    <MessageSquare size={14} strokeWidth={1.5} className="text-text-faint" />
  );

  const mergeIcon = (
    <GitMerge size={14} strokeWidth={1.5} className="text-text-faint" />
  );

  return (
    <div
      className={cn(
        "overflow-hidden bg-bg-card",
        framed && "border border-border-light rounded-lg",
      )}
    >
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          <img src="/octicon.svg" alt="" className="w-3 h-3 opacity-40 dark:invert shrink-0" />
          <span className="font-sans text-[9.5px] font-medium text-text-faint uppercase tracking-widest">
            PR status
          </span>
          {prUrl ? (
            <button
              type="button"
              onClick={onOpenPr}
              className="ml-auto inline-flex items-center gap-1 font-sans text-[9.5px] font-medium uppercase tracking-widest text-text-faint hover:text-text-secondary transition-colors duration-120 cursor-pointer"
            >
              {prStatus?.prNumber ? `#${prStatus.prNumber}` : "view"}
              <ArrowUpRight size={10} strokeWidth={1.75} />
            </button>
          ) : null}
        </div>
      </div>
      <div className="border-t border-border-light px-4">
        <PrStatusRow icon={checksIcon} label={checksLabel} />
        <PrStatusRow
          icon={approvalsIcon}
          label={
            prStatus
              ? prStatus.approvals === 0
                ? "No approvals yet"
                : `${prStatus.approvals} approval${prStatus.approvals === 1 ? "" : "s"}`
              : noDataLabel
          }
        />
        {prStatus?.comments ? (
          <PrStatusRow
            icon={commentsIcon}
            label={`${prStatus.comments} comment${prStatus.comments === 1 ? "" : "s"}`}
            action={
              prUrl ? (
                <button
                  type="button"
                  onClick={onOpenPr}
                  className="px-2 py-0.5 text-[10.5px] text-text-secondary border border-border-default rounded hover:bg-bg-secondary transition-colors duration-120 font-sans"
                >
                  Address all
                </button>
              ) : undefined
            }
          />
        ) : null}
        <PrStatusRow
          icon={mergeIcon}
          label={
            prStatus
              ? prStatus.mergeable
                ? "Ready to merge"
                : "Not ready to merge"
              : noDataLabel
          }
          action={
            prStatus?.mergeable && prUrl ? (
              <button
                type="button"
                onClick={onOpenPr}
                className="px-2 py-0.5 text-[10.5px] text-text-secondary border border-border-default rounded hover:bg-bg-secondary transition-colors duration-120 font-sans"
              >
                Merge
              </button>
            ) : undefined
          }
        />
        {error ? (
          <div className="py-2.5 text-[11px] leading-relaxed text-accent-red">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function GitOverviewCard({
  prStatus,
  existingPrUrl,
  prActionLabel,
  prError,
  prDisabled,
  prTitle,
  onCommit,
  onPush,
  onViewPr,
  onCreateBranch,
  commitDisabled,
  pushDisabled,
  pushLabel,
  branchDisabled,
  commitTitle,
  pushTitle,
  gitHint,
}: {
  prStatus: PrStatus | null;
  existingPrUrl: string | null;
  prActionLabel: string;
  prError?: string | null;
  prDisabled: boolean;
  prTitle?: string;
  onCommit: () => void;
  onPush: () => void;
  onViewPr: () => void;
  onCreateBranch: () => void;
  commitDisabled: boolean;
  pushDisabled: boolean;
  pushLabel: string;
  branchDisabled: boolean;
  commitTitle?: string;
  pushTitle?: string;
  gitHint?: string | null;
}) {
  return (
    <div className="border border-border-light rounded-lg overflow-hidden bg-bg-card">
      <div className="px-4 py-3">
        <div className="font-mono text-[9.5px] text-text-faint uppercase tracking-widest mb-2.5">
          Git actions
        </div>
        <div className="flex flex-col">
          <GitActionRow
            icon={<GitCommit size={16} strokeWidth={1.8} />}
            label="Commit"
            onClick={onCommit}
            disabled={commitDisabled}
            title={commitTitle}
          />
          <GitActionRow
            icon={<CloudUpload size={16} strokeWidth={1.8} />}
            label={pushLabel}
            onClick={onPush}
            disabled={pushDisabled}
            title={pushTitle}
          />
          <GitActionRow
            icon={<GitPullRequest size={16} strokeWidth={1.8} />}
            label={prActionLabel}
            onClick={onViewPr}
            disabled={prDisabled}
            title={prTitle}
          />
          <GitActionRow
            icon={<GitBranch size={16} strokeWidth={1.8} />}
            label="Create branch"
            onClick={onCreateBranch}
            disabled={branchDisabled}
          />
        </div>
        {gitHint ? (
          <p className="mt-2.5 text-[11px] leading-relaxed text-text-tertiary">{gitHint}</p>
        ) : null}
      </div>
      <div className="border-t border-border-light" />
      <PrStatusCard
        prStatus={prStatus}
        prUrl={existingPrUrl}
        onOpenPr={onViewPr}
        framed={false}
        error={prError}
      />
    </div>
  );
}

function LinkedLinearIssuesCard({
  issues,
  onOpenIssue,
}: {
  issues: LinearIssue[];
  onOpenIssue: (url: string) => void;
}) {
  return (
    <div className="border border-border-light rounded-lg overflow-hidden bg-bg-card">
      <div className="px-4 py-3 border-b border-border-light">
        <div className="flex items-center">
          <img
            src="/linear_wordmark.svg"
            alt="Linear"
            className="h-3.5 w-auto max-w-[100px] shrink-0 opacity-40 invert dark:invert-0"
          />
        </div>
        <div className="mt-0.5 text-[11px] leading-relaxed text-text-tertiary">
          This thread is linked to {issues.length} Linear issue{issues.length === 1 ? "" : "s"}.
        </div>
      </div>

      <div className="px-4 py-3 space-y-2">
        {issues.map((issue) => (
          <div
            key={issue.id}
            className="flex items-start justify-between gap-3 rounded-md border border-border-light bg-bg-secondary/45 px-3 py-2.5"
          >
            <div className="min-w-0">
              <div className="text-[9.5px] uppercase tracking-widest text-text-faint">
                {linearIssueMeta(issue)}
              </div>
              <div className="mt-1 text-[12px] leading-relaxed text-text-primary">
                {issue.title}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenIssue(issue.url)}
              className={cn(
                "inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-border-default px-2 py-1 text-[10.5px] text-text-secondary transition-all duration-120",
                "hover:border-border-focus hover:bg-bg-card hover:text-text-primary hover:shadow-level-1",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-blue",
                "active:bg-bg-secondary/90",
              )}
            >
              Open
              <ArrowUpRight size={11} strokeWidth={1.75} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function OpenFullViewArrow({ className }: { className?: string }) {
  return (
    <ArrowUpRight size={16} strokeWidth={1.5} className={cn("shrink-0", className)} aria-hidden />
  );
}

type ConfirmKind = "archive" | "delete" | null;

export function DetailPanel({ agent, onClose, onOpenChat }: DetailPanelProps) {
  const [tab, setTab] = useState<Tab>("status");
  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null);
  const [actionBusy, setActionBusy] = useState<"archive" | "delete" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [gitDialog, setGitDialog] = useState<"commit" | "branch" | null>(null);
  const [gitBusy, setGitBusy] = useState<
    "commit" | "push" | "branch" | "openPr" | null
  >(null);
  const [gitError, setGitError] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [gitActionState, setGitActionState] = useState<GitThreadActionState | null>(null);
  const [composeText, setComposeText] = useState("");
  const [composeSending, setComposeSending] = useState(false);
  const [gitDiff, setGitDiff] = useState<GitDiffData | null>(null);
  const [diffVersion, setDiffVersion] = useState(0);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const removeAgent = useThreadStore((s) => s.removeAgent);
  const setAgentStatus = useThreadStore((s) => s.setAgentStatus);
  const updateAgentGitInfo = useThreadStore((s) => s.updateAgentGitInfo);
  const updateAgentPrStatus = useThreadStore((s) => s.updateAgentPrStatus);
  const projectPath = useAppStore((s) => s.projectPath);
  const refreshProjectGitInfo = useProjectGitStore((s) => s.refreshProjectGitInfo);
  const accent = statusColor(agent);
  const statusVisual = agentStatusVisual(agent);
  const StatusIcon = statusVisual.icon;

  const threadId = agent.codexThreadId ?? null;
  const canArchive = Boolean(threadId);
  const canRunGitActions = Boolean(projectPath);
  const modelsUsed = agent.modelsUsed ?? [];
  const modelSummary =
    modelsUsed.length > 0
      ? modelsUsed.map((model) => getModelDisplayName(model)).join(", ")
      : agent.selectedModelId
        ? getModelDisplayName(agent.selectedModelId)
        : null;
  const linkedLinearIssues = agent.linkedLinearIssues ?? [];

  const [detectedPrUrl, setDetectedPrUrl] = useState<string | null>(null);
  const [prError, setPrError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectPath || isDefaultGitBranch(agent.branch)) {
      setDetectedPrUrl(null);
      return;
    }
    let cancelled = false;
    invoke<{ number: number; url: string } | null>("get_branch_pr", {
      path: projectPath,
      branch: agent.branch || null,
    })
      .then((result) => {
        if (cancelled) return;
        setDetectedPrUrl(result?.url ?? null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [projectPath, agent.branch]);

  useEffect(() => {
    if (!projectPath) {
      setGitActionState(null);
      return;
    }
    let cancelled = false;
    invoke<GitThreadActionState>("get_git_thread_action_state", {
      path: projectPath,
      branch: agent.branch || null,
      files: agent.files,
    })
      .then((state) => {
        if (!cancelled) setGitActionState(state);
      })
      .catch(() => {
        if (!cancelled) setGitActionState(null);
      });
    return () => { cancelled = true; };
  }, [projectPath, agent.branch, agent.files]);

  const onDefaultBranch = isDefaultGitBranch(agent.branch);
  const existingPrUrl = onDefaultBranch ? null : (currentPrUrl(agent) ?? detectedPrUrl);
  const prUrl = existingPrUrl ?? comparePrUrl(agent);
  const prActionLabel = existingPrUrl ? "Open PR" : "Create PR";

  useEffect(() => {
    if (!projectPath || isDefaultGitBranch(agent.branch)) {
      updateAgentPrStatus(agent.id, null);
      return;
    }
    setPrError(null);
    invoke<{
      checksState: "success" | "failure" | "pending" | "none";
      approvals: number;
      comments: number;
      mergeable: boolean;
      prNumber: number | null;
      prUrl: string | null;
    } | null>("github_get_pr_status", {
      path: projectPath,
      branch: agent.branch || null,
    })
      .then((prStatus) => {
        updateAgentPrStatus(agent.id, prStatus);
      })
      .catch((err: unknown) => {
        updateAgentPrStatus(agent.id, null);
        const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "PR status fetch failed";
        setPrError(msg);
      });
  }, [agent.id, agent.branch, projectPath, updateAgentPrStatus]);

  useEffect(() => {
    if (!projectPath || tab !== "diff") return;
    let cancelled = false;
    invoke<GitDiffData>("get_git_diff", {
      path: projectPath,
      branch: agent.branch ? `origin/${agent.branch}` : null,
    })
      .then((result) => { if (!cancelled) setGitDiff(result); })
      .catch(() => { if (!cancelled) setGitDiff(null); });
    return () => { cancelled = true; };
  }, [projectPath, agent.branch, tab, diffVersion]);

  useEffect(() => {
    if (tab !== "chat") return;
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [tab, agent.messages.length, agent.streamingBuffer, agent.activities?.length]);

  const handleComposeSend = async () => {
    const text = composeText.trim();
    if (!text || composeSending) return;
    setComposeText("");
    setComposeSending(true);
    try {
      await sendChatTurn(agent.id, text, []);
    } finally {
      setComposeSending(false);
    }
  };

  const isThinking =
    agent.turnInProgress &&
    !agent.streamingBuffer &&
    agent.messages[agent.messages.length - 1]?.role === "you";

  const hasInlineThinkingStream =
    agent.activities?.some(
      (a) => a.id === STREAMING_THINKING_ACTIVITY_ID && a.status === "running",
    ) ?? false;

  async function refreshGitInfo(branchOverride?: string) {
    if (!projectPath) return;
    try {
      const effectiveBranch = branchOverride ?? agent.branch;
      const info = await refreshProjectGitInfo(projectPath);
      updateAgentGitInfo(agent.id, {
        sha: info?.sha ?? undefined,
        originUrl: info?.originUrl ?? undefined,
      });
      const threadGitState = await invoke<GitThreadActionState>("get_git_thread_action_state", {
        path: projectPath,
        branch: effectiveBranch || null,
        files: agent.files,
      }).catch(() => null);
      setGitActionState(threadGitState);
      setPrError(null);
      const prStatus = await invoke<{
        checksState: "success" | "failure" | "pending" | "none";
        approvals: number;
        comments: number;
        mergeable: boolean;
        prNumber: number | null;
        prUrl: string | null;
      } | null>("github_get_pr_status", {
        path: projectPath,
        branch: effectiveBranch || null,
      });
      updateAgentPrStatus(agent.id, prStatus);
    } catch (err) {
      const msg = err instanceof Error ? err.message : typeof err === "string" ? err : null;
      if (msg) setPrError(msg);
    }
  }

  function markDone() {
    setAgentStatus(agent.id, "deployed");
  }

  function openArchiveConfirm() {
    if (!threadId || actionBusy) return;
    setConfirmKind("archive");
  }

  function openDeleteConfirm() {
    if (actionBusy) return;
    setConfirmKind("delete");
  }

  async function runArchive() {
    if (!threadId) return;
    setActionError(null);
    setActionBusy("archive");
    try {
      await rpcRequest("thread/archive", { threadId });
      removeAgent(agent.id);
      onClose();
    } catch (e) {
      setActionError(extractInvokeErrorMessage(e, "Archive failed"));
    } finally {
      setActionBusy(null);
    }
  }

  async function runDelete() {
    setActionError(null);
    setActionBusy("delete");
    try {
      if (threadId) {
        await rpcRequest("thread/unsubscribe", { threadId });
      }
      removeAgent(agent.id);
      onClose();
    } catch (e) {
      setActionError(extractInvokeErrorMessage(e, "Remove failed"));
    } finally {
      setActionBusy(null);
    }
  }

  async function runCommit() {
    if (!projectPath || gitBusy !== null || !gitActionState?.canCommit) return;
    setGitError(null);
    setGitBusy("commit");
    try {
      await invoke("git_commit", {
        path: projectPath,
        message: commitMessage.trim(),
      });
      markDone();
      setCommitMessage("");
      setGitDialog(null);
      await refreshGitInfo();
    } catch (e) {
      setGitError(e instanceof Error ? e.message : "Commit failed");
    } finally {
      setGitBusy(null);
    }
  }

  async function runPush() {
    if (!projectPath || gitBusy !== null || !gitActionState?.canPush) return;
    setGitError(null);
    setGitBusy("push");
    try {
      await invoke("git_push", { path: projectPath });
      await refreshGitInfo();
    } catch (e) {
      setGitError(e instanceof Error ? e.message : "Push failed");
    } finally {
      setGitBusy(null);
    }
  }

  async function runOpenPr() {
    if (!prUrl) return;
    setGitError(null);
    setGitBusy("openPr");
    try {
      await invoke("open_url", { url: prUrl });
    } catch (e) {
      setGitError(e instanceof Error ? e.message : "Couldn't open pull request");
    } finally {
      setGitBusy(null);
    }
  }

  async function runCreateBranch() {
    if (!projectPath || !newBranchName.trim()) return;
    setGitError(null);
    setGitBusy("branch");
    try {
      const branchName = newBranchName.trim();
      await invoke("git_create_branch", {
        path: projectPath,
        name: branchName,
      });
      updateAgentGitInfo(agent.id, { branch: branchName });
      setNewBranchName("");
      setGitDialog(null);
      await refreshGitInfo(branchName);
    } catch (e) {
      setGitError(e instanceof Error ? e.message : "Create branch failed");
    } finally {
      setGitBusy(null);
    }
  }

  async function openLinearUrl(url: string) {
    try {
      await invoke("open_linear_desktop_url", { url });
    } catch (error) {
      setGitError(error instanceof Error ? error.message : "Couldn't open Linear");
    }
  }

  const threadBranch = agent.branch.trim();
  const branchNeedsPublish = Boolean(threadBranch && gitActionState?.branchMatchesThread && !gitActionState?.hasUpstream);
  const commitDisabled = !canRunGitActions || gitBusy !== null || !gitActionState?.canCommit;
  const pushDisabled = !canRunGitActions || gitBusy !== null || !gitActionState?.canPush;
  const pushLabel = branchNeedsPublish ? "Publish branch" : "Push";
  const branchDisabled = !canRunGitActions || gitBusy !== null;
  const disabledGitHint = !projectPath
    ? "Open a project workspace to use git actions."
    : threadBranch && gitActionState && !gitActionState.branchMatchesThread
      ? `Checkout ${threadBranch} to commit or push changes for this thread.`
      : gitActionState && !gitActionState.hasThreadStagedChanges && !gitActionState.branchAhead && !branchNeedsPublish
        ? "Stage this thread's files to enable commit and push."
        : null;
  const gitHint = disabledGitHint ?? (branchNeedsPublish ? "Publish this branch to create a PR." : null);
  const commitTitle = commitDisabled ? disabledGitHint ?? "No staged changes for this thread" : undefined;
  const pushTitle = pushDisabled ? disabledGitHint ?? "Nothing to push for this thread" : undefined;
  const prDisabled = !prUrl || gitBusy !== null || branchNeedsPublish;
  const prTitle = branchNeedsPublish
    ? "Publish this branch before opening a PR."
    : !existingPrUrl && onDefaultBranch
      ? "Create a feature branch first to open a PR"
      : undefined;

  return (
    <>
    <GlassConfirmDialog
      open={confirmKind !== null}
      title={confirmKind === "archive" ? "Archive thread" : "Remove thread"}
      message={
        confirmKind === "archive"
          ? `Archive "${agent.title}"? It will leave the board and be stored as an archived thread.`
          : confirmKind === "delete"
            ? `Remove "${agent.title}" from the board? You will stop receiving updates for this session.`
            : ""
      }
      confirmLabel={confirmKind === "archive" ? "Archive" : "Remove"}
      cancelLabel="Cancel"
      danger={confirmKind === "delete"}
      busy={actionBusy !== null}
      onClose={() => {
        if (actionBusy === null) setConfirmKind(null);
      }}
      onConfirm={() => {
        const k = confirmKind;
        setConfirmKind(null);
        if (k === "archive") void runArchive();
        else if (k === "delete") void runDelete();
      }}
    />
    {gitDialog !== null ? (
      <>
        <div
          className="fixed inset-0 z-[90] bg-black/20 dark:bg-black/40"
          onClick={() => {
            if (gitBusy === null) setGitDialog(null);
          }}
          aria-hidden
        />
        <div className="fixed left-1/2 top-1/2 z-[100] w-[min(360px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[10px] border border-border-default bg-bg-card p-5 shadow-[0_12px_40px_rgba(0,0,0,0.06)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.25)]">
          <div className="font-mono text-[10px] text-text-faint uppercase tracking-widest mb-2">
            {gitDialog === "commit" ? "Commit message" : "New branch name"}
          </div>
          <input
            value={gitDialog === "commit" ? commitMessage : newBranchName}
            onChange={(e) => {
              if (gitDialog === "commit") setCommitMessage(e.target.value);
              else setNewBranchName(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              if (gitDialog === "commit") void runCommit();
              else void runCreateBranch();
            }}
            placeholder={
              gitDialog === "commit" ? "Leave empty to auto-generate..." : "feat/my-branch"
            }
            disabled={gitBusy !== null}
            className="w-full px-3 py-2 rounded-md border border-border-default bg-bg-input text-[13px] text-text-primary placeholder:text-text-faint mb-3 disabled:opacity-60"
          />
          {gitError ? (
            <p className="text-[11px] text-accent-red mb-3 leading-snug">{gitError}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={gitBusy !== null}
              onClick={() => setGitDialog(null)}
              className="px-3 py-1.5 text-[11.5px] text-text-secondary border border-border-default rounded-md hover:bg-bg-secondary transition-colors duration-120 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={
                gitBusy !== null ||
                (gitDialog === "branch" && !newBranchName.trim())
              }
              onClick={() => {
                if (gitDialog === "commit") void runCommit();
                else void runCreateBranch();
              }}
              className="px-3 py-1.5 text-[11.5px] font-medium bg-text-primary text-bg-card rounded-md hover:opacity-90 transition-opacity duration-120 disabled:opacity-50"
            >
              {gitDialog === "commit"
                ? gitBusy === "commit"
                  ? commitMessage.trim()
                    ? "Committing\u2026"
                    : "Generating\u2026"
                  : "Commit"
                : gitBusy === "branch"
                  ? "Creating\u2026"
                  : "Create branch"}
            </button>
          </div>
        </div>
      </>
    ) : null}
    <div
      className="w-[360px] h-full flex flex-col shrink-0 overflow-hidden rounded-l-[10px] border-l border-border-light glass-overlay"
    >
      {/* Header */}
      <div className="px-6 pt-6 pb-4.5">
        <div className="flex justify-between items-start mb-2.5">
          <div className="text-lg font-medium text-text-primary leading-tight flex-1 pr-3">
            {agent.title}
          </div>
          <button
            onClick={onClose}
            className="text-text-faint cursor-pointer leading-none hover:text-text-secondary transition-colors duration-120"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <StatusIcon
            size={12}
            strokeWidth={1.9}
            className={cn("shrink-0", statusVisual.spin && "animate-spin")}
            style={{ color: statusVisual.color }}
          />
          <span
            className="font-mono text-[10px] font-semibold uppercase tracking-label-wide"
            style={{ color: accent }}
          >
            {agentStatusLabel(agent)}
          </span>
          <span className="font-mono text-[10px] text-text-faint flex items-center gap-1">
            <GitBranch size={10} strokeWidth={1.75} className="opacity-50 shrink-0" />
            {agent.branch}
          </span>
          {modelSummary && (
            <span className="text-[10px] text-text-faint">
              {modelSummary}
            </span>
          )}
          {agent.originUrl && (() => {
            const m = agent.originUrl.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
            if (!m) return null;
            const repoUrl = `https://github.com/${m[1]}`;
            return (
              <a
                href={repoUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 font-mono text-[10px] text-text-faint hover:text-text-secondary transition-colors duration-120"
                onClick={(e) => e.stopPropagation()}
              >
                <img src="/octicon.svg" alt="" className="w-2.5 h-2.5 opacity-35 dark:invert shrink-0" />
                <span>{m[1]}</span>
              </a>
            );
          })()}
        </div>
      </div>

      {/* Tabs — first label aligns with title row (no extra horizontal inset) */}
      <div className="flex items-end gap-6 border-b border-border-light px-6">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "bg-transparent border-none cursor-pointer font-mono text-xs font-medium uppercase tracking-label pt-2.5 pb-2",
              "transition-colors duration-120",
              tab === t
                ? "text-text-primary border-b-[1.5px] border-b-text-primary"
                : "text-text-tertiary border-b-[1.5px] border-b-transparent",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content — footer overlays the scroll area so backdrop blur samples real content */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className={cn(
          "min-h-0 flex-1 flex flex-col",
          tab === "chat"
            ? "overflow-hidden px-6 pt-4 pb-2"
            : tab === "diff"
              ? "overflow-hidden"
              : "overflow-auto px-6 py-6 pb-28",
        )}>
        {tab === "status" && (
          <div className="flex flex-col gap-5">
            <AgentPlanBlock steps={agent.planSteps ?? []} />

            <div className="grid grid-cols-2 gap-2.5">
              <StatCard label="Time" value={getAgentTimeLabel(agent)} />
              <StatCard label="Tokens" value={getAgentTokenLabel(agent)} />
            </div>

            <GitOverviewCard
              prStatus={agent.prStatus ?? null}
              existingPrUrl={existingPrUrl}
              prActionLabel={prActionLabel}
              prError={prError}
              prDisabled={prDisabled}
              prTitle={prTitle}
              onCommit={() => {
                setGitError(null);
                setGitDialog("commit");
              }}
              onPush={() => {
                void runPush();
              }}
              onViewPr={() => {
                void runOpenPr();
              }}
              onCreateBranch={() => {
                setGitError(null);
                setGitDialog("branch");
              }}
              commitDisabled={commitDisabled}
              pushDisabled={pushDisabled}
              pushLabel={pushLabel}
              branchDisabled={branchDisabled}
              commitTitle={commitTitle}
              pushTitle={pushTitle}
              gitHint={gitHint}
            />

            {linkedLinearIssues.length > 0 ? (
              <LinkedLinearIssuesCard
                issues={linkedLinearIssues}
                onOpenIssue={(url) => {
                  void openLinearUrl(url);
                }}
              />
            ) : null}
          </div>
        )}

        {tab === "chat" && (
          <div className="flex flex-col h-full min-h-0">
            {/* Scrollable message area */}
            <div
              ref={chatScrollRef}
              className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-0 pb-3"
            >
              {agent.messages.length === 0 &&
              !(agent.streamingBuffer?.trim()) &&
              (agent.activities?.length ?? 0) === 0 ? (
                <div className="flex items-center justify-center h-32">
                  <span className="font-sans text-[12px] text-text-faint italic">
                    No messages yet.
                  </span>
                </div>
              ) : (
                <>
                  {agent.messages.length > 0 &&
                  agent.messages[agent.messages.length - 1]?.role === "agent" ? (
                    <>
                      {agent.messages.slice(0, -1).map((msg, i) => (
                        <MessageRow key={i} message={msg} messageIndex={i} />
                      ))}
                      {(agent.activities?.length ?? 0) > 0 && (
                        <ActivityFeed activities={agent.activities ?? []} />
                      )}
                      <MessageRow
                        message={agent.messages[agent.messages.length - 1]!}
                        messageIndex={agent.messages.length - 1}
                      />
                    </>
                  ) : (
                    <>
                      {agent.messages.map((msg, i) => (
                        <MessageRow key={i} message={msg} messageIndex={i} />
                      ))}
                      {(agent.activities?.length ?? 0) > 0 && (
                        <ActivityFeed activities={agent.activities ?? []} />
                      )}
                    </>
                  )}

                  {isThinking && !hasInlineThinkingStream && <ThinkingIndicator />}

                  {agent.streamingBuffer && (
                    <StreamingMessage buffer={agent.streamingBuffer} />
                  )}
                </>
              )}
            </div>

            {/* Open full view link */}
            {onOpenChat && (
              <button
                type="button"
                onClick={onOpenChat}
                className="font-sans text-[12px] text-[var(--text-links)] flex items-center gap-0.5 bg-transparent border-0 cursor-pointer p-0 pb-2 text-left shrink-0 transition-[filter] duration-150 hover:brightness-[0.88] dark:hover:brightness-[0.92]"
              >
                <span>Open full view</span>
                <OpenFullViewArrow />
              </button>
            )}

            {/* Compose */}
            <div className="shrink-0 relative">
              <textarea
                value={composeText}
                onChange={(e) => setComposeText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleComposeSend();
                  }
                }}
                placeholder="Message…"
                rows={1}
                disabled={composeSending}
                className="w-full resize-none rounded-lg border border-border-default bg-bg-input px-3 py-2.5 pr-10 text-[13px] text-text-primary placeholder:text-text-faint outline-none focus:border-border-focus transition-[border-color] duration-120 disabled:opacity-60 leading-relaxed"
                style={{ minHeight: 40, maxHeight: 120, overflowY: "auto" }}
              />
              <button
                type="button"
                onClick={() => void handleComposeSend()}
                disabled={!composeText.trim() || composeSending}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-md text-text-faint hover:text-text-primary disabled:opacity-40 transition-colors duration-120 cursor-pointer disabled:cursor-not-allowed"
                aria-label="Send message"
              >
                {composeSending ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M6.5 11V2M2 6.5L6.5 2L11 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
            </div>
          </div>
        )}

        {tab === "diff" && (
          <DiffPanel
            diff={gitDiff?.diff ?? ""}
            files={gitDiff?.files ?? []}
            projectPath={projectPath}
            open={true}
            onRefresh={() => setDiffVersion((v) => v + 1)}
            embedded
          />
        )}
        </div>

        {/* Blur sits above scrolling content (not below it in the flex column). Hidden on chat/diff tabs. */}
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 z-10 h-36",
            (tab === "chat" || tab === "diff") && "hidden",
          )}
          aria-hidden="true"
        >
          <div className="absolute inset-x-0 bottom-0 h-32">
            <div
              className="absolute inset-0 backdrop-blur-[1px]"
              style={{
                maskImage:
                  "linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)",
                WebkitMaskImage:
                  "linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)",
              }}
            />
            <div
              className="absolute inset-0 backdrop-blur-[2px]"
              style={{
                maskImage:
                  "linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 70%)",
                WebkitMaskImage:
                  "linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 70%)",
              }}
            />
            <div
              className="absolute inset-0 backdrop-blur-[4px]"
              style={{
                maskImage:
                  "linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 50%)",
                WebkitMaskImage:
                  "linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 50%)",
              }}
            />
            <div
              className="absolute inset-0 backdrop-blur-[8px]"
              style={{
                maskImage:
                  "linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 35%)",
                WebkitMaskImage:
                  "linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 35%)",
              }}
            />
          </div>
        </div>

        <div className={cn("absolute inset-x-0 bottom-0 z-20 space-y-2 px-6 pb-4 pt-2", tab === "chat" && "hidden")}>
          {actionError && (
            <p className="text-[11px] text-accent-red leading-snug">{actionError}</p>
          )}
          {gitError && gitDialog === null ? (
            <p className="text-[11px] text-accent-red leading-snug">{gitError}</p>
          ) : null}
          <div className="flex w-full justify-center gap-2">
            <button
              type="button"
              disabled={agent.status === "deployed"}
              onClick={markDone}
              title="Move this thread to done"
              className={cn(
                DETAIL_ACTION_PILL_BASE,
                DETAIL_ACTION_PILL_IDLE_SURFACE,
                agent.status === "deployed"
                  ? "cursor-default border-border-light text-text-faint opacity-60"
                  : [
                      "cursor-pointer border-[#5F6AD3]/40 text-[#5F6AD3]",
                      DETAIL_ACTION_PILL_HOVER_FX,
                      "hover:border-[#5F6AD3] hover:bg-[#5F6AD3]/24",
                      DETAIL_ACTION_PILL_FOCUS,
                      "active:bg-[#5F6AD3]/30",
                    ],
              )}
            >
              <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.1} />
              Done
            </button>
            <button
              type="button"
              disabled={!canArchive || actionBusy !== null}
              onClick={openArchiveConfirm}
              title={
                canArchive
                  ? "Archive on disk and remove from board"
                  : "Start a chat session to enable archive"
              }
              className={cn(
                DETAIL_ACTION_PILL_BASE,
                "border-border-default bg-white/[0.06] text-text-secondary dark:bg-white/[0.03]",
                DETAIL_ACTION_PILL_HOVER_FX,
                "hover:border-border-focus hover:bg-black/[0.1] dark:hover:bg-white/[0.16]",
                DETAIL_ACTION_PILL_FOCUS,
                "active:bg-black/[0.12] dark:active:bg-white/[0.2]",
                (!canArchive || actionBusy !== null) &&
                  "pointer-events-none cursor-not-allowed opacity-40 hover:border-border-default hover:bg-white/[0.06] hover:shadow-none hover:backdrop-blur-md dark:hover:bg-white/[0.03]",
              )}
            >
              <Archive className="h-3.5 w-3.5 shrink-0 opacity-80" strokeWidth={1.75} />
              {actionBusy === "archive" ? "Archiving…" : "Archive"}
            </button>
            <button
              type="button"
              disabled={actionBusy !== null}
              onClick={openDeleteConfirm}
              title="Remove from board and unsubscribe from updates"
              className={cn(
                DETAIL_ACTION_PILL_BASE,
                DETAIL_ACTION_PILL_IDLE_SURFACE,
                "border-accent-red/35 text-accent-red dark:border-accent-red/45",
                DETAIL_ACTION_PILL_HOVER_FX,
                "hover:border-accent-red hover:bg-accent-red/22",
                DETAIL_ACTION_PILL_FOCUS,
                "active:bg-accent-red/28",
                actionBusy !== null &&
                  "pointer-events-none cursor-not-allowed opacity-50 hover:border-accent-red/35 hover:bg-white/[0.06] hover:shadow-none hover:backdrop-blur-md dark:hover:border-accent-red/45 dark:hover:bg-white/[0.03]",
              )}
            >
              <Trash2 className="h-3.5 w-3.5 shrink-0 opacity-90" strokeWidth={1.75} />
              {actionBusy === "delete" ? "Removing…" : "Delete"}
            </button>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
