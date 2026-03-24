import React, { useEffect, useMemo, useState } from "react";
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
import { cn } from "@/lib/utils";
import { getAgentTimeLabel, getAgentTokenLabel } from "@/lib/agent-metrics";
import { agentStatusLabel, agentStatusVisual, statusColor } from "@/lib/status";
import { GlassConfirmDialog } from "@/components/ui/GlassConfirmDialog";
import { rpcRequest } from "@/lib/rpc-client";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "@/lib/stores/app-store";
import { useThreadStore } from "@/lib/stores/thread-store";
import type { Agent, AgentPlanStep, PrStatus } from "@/lib/stores/thread-store";

interface DetailPanelProps {
  agent: Agent;
  onClose: () => void;
  onOpenChat?: () => void;
}

const TABS = ["status", "chat", "files"] as const;
type Tab = (typeof TABS)[number];

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
  const repoPath = githubRepoPath(agent.originUrl);
  if (!repoPath || !agent.branch.trim()) return null;
  return `https://github.com/${repoPath}/compare/${encodeURIComponent(agent.branch)}?expand=1`;
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
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-1 py-2 text-left transition-colors duration-120",
        disabled
          ? "cursor-not-allowed text-text-faint opacity-55"
          : "cursor-pointer text-text-primary hover:bg-bg-secondary/70",
      )}
    >
      <span className="shrink-0 text-text-tertiary">{icon}</span>
      <span className="font-sans text-[13px]">{label}</span>
    </button>
  );
}

