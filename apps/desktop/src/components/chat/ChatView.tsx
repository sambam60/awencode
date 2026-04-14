import React, {
  useRef,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Clock,
  GitBranch,
  GitCommit,
  GitPullRequest,
  CloudUpload,
  Box,
  Terminal,
  FolderOpen,
  FileDiff,
  GitFork,
  Shield,
  FolderTree,
  Square,
  Code2,
} from "lucide-react";
import { ComposeArea, type Attachment } from "./ComposeArea";
import {
  MessageRow,
  ActivityFeed,
  StreamingMessage,
  ThinkingIndicator,
  STREAMING_THINKING_ACTIVITY_ID,
} from "./chat-message-rendering";
import { agentStatusVisual, statusColor } from "@/lib/status";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { rpcRequest, rpcRespond } from "@/lib/rpc-client";
import { interruptTurn } from "@/lib/codex-turn";
import { sendChatTurn } from "@/lib/send-chat-turn";
import { submitPromptEditRevert } from "@/lib/submit-prompt-edit";
import { isDefaultGitBranch, type ProjectGitInfo } from "@/lib/git";
import { useAppStore } from "@/lib/stores/app-store";
import { useChatUiStore } from "@/lib/stores/chat-ui-store";
import { useSettingsStore } from "@/lib/stores/settings-store";
import { useViewStore } from "@/lib/stores/view-store";
import { useProjectGitStore } from "@/lib/stores/project-git-store";
import { useThreadStore } from "@/lib/stores/thread-store";
import { useAppListStore } from "@/lib/stores/app-list-store";
import {
  type Agent,
  type AgentMessage,
} from "@/lib/stores/thread-store";
import type { LinearIssue } from "@/lib/linear";
import { FileTreeView } from "./FileTreeView";
import { DiffPanel } from "./DiffPanel";
import { QueuedMessagesPanel } from "./QueuedMessagesPanel";
import {
  getAgentContextPercent,
  getAgentDiffStats,
  getAgentTimeLabel,
  getAgentTokenLabel,
} from "@/lib/agent-metrics";

interface ChatViewProps {
  agent: Agent;
  onBack: () => void;
}

function shouldDiscardQueuedAgent(agentId: string): boolean {
  const queuedAgent = useThreadStore
    .getState()
    .agents.find((candidate) => candidate.id === agentId);
  if (!queuedAgent || queuedAgent.status !== "queued") return false;
  if (queuedAgent.messages.length > 0) return false;
  const draft = useChatUiStore.getState().composeDraftByAgentId[agentId] ?? "";
  return draft.trim().length === 0;
}