function PrStatusCard({
  prStatus,
  prUrl,
  onOpenPr,
  framed = true,
}: {
  prStatus: PrStatus | null;
  prUrl: string | null;
  onOpenPr: () => void;
  framed?: boolean;
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

  const checksLabel =
    prStatus?.checksState === "success"
      ? "Checks successful"
      : prStatus?.checksState === "failure"
        ? "Checks failing"
        : prStatus?.checksState === "pending"
          ? "Checks running"
          : prUrl
            ? "Connect GitHub token to see checks"
            : "No pull request yet";

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
      <div className="border-t border-border-light px-4 divide-y divide-border-light">
        <PrStatusRow icon={checksIcon} label={checksLabel} />
        <PrStatusRow
          icon={approvalsIcon}
          label={
            prStatus
              ? prStatus.approvals === 0
                ? "No approvals yet"
                : `${prStatus.approvals} approval${prStatus.approvals === 1 ? "" : "s"}`
              : prUrl
                ? "PR metadata unavailable"
                : "No approvals yet"
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
              : prUrl
                ? "PR ready state unavailable"
                : "No pull request yet"
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
      </div>
    </div>
  );
}

function GitOverviewCard({
  prStatus,
  prUrl,
  existingPrUrl,
  prActionLabel,
  onCommit,
  onPush,
  onViewPr,
  onCreateBranch,
  gitDisabled,
}: {
  prStatus: PrStatus | null;
  prUrl: string | null;
  existingPrUrl: string | null;
  prActionLabel: string;
  onCommit: () => void;
  onPush: () => void;
  onViewPr: () => void;
  onCreateBranch: () => void;
  gitDisabled: boolean;
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
            disabled={gitDisabled}
          />
          <GitActionRow
            icon={<CloudUpload size={16} strokeWidth={1.8} />}
            label="Push"
            onClick={onPush}
            disabled={gitDisabled}
          />
          <GitActionRow
            icon={<GitPullRequest size={16} strokeWidth={1.8} />}
            label={prActionLabel}
            onClick={onViewPr}
            disabled={!prUrl}
          />
          <GitActionRow
            icon={<GitBranch size={16} strokeWidth={1.8} />}
            label="Create branch"
            onClick={onCreateBranch}
            disabled={gitDisabled}
          />
        </div>
      </div>
      <div className="border-t border-border-light" />
      <PrStatusCard
        prStatus={prStatus}
        prUrl={existingPrUrl}
        onOpenPr={onViewPr}
        framed={false}
      />
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
  const removeAgent = useThreadStore((s) => s.removeAgent);
  const setAgentStatus = useThreadStore((s) => s.setAgentStatus);
  const updateAgentGitInfo = useThreadStore((s) => s.updateAgentGitInfo);
  const updateAgentPrStatus = useThreadStore((s) => s.updateAgentPrStatus);
  const projectPath = useAppStore((s) => s.projectPath);
  const accent = statusColor(agent);
  const statusVisual = agentStatusVisual(agent);
  const StatusIcon = statusVisual.icon;

  const threadId = agent.codexThreadId ?? null;
  const canArchive = Boolean(threadId);
  const canRunGitActions = Boolean(projectPath);
  const modelsUsed = agent.modelsUsed ?? [];

  const [detectedPrUrl, setDetectedPrUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!projectPath) return;
    let cancelled = false;
    invoke<{ number: string; url: string } | null>("get_branch_pr", {
      path: projectPath,
    })
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setDetectedPrUrl(null);
          return;
        }
        setDetectedPrUrl(result.url);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [projectPath, agent.branch]);

  const existingPrUrl = currentPrUrl(agent) ?? detectedPrUrl;
  const prUrl = existingPrUrl ?? comparePrUrl(agent);
  const prActionLabel = existingPrUrl ? "Open PR" : "Create PR";

  useEffect(() => {
    if (!projectPath) return;
    invoke<{
      checksState: "success" | "failure" | "pending" | "none";
      approvals: number;
      comments: number;
      mergeable: boolean;
      prNumber: number | null;
      prUrl: string | null;
    } | null>("github_get_pr_status", { path: projectPath })
      .then((prStatus) => {
        updateAgentPrStatus(agent.id, prStatus);
      })
      .catch(() => {
        updateAgentPrStatus(agent.id, null);
      });
  }, [agent.id, agent.branch, projectPath, updateAgentPrStatus]);

  async function refreshGitInfo() {
    if (!projectPath) return;
    try {
      const info = await invoke<{
        branch?: string | null;
        sha?: string | null;
        originUrl?: string | null;
      }>("get_git_info", { path: projectPath });
      updateAgentGitInfo(agent.id, {
        branch: info.branch ?? undefined,
        sha: info.sha ?? undefined,
        originUrl: info.originUrl ?? undefined,
      });
      const prStatus = await invoke<{
        checksState: "success" | "failure" | "pending" | "none";
        approvals: number;
        comments: number;
        mergeable: boolean;
        prNumber: number | null;
        prUrl: string | null;
      } | null>("github_get_pr_status", { path: projectPath });
      updateAgentPrStatus(agent.id, prStatus);
    } catch {
      // ignore
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
      setActionError(e instanceof Error ? e.message : "Archive failed");
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
      setActionError(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setActionBusy(null);
    }
  }

  async function runCommit() {
    if (!projectPath || gitBusy !== null) return;
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
    if (!projectPath) return;
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
      await invoke("git_create_branch", {
        path: projectPath,
        name: newBranchName.trim(),
      });
      setNewBranchName("");
      setGitDialog(null);
      await refreshGitInfo();
    } catch (e) {
      setGitError(e instanceof Error ? e.message : "Create branch failed");
    } finally {
      setGitBusy(null);
    }
  }

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
          {modelsUsed.length > 0 && (
            <span className="text-[10px] text-text-faint">
              {modelsUsed.join(", ")}
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

      {/* Tab content — same horizontal inset as header (px-6) */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-auto px-6 py-6 min-h-0">
        {tab === "status" && (
          <div className="flex flex-col gap-5">
            <AgentPlanBlock steps={agent.planSteps ?? []} />

            <div className="grid grid-cols-2 gap-2.5">
              <StatCard label="Time" value={getAgentTimeLabel(agent)} />
              <StatCard label="Tokens" value={getAgentTokenLabel(agent)} />
            </div>

            <GitOverviewCard
              prStatus={agent.prStatus ?? null}
              prUrl={prUrl}
              existingPrUrl={existingPrUrl}
              prActionLabel={prActionLabel}
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
              gitDisabled={!canRunGitActions || gitBusy !== null}
            />
          </div>
        )}

        {tab === "chat" && (
          <div className="flex flex-col h-full min-h-0">
            <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-auto mb-3">
              {agent.messages.length === 0 ? (
                <div className="text-sm text-text-faint italic">
                  No messages yet.
                </div>
              ) : (
                agent.messages.map((m, i) =>
                  m.role === "you" ? (
                    <div key={i} className="flex justify-end">
                      <div className="max-w-[95%] px-2.5 py-2 rounded-[10px] bg-bg-user-message border border-border-user-message text-text-primary text-[13px] leading-relaxed whitespace-pre-wrap">
                        {m.content}
                      </div>
                    </div>
                  ) : (
                    <div
                      key={i}
                      className="px-3 py-2.5 bg-bg-secondary/80 rounded-lg"
                    >
                      <div className="font-mono text-[9px] font-semibold uppercase tracking-label-wide text-text-faint mb-1.5">
                        agent
                      </div>
                      <div className="text-[13px] text-text-primary leading-relaxed whitespace-pre-wrap">
                        {m.content}
                      </div>
                    </div>
                  ),
                )
              )}
            </div>

            {onOpenChat && (
              <button
                type="button"
                onClick={onOpenChat}
                className="font-sans text-[12.5px] text-[var(--text-links)] flex items-center gap-0.5 bg-transparent border-0 cursor-pointer p-0 py-2 text-left shrink-0 transition-[filter] duration-150 hover:brightness-[0.88] dark:hover:brightness-[0.92]"
              >
                <span>Open full view</span>
                <OpenFullViewArrow />
              </button>
            )}

            <div className="flex items-center gap-2 px-3 py-2.5 bg-bg-card border border-border rounded shrink-0">
              <input
                placeholder="Quick message..."
                className="flex-1 bg-transparent border-none outline-none text-text-primary text-sm"
              />
              <span className="kbd-badge cursor-pointer">↵</span>
            </div>
          </div>
        )}

        {tab === "files" && (
          <div className="flex flex-col gap-1">
            {agent.files.length === 0 ? (
              <div className="text-sm text-text-faint italic">
                No files changed.
              </div>
            ) : (
              agent.files.map((f, i) => (
                <div
                  key={i}
                  className="font-mono text-[11.5px] text-text-secondary px-2.5 py-[7px] bg-bg-card border border-border-light rounded-[5px]"
                >
                  {f}
                </div>
              ))
            )}
          </div>
        )}
        </div>

        <div className="shrink-0 px-6 py-4 space-y-2">
          {actionError && (
            <p className="text-[11px] text-accent-red leading-snug">{actionError}</p>
          )}
          {gitError && gitDialog === null ? (
            <p className="text-[11px] text-accent-red leading-snug">{gitError}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={agent.status === "deployed"}
              onClick={markDone}
              title="Move this thread to done"
              className={cn(
                "inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-[7px] text-[11.5px] font-medium text-white transition-all duration-120",
                agent.status === "deployed"
                  ? "opacity-60 cursor-default"
                  : "cursor-pointer hover:brightness-95",
              )}
              style={{ backgroundColor: "#5F6AD3" }}
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
                "inline-flex items-center justify-center gap-1.5 rounded-md border px-3.5 py-[7px] text-[11.5px] font-medium transition-colors duration-120",
                "border-border-default text-text-secondary hover:bg-bg-secondary/80",
                (!canArchive || actionBusy !== null) && "opacity-40 pointer-events-none cursor-not-allowed",
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
                "inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-[7px] text-[11.5px] font-medium transition-colors duration-120",
                "bg-accent-red text-white hover:brightness-95",
                actionBusy !== null && "opacity-50 pointer-events-none cursor-not-allowed",
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