function ChatEdgeBlurOverlays() {
  return (
    <>
      {/* Top edge blur (under nav header). No bottom blur: it stopped at the scroll/composer
          boundary and read as a flat bg-primary “fill” above the compose card. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-24" aria-hidden="true">
        <div
          className="absolute inset-0 backdrop-blur-[1px]"
          style={{ maskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)" }}
        />
        <div
          className="absolute inset-0 backdrop-blur-[2px]"
          style={{ maskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 70%)" }}
        />
        <div
          className="absolute inset-0 backdrop-blur-[4px]"
          style={{ maskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 50%)" }}
        />
        <div
          className="absolute inset-0 backdrop-blur-[8px]"
          style={{ maskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 35%)" }}
        />
      </div>
    </>
  );
}

function ContextUsageIcon({ percent }: { percent: number | null }) {
  const r = 4;
  const c = 2 * Math.PI * r;
  const cx = 6;
  const cy = 6;
  const p = percent == null ? 0 : Math.min(100, Math.max(0, percent));
  const offset = c - (p / 100) * c;
  const empty = percent == null;
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" className="shrink-0" aria-hidden>
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

function HeaderMetaItem({
  icon,
  value,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 min-w-0 max-w-[9rem]">
      <span className="shrink-0 w-3 flex justify-center text-text-tertiary [&>svg]:block">
        {icon}
      </span>
      <span className="min-w-0 font-sans text-[11px] text-text-secondary leading-none truncate">
        {value}
      </span>
    </div>
  );
}

const FILE_TREE_DEFAULT_WIDTH_PX = 244;
const FILE_TREE_MIN_WIDTH_PX = 216;
const FILE_TREE_MAX_WIDTH_PX = 360;
const DIFF_PANEL_DEFAULT_WIDTH_PX = 340;
const DIFF_PANEL_MIN_WIDTH_PX = 280;
const DIFF_PANEL_MAX_WIDTH_PX = 600;

// ─── Git button ───────────────────────────────────────────────────────────────

function GitButton({
  pr,
  projectPath,
  branch,
  originUrl,
  gitInfo,
  onGitAction,
  onCommitSuccess,
  onBranchCreated,
}: {
  pr: string | null;
  projectPath: string | null;
  branch: string;
  originUrl?: string | null;
  gitInfo: ProjectGitInfo | null;
  onGitAction: () => void;
  onCommitSuccess?: () => void;
  onBranchCreated?: (branch: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [commitOpen, setCommitOpen] = useState(false);
  const [commitBusy, setCommitBusy] = useState(false);
  const [createBranchOpen, setCreateBranchOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [gitError, setGitError] = useState<string | null>(null);
  const [detectedPrUrl, setDetectedPrUrl] = useState<string | null>(null);

  const currentBranch = gitInfo?.branch?.trim() ?? "";
  const onThreadBranch = Boolean(branch.trim()) && currentBranch === branch.trim();
  const needsPublish = onThreadBranch && Boolean(gitInfo?.needsPublish);
  const onDefaultBranch = isDefaultGitBranch(branch);
  const hasPr = onDefaultBranch ? false : (Boolean(pr) || Boolean(detectedPrUrl));
  const canCreatePr = !hasPr && !onDefaultBranch && Boolean(branch.trim()) && !needsPublish;
  const pushLabel = needsPublish ? "Publish branch" : "Push";
  const prTitle = !hasPr && onDefaultBranch
    ? "Create a feature branch first to open a PR"
    : !hasPr && needsPublish
      ? "Publish this branch before opening a PR"
      : undefined;

  useEffect(() => {
    if (!projectPath || onDefaultBranch) {
      setDetectedPrUrl(null);
      return;
    }
    let cancelled = false;
    invoke<{ number: number; url: string } | null>("get_branch_pr", {
      path: projectPath,
      branch: branch || null,
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
  }, [projectPath, branch, onDefaultBranch]);

  const handleCommit = async () => {
    if (!projectPath || commitBusy) return;
    setGitError(null);
    setCommitBusy(true);
    try {
      await invoke("git_commit", {
        path: projectPath,
        message: commitMessage.trim(),
      });
      onCommitSuccess?.();
      setCommitOpen(false);
      setCommitMessage("");
      onGitAction();
    } catch (e) {
      setGitError(e instanceof Error ? e.message : String(e));
    } finally {
      setCommitBusy(false);
    }
  };

  const handlePush = async () => {
    setOpen(false);
    if (!projectPath) return;
    setGitError(null);
    try {
      await invoke("git_push", { path: projectPath });
      onGitAction();
    } catch (e) {
      setGitError(e instanceof Error ? e.message : String(e));
    }
  };

  const handlePRAction = async () => {
    setOpen(false);
    if (!projectPath) return;
    try {
      if (detectedPrUrl) {
        await invoke("open_url", { url: detectedPrUrl });
        return;
      }

      const url = gitInfo?.originUrl ?? originUrl ?? null;
      if (!url) return;
      const m = url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
      if (!m) return;
      const repo = m[1];

      if (pr) {
        const prNum = pr.replace(/^#/, "");
        await invoke("open_url", {
          url: `https://github.com/${repo}/pull/${encodeURIComponent(prNum)}`,
        });
      } else if (branch && !onDefaultBranch) {
        await invoke("open_url", {
          url: `https://github.com/${repo}/compare/${encodeURIComponent(branch)}?expand=1`,
        });
      }
    } catch {
      // ignore
    }
  };

  const handleCreateBranch = async () => {
    if (!projectPath || !newBranchName.trim()) return;
    setGitError(null);
    try {
      await invoke("git_create_branch", {
        path: projectPath,
        name: newBranchName.trim(),
      });
      onBranchCreated?.(newBranchName.trim());
      setCreateBranchOpen(false);
      setNewBranchName("");
      onGitAction();
    } catch (e) {
      setGitError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[11px] font-sans transition-colors duration-120 cursor-pointer",
          hasPr
            ? "border-[#3a9d63]/40 text-[#3a9d63] bg-[#3a9d63]/6 hover:bg-[#3a9d63]/10"
            : "border-border-default text-text-secondary bg-bg-secondary hover:bg-bg-card",
        )}
      >
        {hasPr ? <GitPullRequest size={12} /> : <GitBranch size={12} />}
        {pr && <span>{pr}</span>}
        {branch && !pr && <span>{branch}</span>}
        <ChevronDown size={9} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-52 rounded-lg glass-overlay z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-border-light">
            <div className="font-sans text-[9.5px] text-text-faint uppercase tracking-widest mb-0.5">
              current branch
            </div>
            <div className="flex items-center gap-1.5">
              <GitBranch size={10} className="text-text-tertiary shrink-0" />
              <span className="font-sans text-[11px] text-text-primary truncate">
                {currentBranch || branch || "—"}
              </span>
            </div>
          </div>
          <button
            onClick={() => {
              setOpen(false);
              setCreateBranchOpen(true);
              setGitError(null);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 glass-menu-row cursor-pointer text-left outline-none"
          >
            <GitFork size={12} className="text-text-faint shrink-0" />
            <span className="text-[12px] text-text-primary">Create branch</span>
          </button>
          <button
            onClick={() => {
              setOpen(false);
              setCommitOpen(true);
              setGitError(null);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 glass-menu-row cursor-pointer text-left outline-none"
          >
            <GitCommit size={12} className="text-text-faint shrink-0" />
            <span className="text-[12px] text-text-primary">Commit</span>
          </button>
          <button
            onClick={handlePush}
            className="w-full flex items-center gap-2.5 px-3 py-2 glass-menu-row cursor-pointer text-left outline-none"
          >
            <CloudUpload size={12} className="text-text-faint shrink-0" />
            <span className="text-[12px] text-text-primary">{pushLabel}</span>
          </button>
          <div className="border-t border-border-light" role="separator" />
          <button
            onClick={handlePRAction}
            disabled={!hasPr && !canCreatePr}
            title={prTitle}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2 text-left outline-none",
              !hasPr && !canCreatePr
                ? "opacity-45 cursor-not-allowed"
                : "glass-menu-row cursor-pointer",
            )}
          >
            <img
              src="/octicon.svg"
              alt=""
              className="w-3 h-3 shrink-0 opacity-40 dark:invert"
            />
            <span className="text-[12px] text-text-primary">
              {hasPr ? "Open PR on GitHub" : "Create PR on GitHub"}
            </span>
          </button>
        </div>
      )}
      {/* Create branch modal */}
      {createBranchOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20"
            onClick={() => setCreateBranchOpen(false)}
          />
          <div className="fixed left-1/2 top-1/2 z-50 w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border-default bg-bg-card p-4 shadow-[0_12px_40px_rgba(0,0,0,0.06)]">
            <div className="font-mono text-[10px] text-text-faint uppercase tracking-widest mb-2">
              New branch name
            </div>
            <input
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateBranch()}
              placeholder="feat/my-feature"
              className="w-full px-3 py-2 rounded-md border border-border-default bg-bg-input text-[13px] text-text-primary placeholder:text-text-faint mb-3 font-mono"
            />
            {gitError && (
              <p className="text-[11px] text-accent-red mb-2">{gitError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setCreateBranchOpen(false)}
                className="px-3 py-1.5 text-[11.5px] text-text-secondary border border-border-default rounded-md hover:bg-bg-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateBranch}
                disabled={!newBranchName.trim()}
                className="px-3 py-1.5 text-[11.5px] font-medium bg-text-primary text-bg-card rounded-md hover:opacity-90 disabled:opacity-50"
              >
                Create branch
              </button>
            </div>
          </div>
        </>
      )}
      {/* Commit modal */}
      {commitOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20"
            onClick={() => setCommitOpen(false)}
          />
          <div className="fixed left-1/2 top-1/2 z-50 w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border-default bg-bg-card p-4 shadow-[0_12px_40px_rgba(0,0,0,0.06)]">
            <div className="font-mono text-[10px] text-text-faint uppercase tracking-widest mb-2">
              Commit message
            </div>
            <input
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCommit()}
              placeholder="Leave empty to auto-generate..."
              disabled={commitBusy}
              className="w-full px-3 py-2 rounded-md border border-border-default bg-bg-input text-[13px] text-text-primary placeholder:text-text-faint mb-3 disabled:opacity-60"
            />
            {gitError && (
              <p className="text-[11px] text-accent-red mb-2">{gitError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setCommitOpen(false)}
                disabled={commitBusy}
                className="px-3 py-1.5 text-[11.5px] text-text-secondary border border-border-default rounded-md hover:bg-bg-secondary disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCommit}
                disabled={commitBusy}
                className="px-3 py-1.5 text-[11.5px] font-medium bg-text-primary text-bg-card rounded-md hover:opacity-90 disabled:opacity-50"
              >
                {commitBusy
                  ? commitMessage.trim()
                    ? "Committing\u2026"
                    : "Generating\u2026"
                  : "Commit"}
              </button>
            </div>
          </div>
        </>
      )}
      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
      )}
    </div>
  );
}

// ─── App icon map ─────────────────────────────────────────────────────────────

const APP_ICON_MAP: Record<string, typeof Box> = {
  cursor: Box,
  ghostty: Terminal,
  vscode: Code2,
  code: Code2,
  visualstudio: Code2,
  xcode: Code2,
  terminal: Terminal,
  finder: FolderOpen,
};

// ─── Open-in button ───────────────────────────────────────────────────────────

function OpenInButton({ linkedLinearIssues }: { linkedLinearIssues?: LinearIssue[] }) {
  const [open, setOpen] = useState(false);
  const [appIcons, setAppIcons] = useState<Record<string, string>>({});
  const [detectedApps, setDetectedApps] = useState<
    Array<{ id: string; name: string; isAccessible: boolean }>
  >([]);
  const projectPath = useAppStore((s) => s.projectPath);
  const apps = useAppListStore((s) => s.apps);
  const resolvedList = useMemo(
    () => (detectedApps.length > 0 ? detectedApps : apps),
    [apps, detectedApps],
  );
  const linearDesktopDetected = useMemo(
    () =>
      resolvedList.some(
        (app) => app.id.toLowerCase() === "linear" && app.isAccessible,
      ),
    [resolvedList],
  );
  const primaryLinearIssueUrl = useMemo(() => {
    const list = linkedLinearIssues ?? [];
    const withUrl = list.find((i) => i.url?.trim());
    return withUrl?.url?.trim() ?? "";
  }, [linkedLinearIssues]);
  const showLinearInMenu = linearDesktopDetected && primaryLinearIssueUrl.length > 0;
  const menuApps = useMemo(() => {
    const accessible = resolvedList.filter((app) => app.isAccessible);
    const withoutLinear = accessible.filter((app) => app.id.toLowerCase() !== "linear");
    if (showLinearInMenu) {
      return [
        ...withoutLinear,
        { id: "linear", name: "Linear", isAccessible: true },
      ];
    }
    return withoutLinear;
  }, [resolvedList, showLinearInMenu]);

  useEffect(() => {
    invoke<Array<{ id: string; name: string; isAccessible: boolean }>>(
      "detect_open_apps",
    )
      .then((localApps) => {
        if (Array.isArray(localApps)) setDetectedApps(localApps);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const resolveIcons = async () => {
      const entries = await Promise.all(
        menuApps.map(async (app) => {
          try {
            const iconDataUrl = await invoke<string | null>("resolve_app_icon", {
              appId: app.id,
              appName: app.name,
            });
            return [app.id, iconDataUrl] as const;
          } catch {
            return [app.id, null] as const;
          }
        }),
      );
      if (cancelled) return;
      setAppIcons((prev) => {
        const next = { ...prev };
        for (const [appId, iconDataUrl] of entries) {
          if (iconDataUrl) next[appId] = iconDataUrl;
        }
        return next;
      });
    };
    resolveIcons().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [menuApps]);

  const handleOpenIn = async (appId: string) => {
    setOpen(false);
    if (appId.toLowerCase() === "linear") {
      if (!primaryLinearIssueUrl) return;
      try {
        await invoke("open_linear_desktop_url", { url: primaryLinearIssueUrl });
      } catch {
        // ignore
      }
      return;
    }
    const path = projectPath;
    if (!path) return;
    try {
      await invoke("open_in_app", { appId, path });
    } catch {
      // ignore
    }
  };

  const firstApp = menuApps[0];
  const triggerIconUrl = firstApp ? appIcons[firstApp.id] : undefined;
  const TriggerIcon = firstApp
    ? (APP_ICON_MAP[firstApp.id.toLowerCase()] ?? Box)
    : Box;
  const triggerLinearWordmark =
    firstApp?.id.toLowerCase() === "linear" && !triggerIconUrl;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border-default text-text-secondary bg-bg-secondary hover:bg-bg-card text-[11px] font-mono transition-colors duration-120 cursor-pointer"
        aria-label="Open in"
      >
        {triggerIconUrl ? (
          <img
            src={triggerIconUrl}
            alt=""
            className="w-4 h-4 rounded-[2px] shrink-0 object-contain"
          />
        ) : triggerLinearWordmark ? (
          <img
            src="/linear_wordmark.svg"
            alt=""
            className="h-3 w-auto max-w-[52px] shrink-0 opacity-50 invert dark:invert-0"
          />
        ) : (
          <TriggerIcon size={12} className="shrink-0" />
        )}
        <ChevronDown size={9} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-44 rounded-lg glass-overlay z-50 overflow-hidden">
          {menuApps.map((app) => {
            const Icon = APP_ICON_MAP[app.id.toLowerCase()] ?? Box;
            const iconDataUrl = appIcons[app.id];
            const isLinear = app.id.toLowerCase() === "linear";
            const rowDisabled = isLinear ? !primaryLinearIssueUrl : !projectPath;
            return (
              <button
                key={app.id}
                onClick={() => handleOpenIn(app.id)}
                disabled={rowDisabled}
                className="w-full flex items-center gap-2.5 px-3 py-2 glass-menu-row cursor-pointer text-left outline-none disabled:opacity-50 disabled:cursor-default"
              >
                {iconDataUrl ? (
                  <img
                    src={iconDataUrl}
                    alt=""
                    className="w-4 h-4 rounded-[3px] shrink-0 object-contain"
                  />
                ) : isLinear ? (
                  <img
                    src="/linear_wordmark.svg"
                    alt=""
                    className="h-3 w-auto max-w-[72px] shrink-0 opacity-40 invert dark:invert-0"
                  />
                ) : (
                  <Icon size={24} className="text-text-faint shrink-0" />
                )}
                <span className="text-[12px] text-text-primary">{app.name}</span>
              </button>
            );
          })}
        </div>
      )}
      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
      )}
    </div>
  );
}

// ─── Diff button ──────────────────────────────────────────────────────────────

function DiffButton({ fileCount, active, onClick }: { fileCount: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={() => fileCount > 0 && onClick()}
      title={fileCount > 0 ? "Toggle diff panel" : "No changed files"}
      className={cn(
        "flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[11px] transition-colors duration-120",
        active
          ? "border-border-focus text-text-primary bg-bg-card cursor-pointer"
          : fileCount > 0
            ? "border-border-default text-text-secondary bg-bg-secondary hover:bg-bg-card cursor-pointer"
            : "border-border-light text-text-faint bg-bg-secondary cursor-default",
      )}
      disabled={fileCount === 0}
    >
      <FileDiff size={12} strokeWidth={1.75} className="shrink-0" />
      <span
        className={cn(
          "font-sans leading-none tabular-nums",
          active ? "text-text-primary" : fileCount > 0 ? "text-text-secondary" : "text-text-faint",
        )}
      >
        {fileCount}
      </span>
    </button>
  );
}

// ─── Main ChatView ────────────────────────────────────────────────────────────

export function ChatView({ agent, onBack }: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const accent = statusColor(agent);
  const projectPath = useAppStore((s) => s.projectPath);
  const projectGitInfo = useProjectGitStore((s) => (projectPath ? s.byProjectPath[projectPath] ?? null : null));
  const refreshProjectGitInfo = useProjectGitStore((s) => s.refreshProjectGitInfo);
  const appProjectName = useAppStore((s) => s.projectName);
  const clearWorkspace = useAppStore((s) => s.clearWorkspace);
  const view = useViewStore((s) => s.view);
  const setView = useViewStore((s) => s.setView);
  const addAgent = useThreadStore((s) => s.addAgent);
  const setAgentStatus = useThreadStore((s) => s.setAgentStatus);
  const updateAgentDiff = useThreadStore((s) => s.updateAgentDiff);
  const updateAgentGitInfo = useThreadStore((s) => s.updateAgentGitInfo);
  const updateAgentPrStatus = useThreadStore((s) => s.updateAgentPrStatus);
  const setAgentPendingApproval = useThreadStore((s) => s.setAgentPendingApproval);
  const replaceUserMessageContent = useThreadStore((s) => s.replaceUserMessageContent);

  const discardBlankQueuedAgent = useCallback(() => {
    if (!shouldDiscardQueuedAgent(agent.id)) return;
    useChatUiStore.getState().setComposeDraft(agent.id, "");
    useThreadStore.getState().removeAgent(agent.id);
  }, [agent.id]);

  const clearApproval = useCallback(() => {
    setAgentPendingApproval(agent.id, null);
  }, [agent.id, setAgentPendingApproval]);

  // Scroll to bottom on new messages / streaming updates / approval
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [agent.messages.length, agent.streamingBuffer, agent.pendingApproval]);

  useEffect(() => {
    const branch = projectGitInfo?.branch ?? null;
    const sha = projectGitInfo?.sha ?? null;
    const originUrl = projectGitInfo?.originUrl ?? null;
    if (!branch && !sha && !originUrl) return;

    updateAgentGitInfo(agent.id, {
      ...(!agent.branch.trim() && branch ? { branch } : {}),
      sha: sha ?? undefined,
      originUrl: originUrl ?? undefined,
    });
    if (!agent.codexThreadId) return;

    void rpcRequest("thread/metadata/update", {
      threadId: agent.codexThreadId,
      gitInfo: {
        branch: agent.branch || branch || undefined,
        sha: sha ?? undefined,
        originUrl: originUrl ?? undefined,
      },
    }).catch(() => {});
  }, [
    agent.id,
    agent.branch,
    agent.codexThreadId,
    projectGitInfo?.branch,
    projectGitInfo?.sha,
    projectGitInfo?.originUrl,
    updateAgentGitInfo,
  ]);

  useEffect(() => {
    if (!projectPath) return;
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
      .catch(() => {
        updateAgentPrStatus(agent.id, null);
      });
  }, [agent.id, agent.branch, projectPath, updateAgentPrStatus]);

  const enqueueMessage = useChatUiStore((s) => s.enqueueMessage);

  const handleSend = useCallback(
    async (message: string, attachments: Attachment[]) => {
      const current = useThreadStore.getState().agents.find((a) => a.id === agent.id);
      if (current?.turnInProgress && attachments.length === 0) {
        enqueueMessage(agent.id, message);
        return;
      }
      await sendChatTurn(agent.id, message, attachments);
    },
    [agent.id, enqueueMessage],
  );

  const prevTurnInProgressRef = useRef(agent.turnInProgress);
  useEffect(() => {
    const wasBusy = prevTurnInProgressRef.current;
    prevTurnInProgressRef.current = agent.turnInProgress;
    if (!wasBusy || agent.turnInProgress) {
      return;
    }

    const next = useChatUiStore.getState().dequeueMessage(agent.id);
    if (!next) {
      return;
    }

    let cancelled = false;
    void sendChatTurn(agent.id, next.text, []).catch((error) => {
      if (!cancelled) {
        console.error("Failed to send dequeued message", error);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [agent.turnInProgress, agent.id]);

  const [stopping, setStopping] = useState(false);
  const [promptEdit, setPromptEdit] = useState<{
    messageIndex: number;
    seedText: string;
  } | null>(null);
  const [editConfirm, setEditConfirm] = useState<{
    messageIndex: number;
    text: string;
    attachments: Attachment[];
  } | null>(null);
  const [composeSessionKey, setComposeSessionKey] = useState(0);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const fileTreeOpen = useChatUiStore(
    (s) => s.fileTreeOpenByAgentId[agent.id] ?? false,
  );
  const setAgentFileTreeOpen = useChatUiStore((s) => s.setAgentFileTreeOpen);
  const [fileTreeMounted, setFileTreeMounted] = useState(() => fileTreeOpen);
  const [fileTreeWidth, setFileTreeWidth] = useState(FILE_TREE_DEFAULT_WIDTH_PX);
  const [isResizingFileTree, setIsResizingFileTree] = useState(false);

  const diffPanelOpen = useChatUiStore(
    (s) => s.diffPanelOpenByAgentId[agent.id] ?? false,
  );
  const setAgentDiffPanelOpen = useChatUiStore((s) => s.setAgentDiffPanelOpen);
  const [diffPanelMounted, setDiffPanelMounted] = useState(() => diffPanelOpen);
  const [diffPanelWidth, setDiffPanelWidth] = useState(DIFF_PANEL_DEFAULT_WIDTH_PX);
  const [isResizingDiffPanel, setIsResizingDiffPanel] = useState(false);

  interface GitDiffFile { path: string; additions: number; deletions: number; staged: boolean }
  interface GitDiffData { diff: string; fileCount: number; additions: number; deletions: number; files: GitDiffFile[] }
  const [gitDiff, setGitDiff] = useState<GitDiffData | null>(null);
  const [gitDiffVersion, setGitDiffVersion] = useState(0);

  const refreshGitDiff = useCallback(() => {
    setGitDiffVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!projectPath) return;
    let cancelled = false;
    const fetchDiff = () => {
      invoke<GitDiffData>(
        "get_git_diff",
        { path: projectPath, branch: agent.branch ? `origin/${agent.branch}` : null },
      )
        .then((result) => { if (!cancelled) setGitDiff(result); })
        .catch(() => { if (!cancelled) setGitDiff(null); });
    };
    fetchDiff();
    const interval = setInterval(fetchDiff, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [projectPath, agent.branch, agent.status, agent.turnInProgress, gitDiffVersion]);

  useEffect(() => {
    if (fileTreeOpen) {
      setFileTreeMounted(true);
      return;
    }
    const t = window.setTimeout(() => setFileTreeMounted(false), 200);
    return () => window.clearTimeout(t);
  }, [fileTreeOpen]);

  useEffect(() => {
    if (diffPanelOpen) {
      setDiffPanelMounted(true);
      return;
    }
    const t = window.setTimeout(() => setDiffPanelMounted(false), 200);
    return () => window.clearTimeout(t);
  }, [diffPanelOpen]);

  const toggleFileTree = useCallback(() => {
    setAgentFileTreeOpen(agent.id, !fileTreeOpen);
  }, [agent.id, fileTreeOpen, setAgentFileTreeOpen]);

  const toggleDiffPanel = useCallback(() => {
    setAgentDiffPanelOpen(agent.id, !diffPanelOpen);
  }, [agent.id, diffPanelOpen, setAgentDiffPanelOpen]);

  const handleFileTreeResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!fileTreeOpen) return;
      event.preventDefault();

      const startX = event.clientX;
      const startWidth = fileTreeWidth;
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;

      setIsResizingFileTree(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const nextWidth = Math.min(
          FILE_TREE_MAX_WIDTH_PX,
          Math.max(
            FILE_TREE_MIN_WIDTH_PX,
            startWidth + moveEvent.clientX - startX,
          ),
        );
        setFileTreeWidth(nextWidth);
      };

      const stopResizing = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", stopResizing);
        window.removeEventListener("pointercancel", stopResizing);
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        setIsResizingFileTree(false);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", stopResizing);
      window.addEventListener("pointercancel", stopResizing);
    },
    [fileTreeOpen, fileTreeWidth],
  );

  const handleDiffPanelResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!diffPanelOpen) return;
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = diffPanelWidth;
      const prevCursor = document.body.style.cursor;
      const prevUserSelect = document.body.style.userSelect;
      setIsResizingDiffPanel(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      const onMove = (e: PointerEvent) => {
        const next = Math.min(DIFF_PANEL_MAX_WIDTH_PX, Math.max(DIFF_PANEL_MIN_WIDTH_PX, startWidth - (e.clientX - startX)));
        setDiffPanelWidth(next);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevUserSelect;
        setIsResizingDiffPanel(false);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [diffPanelOpen, diffPanelWidth],
  );

  const handleStop = useCallback(async () => {
    const tid = agent.codexThreadId;
    const turnId = agent.currentTurnId;
    if (!tid || !turnId) return;
    setStopping(true);
    try {
      await interruptTurn(tid, turnId);
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
    } catch {
      // ignore
    } finally {
      setStopping(false);
    }
  }, [agent.id, agent.codexThreadId, agent.currentTurnId]);

  const handleAcceptReview = useCallback(() => {
    setAgentStatus(agent.id, "deployed");
  }, [agent.id, setAgentStatus]);

  const handleRejectReview = useCallback(() => {
    updateAgentDiff(agent.id, null, []);
  }, [agent.id, updateAgentDiff]);

  // ⌘Enter → accept pending approval
  useEffect(() => {
    if (!agent.pendingApproval) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === "Enter") {
        e.preventDefault();
        const approval = agent.pendingApproval;
        if (!approval) return;
        if (approval.type === "permissions") {
          rpcRespond(approval.rpcId, {
            permissions: approval.permissions ?? {},
            scope: "turn",
          }).then(clearApproval).catch(console.error);
        } else {
          rpcRespond(approval.rpcId, { decision: "accept" })
            .then(clearApproval)
            .catch(console.error);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [agent.pendingApproval, clearApproval]);

  // Marking a thread done should not block follow-up chat.
  const canCompose = true;
  const setComposeDraft = useChatUiStore((s) => s.setComposeDraft);

  useEffect(() => {
    setPromptEdit(null);
    setEditConfirm(null);
  }, [agent.id]);

  const promptEditEnabled = canCompose && !agent.turnInProgress;

  const handleBeginPromptEdit = useCallback(
    (messageIndex: number, text: string) => {
      setPromptEdit({ messageIndex, seedText: text });
    },
    [],
  );

  const handleCancelPromptEdit = useCallback(() => {
    setPromptEdit(null);
    setEditConfirm(null);
    setComposeSessionKey((k) => k + 1);
    if (agent.status === "queued") {
      setComposeDraft(agent.id, "");
    }
  }, [agent.id, agent.status, setComposeDraft]);

  const handlePromptEditSubmit = useCallback(
    (text: string, attachments: Attachment[]) => {
      setPromptEdit((pe) => {
        if (!pe) return pe;
        setEditConfirm({
          messageIndex: pe.messageIndex,
          text,
          attachments,
        });
        return pe;
      });
    },
    [],
  );

  const applyEditKeep = useCallback(() => {
    if (!editConfirm) return;
    replaceUserMessageContent(agent.id, editConfirm.messageIndex, editConfirm.text);
    setEditConfirm(null);
    setPromptEdit(null);
    setComposeSessionKey((k) => k + 1);
    setComposeDraft(agent.id, "");
  }, [agent.id, editConfirm, replaceUserMessageContent, setComposeDraft]);

  const applyEditRevert = useCallback(async () => {
    if (!editConfirm) return;
    setEditSubmitting(true);
    try {
      await submitPromptEditRevert(
        agent.id,
        editConfirm.messageIndex,
        editConfirm.text,
        editConfirm.attachments,
      );
      setEditConfirm(null);
      setPromptEdit(null);
      setComposeSessionKey((k) => k + 1);
    } finally {
      setEditSubmitting(false);
    }
  }, [agent.id, editConfirm]);

  const handleDismissEditConfirm = useCallback(() => {
    setEditConfirm(null);
  }, []);

  useEffect(() => {
    if (!editConfirm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setEditConfirm(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editConfirm]);

  const isThinking =
    agent.turnInProgress &&
    !agent.streamingBuffer &&
    agent.messages[agent.messages.length - 1]?.role === "you";
  const hasPlan = (agent.planSteps?.length ?? 0) > 0;

  const hasInlineThinkingStream =
    agent.activities?.some(
      (a) => a.id === STREAMING_THINKING_ACTIVITY_ID && a.status === "running",
    ) ?? false;

  const isRunning = agent.status === "active" && agent.turnInProgress;
  const isReview = agent.status === "review";
  const isBlocked = agent.blocked;
  const hasPendingApproval = !!agent.pendingApproval;
  const showBar =
    isRunning ||
    isBlocked ||
    hasPendingApproval ||
    (isReview && agent.files.length > 0);

  const projectName = projectPath?.split("/").pop() ?? "";
  const statusVisual = agentStatusVisual(agent);
  const StatusIcon = statusVisual.icon;
  const tokenPercent = getAgentContextPercent(agent);
  const timeLabel = getAgentTimeLabel(agent);
  const tokenLabel = getAgentTokenLabel(agent);
  const diffStats = getAgentDiffStats(agent);

  const threadEditSlotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!promptEdit) return;
    const id = requestAnimationFrame(() => {
      threadEditSlotRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
    return () => cancelAnimationFrame(id);
  }, [promptEdit]);

  const handleNewChat = useCallback(async () => {
    discardBlankQueuedAgent();
    const id = `agent-${Date.now()}`;
    let branch = "";
    let originUrl: string | undefined;
    const cwd = useAppStore.getState().projectPath;
    const { selectedModelId, selectedReasoningEffort } = useSettingsStore.getState();
    if (cwd) {
      try {
        const { byProjectPath, refreshProjectGitInfo } = useProjectGitStore.getState();
        const info = byProjectPath[cwd] ?? await refreshProjectGitInfo(cwd);
        branch = info?.branch ?? "";
        originUrl = info?.originUrl ?? undefined;
      } catch {
        // ignore
      }
    }
    addAgent({
      id,
      title: "New thread",
      branch,
      status: "queued",
      lastAction: "Waiting for your first message",
      progress: 0,
      time: "—",
      tokens: "—",
      files: [],
      pr: null,
      messages: [],
      blocked: false,
      originUrl,
      selectedModelId,
      selectedReasoningEffort,
    });
    setView("chat");
  }, [addAgent, discardBlankQueuedAgent, setView]);

  const renderMessageSlot = (msg: AgentMessage, index: number) => {
    if (
      msg.role === "you" &&
      promptEdit &&
      promptEdit.messageIndex === index &&
      canCompose &&
      promptEditEnabled
    ) {
      return (
        <div
          key={`inline-edit-${index}`}
          ref={threadEditSlotRef}
          className="mb-5 w-full min-w-0"
        >
          <ComposeArea
            placement="thread"
            key={`${agent.id}-${composeSessionKey}-thread`}
            agentId={agent.id}
            persistQueuedDraft={false}
            onSend={handleSend}
            emptyThread={false}
            promptEditTarget={promptEdit}
            onPromptEditSubmit={handlePromptEditSubmit}
            onCancelPromptEdit={handleCancelPromptEdit}
            promptEditConfirmPending={!!editConfirm}
            onApplyEditKeep={applyEditKeep}
            onApplyEditRevert={applyEditRevert}
            editSubmitting={editSubmitting}
            onDismissPromptEditConfirm={handleDismissEditConfirm}
          />
        </div>
      );
    }
    return (
      <MessageRow
        key={index}
        message={msg}
        messageIndex={index}
        onEditPrompt={handleBeginPromptEdit}
        promptEditEnabled={promptEditEnabled}
      />
    );
  };

  return (
    <div className="flex flex-col h-full bg-bg-primary overflow-hidden">
      {/* Top bar — spans full width */}
      <div
        data-tauri-drag-region
        className="h-11 shrink-0 flex items-center pl-[92px] pr-5 pt-1.5 pb-0.5 gap-3 border-b border-border-light select-none"
      >
        <div className="flex h-7 items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              discardBlankQueuedAgent();
              clearWorkspace();
              setView("home");
            }}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded cursor-pointer text-text-primary dark:text-text-primary hover:opacity-80 hover:bg-bg-secondary transition-all duration-120"
            title="Home"
          >
            <img
              src={view === "home" ? "/house_icon_filled.svg" : "/house_icon.svg"}
              alt=""
              className="h-3 w-3 shrink-0 opacity-85 dark:invert"
            />
          </button>
          <button
            type="button"
            onClick={() => {
              discardBlankQueuedAgent();
              setView("settings");
            }}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded cursor-pointer text-text-primary dark:text-text-primary hover:opacity-80 hover:bg-bg-secondary transition-all duration-120"
            title="Settings"
          >
            <img
              src={view === "settings" ? "/gear_filled.svg" : "/gear.svg"}
              alt=""
              className="h-3 w-3 shrink-0 opacity-85 dark:invert"
            />
          </button>
          <button
            type="button"
            onClick={handleNewChat}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded cursor-pointer text-text-primary dark:text-text-faint hover:opacity-80 dark:hover:text-text-secondary hover:bg-bg-secondary transition-all duration-120"
            title="New chat (adds to Drafts until you send)"
          >
            <img src="/newchat_icon.svg" alt="" className="h-2.5 w-2.5 shrink-0 dark:invert" />
          </button>
        </div>

        <div className="h-4 w-px bg-border-light shrink-0" />

        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => {
              discardBlankQueuedAgent();
              onBack();
            }}
            className="flex min-w-0 max-w-[min(240px,42vw)] shrink items-center gap-1.5 rounded px-1 -mx-1 hover:bg-bg-secondary transition-colors duration-120 cursor-pointer group/title-back"
            title="Back to board"
          >
            <ChevronLeft
              size={13}
              strokeWidth={2}
              className="shrink-0 text-text-faint group-hover/title-back:text-text-secondary transition-colors duration-120"
            />
            {appProjectName ? (
              <span className="min-w-0 flex-1 truncate text-left font-sans text-[13px] font-medium text-text-primary tracking-[-0.01em] leading-tight">
                {appProjectName}
              </span>
            ) : null}
          </button>
          {appProjectName ? (
            <span
              className="font-sans text-[13px] font-medium text-text-tertiary tracking-[-0.01em] leading-tight shrink-0"
              aria-hidden
            >
              /
            </span>
          ) : null}
          <StatusIcon
            size={12}
            strokeWidth={1.9}
            className={cn("shrink-0", statusVisual.spin && "animate-spin")}
            style={{ color: statusVisual.color }}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate font-sans text-[13px] font-medium text-text-primary tracking-[-0.01em] leading-tight">
            {agent.title}
          </span>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 shrink-0">
          <HeaderMetaItem
            icon={<Clock size={12} strokeWidth={1.75} />}
            value={timeLabel}
          />
          <div className="h-3 w-px bg-border-light" />
          <HeaderMetaItem
            icon={<ContextUsageIcon percent={tokenPercent} />}
            value={tokenLabel}
          />
          {hasPlan && agent.status !== "queued" && (
            <>
              <div className="h-3 w-px bg-border-light" />
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[9.5px] text-text-faint uppercase tracking-widest">
                  progress
                </span>
                <span
                  className="font-mono text-[11px]"
                  style={{ color: accent }}
                >
                  {agent.progress}%
                </span>
              </div>
            </>
          )}
        </div>

        <div className="h-4 w-px bg-border-light shrink-0" />

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={toggleFileTree}
            className={cn(
              "flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[11px] font-mono transition-colors duration-120 cursor-pointer",
              fileTreeOpen
                ? "border-border-focus text-text-primary bg-bg-card"
                : "border-border-default text-text-secondary bg-bg-secondary hover:bg-bg-card",
            )}
            title="Toggle file explorer"
          >
            <FolderTree size={12} />
          </button>
          <DiffButton fileCount={gitDiff?.fileCount ?? 0} active={diffPanelOpen} onClick={toggleDiffPanel} />
          <OpenInButton linkedLinearIssues={agent.linkedLinearIssues} />
          <GitButton
            pr={agent.pr}
            projectPath={projectPath}
            branch={agent.branch}
            originUrl={agent.originUrl}
            gitInfo={projectGitInfo}
            onGitAction={() => {
              if (projectPath) {
                void refreshProjectGitInfo(projectPath);
              }
              refreshGitDiff();
            }}
            onCommitSuccess={() => setAgentStatus(agent.id, "deployed")}
            onBranchCreated={(b) => updateAgentGitInfo(agent.id, { branch: b })}
          />
        </div>
      </div>

      {/* Content area — reserve layout space so chat reflows beside explorer */}
      <div
        className="flex flex-col flex-1 min-h-0 overflow-hidden relative"
        style={{
          paddingLeft: fileTreeOpen ? fileTreeWidth : 0,
          paddingRight: diffPanelOpen ? diffPanelWidth : 0,
          transition: "padding-left 200ms ease-out, padding-right 200ms ease-out",
        }}
      >
        {/* File tree overlay (no layout shift) */}
        <div
          className={cn(
            "absolute left-0 top-0 bottom-0 z-40 transition-transform duration-200 ease-out",
            fileTreeOpen ? "translate-x-0" : "-translate-x-full",
          )}
          aria-hidden={!fileTreeMounted}
          style={{ width: fileTreeWidth }}
        >
          {fileTreeMounted && (
            <FileTreeView
              projectPath={projectPath}
              projectName={projectName}
              branch={agent.branch}
              width={fileTreeWidth}
              open={fileTreeMounted}
              onClose={() => {}}
            />
          )}
        </div>

        {fileTreeOpen && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize file explorer"
            onPointerDown={handleFileTreeResizeStart}
            className="absolute top-0 bottom-0 z-50 w-5 -translate-x-1/2 cursor-col-resize touch-none group/file-tree-resizer"
            style={{ left: fileTreeWidth }}
          >
            <div
              className={cn(
                "absolute inset-y-0 left-1/2 -translate-x-1/2 w-px transition-colors duration-120",
                isResizingFileTree
                  ? "bg-border-focus"
                  : "bg-border-default group-hover/file-tree-resizer:bg-border-focus",
              )}
              style={isResizingFileTree ? undefined : { opacity: 0.85 }}
            />
          </div>
        )}

        {/* Stash — icon only, just past the panel edge (chat side) */}
        {fileTreeOpen && (
          <button
            type="button"
            onClick={toggleFileTree}
            className="absolute top-1/2 z-50 -translate-y-1/2 p-2 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-secondary/80 transition-colors duration-150 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-blue focus-visible:outline-offset-2"
            style={{ left: fileTreeWidth + 6 }}
            title="Hide file explorer"
          >
            <ChevronLeft size={15} strokeWidth={2} className="shrink-0" />
          </button>
        )}

        {/* Edge toggle — left: open panel (chevron → on hover) */}
        {!fileTreeOpen && !fileTreeMounted && (
          <button
            type="button"
            onClick={toggleFileTree}
            className="absolute left-0 top-0 bottom-0 z-30 w-6 hover:w-8 flex items-center justify-end pr-1 bg-transparent hover:bg-bg-secondary/80 border-r border-border-light hover:border-border-default transition-all duration-150 cursor-pointer group/edge-open"
            title="Open file explorer"
          >
            <ChevronLeft
              size={15}
              strokeWidth={2}
              className="text-text-faint rotate-180 opacity-0 group-hover/edge-open:opacity-100 transition-opacity duration-100 shrink-0"
            />
          </button>
        )}

        {/* Diff panel — right sidebar */}
        <div
          className={cn(
            "absolute right-0 top-0 bottom-0 z-40 transition-transform duration-200 ease-out",
            diffPanelOpen ? "translate-x-0" : "translate-x-full",
          )}
          aria-hidden={!diffPanelMounted}
          style={{ width: diffPanelWidth }}
        >
          {diffPanelMounted && (
            <DiffPanel
              diff={gitDiff?.diff ?? ""}
              files={gitDiff?.files ?? []}
              projectPath={projectPath}
              width={diffPanelWidth}
              open={diffPanelMounted}
              onRefresh={refreshGitDiff}
            />
          )}
        </div>

        {/* Diff panel resize handle */}
        {diffPanelOpen && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize diff panel"
            onPointerDown={handleDiffPanelResizeStart}
            className="absolute top-0 bottom-0 z-50 w-5 translate-x-1/2 cursor-col-resize touch-none group/diff-resizer"
            style={{ right: diffPanelWidth }}
          >
            <div
              className={cn(
                "absolute inset-y-0 left-1/2 -translate-x-1/2 w-px transition-colors duration-120",
                isResizingDiffPanel
                  ? "bg-border-focus"
                  : "bg-border-default group-hover/diff-resizer:bg-border-focus",
              )}
              style={isResizingDiffPanel ? undefined : { opacity: 0.85 }}
            />
          </div>
        )}

        {/* Diff panel stash arrow */}
        {diffPanelOpen && (
          <button
            type="button"
            onClick={toggleDiffPanel}
            className="absolute top-1/2 z-50 -translate-y-1/2 p-2 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-secondary/80 transition-colors duration-150 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-blue focus-visible:outline-offset-2"
            style={{ right: diffPanelWidth + 6 }}
            title="Hide diff panel"
          >
            <ChevronRight size={15} strokeWidth={2} className="shrink-0" />
          </button>
        )}

        {/* Edge toggle — right: open diff panel on hover */}
        {!diffPanelOpen && !diffPanelMounted && (gitDiff?.fileCount ?? 0) > 0 && (
          <button
            type="button"
            onClick={toggleDiffPanel}
            className="absolute right-0 top-0 bottom-0 z-30 w-6 hover:w-8 flex items-center justify-start pl-1 bg-transparent hover:bg-bg-secondary/80 border-l border-border-light hover:border-border-default transition-all duration-150 cursor-pointer group/edge-diff"
            title="Open diff panel"
          >
            <ChevronLeft
              size={15}
              strokeWidth={2}
              className="text-text-faint opacity-0 group-hover/edge-diff:opacity-100 transition-opacity duration-100 shrink-0"
            />
          </button>
        )}

        {/* Chat column */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

      {/* Messages */}
      <div className="relative flex-1 min-h-0">
        <div ref={scrollRef} className="h-full min-w-0 overflow-y-auto overflow-x-hidden">
          <div
            className={cn(
              "max-w-[680px] mx-auto pt-16 pb-28 transition-[padding] duration-150",
              (fileTreeOpen || diffPanelOpen) ? "px-4" : "px-6",
            )}
          >
          {agent.messages.length === 0 && !agent.streamingBuffer ? (
            <div className="flex items-center justify-center pt-36 pb-20">
              <svg
                width="230"
                height="180"
                viewBox="0 0 287 329"
                fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
                className="text-text-faint"
                aria-hidden="true"
                style={{ fillRule: "evenodd", clipRule: "evenodd" }}
              >
                <g transform="matrix(1,0,0,1,-5593.19,5680.59)">
                  <g transform="matrix(1,0,0,1,-64.7137,-26.1554)">
                    <g transform="matrix(1,0,0,1,5657.9,-5654.43)">
                      <path d="M0,269.297L153.448,0.001L153.448,58.592L0,328.438L0,269.297ZM1.042,269.573L1.042,324.498L152.406,58.316L152.406,3.933L1.042,269.573Z"/>
                    </g>
                    <g transform="matrix(1,0,0,1,5711.54,-5656.16)">
                      <path d="M0,269.297L125.295,49.745L125.295,108.336L0,328.438L0,269.297ZM1.042,269.573L1.042,324.502L124.253,108.06L124.253,53.672L1.042,269.573Z"/>
                    </g>
                    <g transform="matrix(1,0,0,1,5762.15,-5656.16)">
                      <path d="M0,269.297L103.103,91.998L103.103,150.589L0,328.438L0,269.297ZM1.042,269.578L1.042,324.564L102.061,150.309L102.061,95.862L1.042,269.578Z"/>
                    </g>
                    <g transform="matrix(1,0,0,1,5814.53,-5655.05)">
                      <path d="M0,269.297L76.341,138.89L76.341,197.481L0,328.438L0,269.297ZM1.042,269.579L1.042,324.582L75.3,197.199L75.3,142.731L1.042,269.579Z"/>
                    </g>
                    <g transform="matrix(1,0,0,1,5865.75,-5654.8)">
                      <path d="M0,269.297L50.735,181.761L50.735,240.351L0,328.438L0,269.297ZM1.042,269.577L1.042,324.542L49.694,240.073L49.694,185.635L1.042,269.577Z"/>
                    </g>
                    <g transform="matrix(1,0,0,1,5919.26,-5654.24)">
                      <path d="M0,269.297L25.334,226.552L25.334,285.142L0,328.438L0,269.297ZM1.042,269.582L1.042,324.595L24.292,284.86L24.292,230.352L1.042,269.582Z"/>
                    </g>
                  </g>
                </g>
              </svg>
            </div>
          ) : (
            <>
              {agent.messages.length > 0 &&
              agent.messages[agent.messages.length - 1]?.role === "agent" ? (
                <>
                  {agent.messages.slice(0, -1).map((msg, i) => renderMessageSlot(msg, i))}
                  {(agent.activities?.length ?? 0) > 0 && (
                    <ActivityFeed activities={agent.activities ?? []} />
                  )}
                  {renderMessageSlot(
                    agent.messages[agent.messages.length - 1]!,
                    agent.messages.length - 1,
                  )}
                </>
              ) : (
                <>
                  {agent.messages.map((msg, i) => renderMessageSlot(msg, i))}
                  {(agent.activities?.length ?? 0) > 0 && (
                    <ActivityFeed activities={agent.activities ?? []} />
                  )}
                </>
              )}

              {/* Thinking state — only when no inline reasoning card yet */}
              {isThinking &&
                !agent.pendingApproval &&
                !hasInlineThinkingStream && <ThinkingIndicator />}

              {/* Streaming state — blur-stagger words as they arrive */}
              {agent.streamingBuffer && (
                <StreamingMessage buffer={agent.streamingBuffer} />
              )}
            </>
          )}
          </div>
        </div>
        <ChatEdgeBlurOverlays />
      </div>

      {/* Compose + action pills — pulled up so chat canvas doesn't show as a band */}
      <div
        className={cn(
          "max-w-[680px] mx-auto w-full pb-4 shrink-0 relative z-30 -mt-20 bg-transparent transition-[padding] duration-150",
          (fileTreeOpen || diffPanelOpen) ? "px-4" : "px-6",
        )}
      >

        {/* Action pills row — floats above compose */}
        {showBar && (
          <div className="flex items-center gap-2 mb-2 flex-wrap">

            {/* Diff stats pill — only in review state with changed files */}
            {isReview && agent.files.length > 0 && (
              <button className="flex items-center gap-2 h-7 px-3 rounded-full bg-bg-card border border-border-default hover:border-border-focus transition-colors duration-150 cursor-pointer group">
                <span className="font-sans text-[12px] text-text-secondary group-hover:text-text-primary transition-colors duration-150">
                  Review
                </span>
                {diffStats && (diffStats.additions > 0 || diffStats.deletions > 0) ? (
                  <>
                    <span className="font-mono text-[11.5px] font-medium text-accent-green">
                      +{diffStats.additions}
                    </span>
                    <span className="font-mono text-[11.5px] font-medium text-accent-red">
                      -{diffStats.deletions}
                    </span>
                  </>
                ) : (
                  <span className="font-mono text-[11.5px] font-medium text-text-secondary">
                    {agent.files.length} file{agent.files.length === 1 ? "" : "s"}
                  </span>
                )}
              </button>
            )}

            {/* Accept all pill */}
            {isReview && agent.files.length > 0 && (
              <button
                type="button"
                onClick={handleAcceptReview}
                className="flex items-center gap-1.5 h-7 px-3 rounded-full bg-bg-card border border-accent-green/40 hover:bg-accent-green/10 hover:border-accent-green/70 transition-colors duration-150 cursor-pointer"
              >
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none" className="shrink-0">
                  <path d="M1.5 4.5L3.75 6.75L7.5 2.25" stroke="var(--accent-green)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="font-sans text-[12px] text-accent-green font-medium">
                  Accept all
                </span>
              </button>
            )}

            {/* Reject all pill */}
            {isReview && agent.files.length > 0 && (
              <button
                type="button"
                onClick={handleRejectReview}
                className="flex items-center gap-1.5 h-7 px-3 rounded-full bg-bg-card border border-accent-red/40 hover:bg-accent-red/10 hover:border-accent-red/70 transition-colors duration-150 cursor-pointer"
              >
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none" className="shrink-0">
                  <path d="M2 2L7 7M7 2L2 7" stroke="var(--accent-red)" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <span className="font-sans text-[12px] text-accent-red font-medium">
                  Reject all
                </span>
              </button>
            )}

            {/* Allow approval pill */}
            {hasPendingApproval && (
              <button
                onClick={() => {
                  if (!agent.pendingApproval) return;
                  const approval = agent.pendingApproval;
                  if (approval.type === "permissions") {
                    rpcRespond(approval.rpcId, { permissions: approval.permissions ?? {}, scope: "turn" }).then(clearApproval).catch(console.error);
                  } else {
                    rpcRespond(approval.rpcId, { decision: "accept" }).then(clearApproval).catch(console.error);
                  }
                }}
                className="flex items-center gap-1.5 h-7 px-3 rounded-full bg-bg-card border border-accent-amber/40 hover:bg-accent-amber/10 hover:border-accent-amber/70 transition-colors duration-150 cursor-pointer"
              >
                <Shield size={10} className="text-accent-amber shrink-0" />
                <span className="font-sans text-[12px] text-accent-amber font-medium">
                  Allow
                </span>
                <kbd className="font-mono text-[9px] text-accent-amber/60 bg-accent-amber/10 border border-accent-amber/20 rounded px-1 leading-none py-0.5">
                  ⌘⏎
                </kbd>
              </button>
            )}

            {/* Always allow pill */}
            {hasPendingApproval && (
              <button
                onClick={() => {
                  if (!agent.pendingApproval) return;
                  const approval = agent.pendingApproval;
                  if (approval.type === "permissions") {
                    rpcRespond(approval.rpcId, { permissions: approval.permissions ?? {}, scope: "session" }).then(clearApproval).catch(console.error);
                  } else {
                    rpcRespond(approval.rpcId, { decision: "acceptForSession" }).then(clearApproval).catch(console.error);
                  }
                }}
                className="flex items-center gap-1.5 h-7 px-3 rounded-full bg-bg-card border border-border-default hover:border-border-focus transition-colors duration-150 cursor-pointer"
              >
                <span className="font-sans text-[12px] text-text-secondary">
                  Always allow
                </span>
              </button>
            )}

            {/* Deny approval pill */}
            {hasPendingApproval && (
              <button
                onClick={() => {
                  if (!agent.pendingApproval) return;
                  rpcRespond(agent.pendingApproval.rpcId, { decision: "decline" }).then(clearApproval).catch(console.error);
                }}
                className="flex items-center gap-1.5 h-7 px-3 rounded-full bg-bg-card border border-border-default hover:border-border-focus transition-colors duration-150 cursor-pointer"
              >
                <span className="font-sans text-[12px] text-text-secondary">
                  Deny
                </span>
              </button>
            )}

            {/* Cancel turn pill */}
            {hasPendingApproval && (
              <button
                onClick={() => {
                  if (!agent.pendingApproval) return;
                  rpcRespond(agent.pendingApproval.rpcId, { decision: "cancel" }).then(clearApproval).catch(console.error);
                }}
                className="flex items-center gap-1.5 h-7 px-3 rounded-full bg-bg-card border border-border-default hover:border-border-focus transition-colors duration-150 cursor-pointer ml-auto"
              >
                <span className="font-sans text-[12px] text-text-faint hover:text-text-secondary transition-colors duration-150">
                  Cancel turn
                </span>
              </button>
            )}

            {/* Stop pill */}
            {isRunning && (
              <button
                onClick={handleStop}
                disabled={stopping || !agent.currentTurnId}
                className="flex items-center gap-1.5 h-7 px-3 rounded-full bg-bg-card border border-border-default hover:border-border-focus transition-colors duration-150 cursor-pointer disabled:opacity-50 ml-auto"
              >
                <Square size={8} fill="currentColor" strokeWidth={0} className="text-text-tertiary" />
                <span className="font-sans text-[12px] text-text-secondary">
                  {stopping ? "Stopping…" : "Stop"}
                </span>
                <kbd className="font-mono text-[9px] text-text-faint bg-bg-secondary border border-border-light rounded px-1 leading-none py-0.5">
                  ⌃C
                </kbd>
              </button>
            )}

            {/* Blocked: Unblock pill */}
            {isBlocked && (
              <button className="flex items-center gap-1.5 h-7 px-3 rounded-full bg-bg-card border border-border-default hover:border-border-focus transition-colors duration-150 cursor-pointer ml-auto">
                <span className="font-sans text-[12px] text-text-secondary">
                  Unblock
                </span>
              </button>
            )}

          </div>
        )}

        {/* Queued messages + compose */}
        {canCompose && !promptEdit ? (
          <>
            <QueuedMessagesPanel agentId={agent.id} />
            <ComposeArea
              key={`${agent.id}-${composeSessionKey}`}
              agentId={agent.id}
              persistQueuedDraft={agent.status === "queued"}
              onSend={handleSend}
              emptyThread={
                agent.messages.length === 0 && !agent.streamingBuffer
              }
              isRunning={isRunning}
              onStop={handleStop}
              stopping={stopping}
            />
          </>
        ) : null}
        {!canCompose ? (
          <div className="border border-border-light rounded-lg px-4 py-3 text-center">
            <span className="font-mono text-[10.5px] text-text-faint">
              {agent.status === "queued"
                ? "agent is in drafts — start it to begin a conversation"
                : "done — read only"}
            </span>
          </div>
        ) : null}

      </div>

      </div>{/* end chat column */}
      </div>{/* end content area flex-row */}

    </div>
  );
}
