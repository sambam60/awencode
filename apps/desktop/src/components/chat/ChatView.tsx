import { useRef, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronDown,
  Code2,
  GitBranch,
  GitCommit,
  GitPullRequest,
  CloudUpload,
  Box,
  Terminal,
  FolderOpen,
  ArrowUpDown,
  MessageSquare,
} from "lucide-react";
import { ComposeArea, type Attachment } from "./ComposeArea";
import { statusColor } from "@/lib/status";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { rpcRequest } from "@/lib/rpc-client";
import { useAppStore } from "@/lib/stores/app-store";
import { useThreadStore } from "@/lib/stores/thread-store";
import { useAppListStore } from "@/lib/stores/app-list-store";
import { getSelectedModel, getSelectedReasoningEffort } from "@/lib/stores/settings-store";
import type { Agent, AgentMessage } from "@/lib/stores/thread-store";

interface ChatViewProps {
  agent: Agent;
  onBack: () => void;
}

function ToolCallBlock({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-border-light rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 bg-bg-secondary hover:bg-bg-card transition-colors duration-120 cursor-pointer text-left"
      >
        <Code2 size={11} className="text-text-faint shrink-0" />
        <span className="font-mono text-[10.5px] text-text-secondary flex-1">
          tool call
        </span>
        <ChevronDown
          size={10}
          className={cn(
            "text-text-faint transition-transform duration-150",
            expanded ? "rotate-180" : "",
          )}
        />
      </button>
      {expanded && (
        <div className="px-3.5 py-3 bg-bg-card border-t border-border-light">
          <pre className="font-mono text-[11px] text-text-secondary whitespace-pre-wrap leading-relaxed">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}

function MessageRow({ message }: { message: AgentMessage }) {
  const isUser = message.role === "you";

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[80%] flex flex-col gap-2 items-end">
          {message.imageUrls && message.imageUrls.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-end">
              {message.imageUrls.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt=""
                  className="max-w-[200px] max-h-[200px] rounded-lg object-cover border border-border-light"
                />
              ))}
            </div>
          )}
          {message.content && (
            <div className="px-4 py-3 bg-text-primary text-bg-card rounded-xl rounded-br-sm text-[13px] leading-relaxed">
              {message.content}
            </div>
          )}
        </div>
      </div>
    );
  }

  const isToolCall =
    message.content.startsWith("{") || message.content.includes("shell(");

  if (isToolCall) {
    return (
      <div className="mb-3">
        <ToolCallBlock content={message.content} />
      </div>
    );
  }

  return (
    <div className="mb-4">
      <div className="text-[13px] text-text-primary leading-relaxed whitespace-pre-wrap">
        {message.content}
      </div>
    </div>
  );
}

function GitButton({
  pr,
  projectPath,
  branch,
  onGitAction,
}: {
  pr: string | null;
  projectPath: string | null;
  branch: string;
  onGitAction: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [commitOpen, setCommitOpen] = useState(false);
  const [gitError, setGitError] = useState<string | null>(null);

  const handleCommit = async () => {
    if (!projectPath || !commitMessage.trim()) return;
    setGitError(null);
    try {
      await invoke("git_commit", { path: projectPath, message: commitMessage.trim() });
      setCommitOpen(false);
      setCommitMessage("");
      onGitAction();
    } catch (e) {
      setGitError(e instanceof Error ? e.message : String(e));
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

  const handleCreatePR = async () => {
    setOpen(false);
    if (!projectPath) return;
    try {
      const info = await invoke<{ originUrl?: string | null; branch?: string | null }>("get_git_info", {
        path: projectPath,
      });
      const url = info?.originUrl;
      const b = info?.branch;
      if (url && b) {
        const m = url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
        if (m) {
          const repo = m[1];
          const prUrl = `https://github.com/${repo}/compare/${encodeURIComponent(b)}?expand=1`;
          await invoke("open_url", { url: prUrl });
        }
      }
    } catch {
      // ignore
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[11px] font-mono transition-colors duration-120 cursor-pointer",
          pr
            ? "border-[#3a9d63]/40 text-[#3a9d63] bg-[#3a9d63]/6 hover:bg-[#3a9d63]/10"
            : "border-border-default text-text-secondary bg-bg-secondary hover:bg-bg-card",
        )}
      >
        {pr ? <GitPullRequest size={12} /> : <GitBranch size={12} />}
        {pr && <span>{pr}</span>}
        {branch && !pr && <span>{branch}</span>}
        <ChevronDown size={9} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-52 bg-bg-card border border-border-default rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.06)] z-50 overflow-hidden py-1">
          <button
            onClick={() => {
              setOpen(false);
              setCommitOpen(true);
              setGitError(null);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-bg-secondary transition-colors duration-120 cursor-pointer text-left"
          >
            <GitCommit size={12} className="text-text-faint shrink-0" />
            <span className="text-[12px] text-text-primary">Commit</span>
          </button>
          <button
            onClick={handlePush}
            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-bg-secondary transition-colors duration-120 cursor-pointer text-left"
          >
            <CloudUpload size={12} className="text-text-faint shrink-0" />
            <span className="text-[12px] text-text-primary">Push</span>
          </button>
          <button
            onClick={handleCreatePR}
            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-bg-secondary transition-colors duration-120 cursor-pointer text-left"
          >
            <GitPullRequest size={12} className="text-text-faint shrink-0" />
            <span className="text-[12px] text-text-primary">Create PR</span>
          </button>
        </div>
      )}
      {commitOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setCommitOpen(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border-default bg-bg-card p-4 shadow-[0_12px_40px_rgba(0,0,0,0.06)]">
            <div className="font-mono text-[10px] text-text-faint uppercase tracking-widest mb-2">
              Commit message
            </div>
            <input
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Describe your changes..."
              className="w-full px-3 py-2 rounded-md border border-border-default bg-bg-input text-[13px] text-text-primary placeholder:text-text-faint mb-3"
            />
            {gitError && <p className="text-[11px] text-accent-red mb-2">{gitError}</p>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setCommitOpen(false)}
                className="px-3 py-1.5 text-[11.5px] text-text-secondary border border-border-default rounded-md hover:bg-bg-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleCommit}
                disabled={!commitMessage.trim()}
                className="px-3 py-1.5 text-[11.5px] font-medium bg-text-primary text-bg-card rounded-md hover:opacity-90 disabled:opacity-50"
              >
                Commit
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

function OpenInButton() {
  const [open, setOpen] = useState(false);
  const [appIcons, setAppIcons] = useState<Record<string, string>>({});
  const [detectedApps, setDetectedApps] = useState<Array<{ id: string; name: string; isAccessible: boolean }>>([]);
  const projectPath = useAppStore((s) => s.projectPath);
  const apps = useAppListStore((s) => s.apps);
  const displayApps = useMemo(
    () => (detectedApps.length > 0 ? detectedApps : apps).filter((app) => app.isAccessible),
    [apps, detectedApps],
  );

  useEffect(() => {
    invoke<Array<{ id: string; name: string; isAccessible: boolean }>>("detect_open_apps")
      .then((localApps) => {
        if (Array.isArray(localApps)) {
          setDetectedApps(localApps);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const resolveIcons = async () => {
      const entries = await Promise.all(
        displayApps.map(async (app) => {
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
          if (iconDataUrl) {
            next[appId] = iconDataUrl;
          }
        }
        return next;
      });
    };
    resolveIcons().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [displayApps]);

  const handleOpenIn = async (appId: string) => {
    setOpen(false);
    const path = projectPath;
    if (!path) return;
    try {
      await invoke("open_in_app", { appId, path });
    } catch {
      // ignore
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border-default text-text-secondary bg-bg-secondary hover:bg-bg-card text-[11px] font-mono transition-colors duration-120 cursor-pointer"
        aria-label="Open in"
      >
        <Box size={12} />
        <ChevronDown size={9} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-44 bg-bg-card border border-border-default rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.06)] z-50 overflow-hidden py-1">
          {displayApps.map((app) => {
            const Icon = APP_ICON_MAP[app.id.toLowerCase()] ?? Box;
            const iconDataUrl = appIcons[app.id];
            return (
              <button
                key={app.id}
                onClick={() => handleOpenIn(app.id)}
                disabled={!projectPath}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-bg-secondary transition-colors duration-120 cursor-pointer text-left disabled:opacity-50 disabled:cursor-default"
              >
                {iconDataUrl ? (
                  <img
                    src={iconDataUrl}
                    alt=""
                    className="w-4 h-4 rounded-[3px] shrink-0 object-contain"
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

// Diff button
function DiffButton({ fileCount }: { fileCount: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[11px] font-mono transition-colors duration-120 cursor-pointer",
          fileCount > 0
            ? "border-border-default text-text-secondary bg-bg-secondary hover:bg-bg-card"
            : "border-border-light text-text-faint bg-bg-secondary cursor-default",
        )}
        disabled={fileCount === 0}
      >
        <ArrowUpDown size={12} />
        {fileCount > 0 && (
          <span className="font-mono text-[9.5px] text-text-faint bg-bg-primary border border-border-light rounded px-1 py-0.5 leading-none">
            {fileCount}
          </span>
        )}
      </button>
      {open && fileCount > 0 && (
        <div className="absolute right-0 top-full mt-1.5 w-64 bg-bg-card border border-border-default rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.06)] z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-border-light">
            <span className="font-mono text-[9.5px] text-text-faint uppercase tracking-widest">Changed Files</span>
          </div>
          <div className="py-1 max-h-64 overflow-y-auto">
            <div className="px-3 py-2 text-center">
              <span className="font-mono text-[11px] text-text-faint">diff viewer coming soon</span>
            </div>
          </div>
        </div>
      )}
      {open && fileCount > 0 && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
      )}
    </div>
  );
}

export function ChatView({ agent, onBack }: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const accent = statusColor(agent);
  const projectPath = useAppStore((s) => s.projectPath);
  const setAgentCodexThreadId = useThreadStore((s) => s.setAgentCodexThreadId);
  const appendAgentMessage = useThreadStore((s) => s.appendAgentMessage);

  useEffect(() => {
    if (!agent.codexThreadId || !projectPath) return;
    invoke<{ branch?: string | null; sha?: string | null; originUrl?: string | null }>("get_git_info", {
      path: projectPath,
    })
      .then((info) => {
        if (!info?.branch && !info?.sha && !info?.originUrl) return;
        return rpcRequest("thread/metadata/update", {
          threadId: agent.codexThreadId,
          gitInfo: {
            branch: info.branch ?? undefined,
            sha: info.sha ?? undefined,
            originUrl: info.originUrl ?? undefined,
          },
        });
      })
      .catch(() => {});
  }, [agent.codexThreadId, agent.id, projectPath]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [agent.messages.length, agent.streamingBuffer]);

  const handleSend = async (message: string, attachments: Attachment[]) => {
    const trimmed = message.trim();
    if (!trimmed && attachments.length === 0) return;

    const displayContent = trimmed || (attachments.length > 0 ? `[${attachments.map((a) => a.name).join(", ")}]` : "");
    const imageUrls = attachments
      .filter((a) => a.mime?.startsWith("image/") && a.dataUrl)
      .map((a) => a.dataUrl as string);
    appendAgentMessage(agent.id, {
      role: "you",
      content: displayContent,
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    });

    let threadId = agent.codexThreadId;
    if (!threadId) {
      try {
        const selected = getSelectedModel();
        const res = await rpcRequest<{ thread: { id: string } }>("thread/start", {
          cwd: projectPath ?? undefined,
          model: selected.id,
          modelProvider: selected?.provider,
        });
        threadId = res?.thread?.id;
        if (threadId) {
          setAgentCodexThreadId(agent.id, threadId);
        }
      } catch (e) {
        console.error("thread/start failed", e);
        return;
      }
    }
    if (!threadId) return;

    // Build input items: images as image_url content, files as text references, then the text
    const inputItems: Array<Record<string, unknown>> = [];

    for (const att of attachments) {
      if (att.mime?.startsWith("image/") && att.dataUrl) {
        inputItems.push({
          type: "input_image",
          image_url: att.dataUrl,
        });
      } else {
        // Non-image files: reference by path as a text item
        inputItems.push({
          type: "text",
          text: `[File: ${att.name}]`,
          textElements: [],
        });
      }
    }

    if (trimmed) {
      inputItems.push({ type: "text", text: trimmed, textElements: [] });
    }

    try {
      await rpcRequest("turn/start", {
        threadId,
        input: inputItems,
        effort: getSelectedReasoningEffort(),
      });
    } catch (e) {
      console.error("turn/start failed", e);
    }
  };

  const canCompose =
    agent.status !== "queued" && agent.status !== "deployed";

  return (
    <div className="flex flex-col h-full bg-bg-primary overflow-hidden">

      {/* Top bar — left/top padding for macOS traffic lights; full bar is draggable */}
      <div
        data-tauri-drag-region
        className="h-12 shrink-0 flex items-center pl-[92px] pr-4 gap-3 border-b border-border-light select-none"
      >
        {/* Back button */}
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-text-faint hover:text-text-secondary cursor-pointer transition-colors duration-120 shrink-0 mr-1"
        >
          <ChevronLeft size={12} />
          <span className="font-sans text-[10px]">Back</span>
        </button>

        {/* Divider */}
        <div className="h-4 w-px bg-border-light shrink-0" />

        {/* Status dot + title + branch */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: accent }}
          />
          <span className="text-[13px] font-medium text-text-primary tracking-[-0.01em] truncate">
            {agent.title}
          </span>
          <span className="font-mono text-[10px] text-text-faint shrink-0 bg-bg-secondary border border-border-light rounded px-1.5 py-0.5 leading-none">
            {agent.branch}
          </span>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[9.5px] text-text-faint uppercase tracking-widest">time</span>
            <span className="font-mono text-[11px] text-text-secondary">{agent.time}</span>
          </div>
          <div className="h-3 w-px bg-border-light" />
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[9.5px] text-text-faint uppercase tracking-widest">tokens</span>
            <span className="font-mono text-[11px] text-text-secondary">{agent.tokens}</span>
          </div>
          <div className="h-3 w-px bg-border-light" />
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[9.5px] text-text-faint uppercase tracking-widest">files</span>
            <span className="font-mono text-[11px] text-text-secondary">{agent.files.length}</span>
          </div>
          {agent.status !== "queued" && (
            <>
              <div className="h-3 w-px bg-border-light" />
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[9.5px] text-text-faint uppercase tracking-widest">progress</span>
                <span className="font-mono text-[11px]" style={{ color: accent }}>{agent.progress}%</span>
              </div>
            </>
          )}
        </div>

        {/* Divider */}
        <div className="h-4 w-px bg-border-light shrink-0" />

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <DiffButton fileCount={agent.files.length} />
          <OpenInButton />
          <GitButton
            pr={agent.pr}
            projectPath={projectPath}
            branch={agent.branch}
            onGitAction={() => {}}
          />
        </div>
      </div>

      {/* Progress bar — thin strip below top bar when active */}
      {agent.status === "active" && !agent.blocked && (
        <div className="h-[2px] bg-border-light shrink-0">
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${agent.progress}%`, background: accent }}
          />
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-[680px] mx-auto px-6 py-6">
          {agent.messages.length === 0 && !agent.streamingBuffer ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-8 h-8 rounded-full border border-border-light flex items-center justify-center">
                <MessageSquare size={14} className="text-text-faint" />
              </div>
              <div className="text-[12.5px] text-text-faint text-center">
                No messages yet.
                {agent.status === "queued" && (
                  <span className="block mt-1 text-text-faint">
                    This agent is waiting to start.
                  </span>
                )}
              </div>
            </div>
          ) : (
            <>
              {agent.messages.map((msg, i) => (
                <MessageRow key={i} message={msg} />
              ))}
              {agent.streamingBuffer ? (
                <div className="mb-4">
                  <div className="text-[13px] text-text-primary leading-relaxed whitespace-pre-wrap">
                    {agent.streamingBuffer}
                    <span className="inline-block w-2 h-4 ml-0.5 bg-text-primary animate-pulse" />
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* Action bar — approve/request/unblock/pause */}
      {(agent.status === "review" || agent.blocked || agent.status === "active") && (
        <div className="max-w-[680px] mx-auto w-full px-6 pb-2 shrink-0">
          <div className="flex items-center gap-2">
            {agent.status === "review" && (
              <>
                <button className="flex-1 py-2 bg-text-primary text-bg-card text-[11.5px] font-medium rounded-md cursor-pointer hover:opacity-90 transition-opacity duration-120">
                  approve & deploy
                </button>
                <button className="flex-1 py-2 bg-transparent border border-border-default text-text-secondary text-[11.5px] font-medium rounded-md cursor-pointer hover:bg-bg-card transition-colors duration-120">
                  request changes
                </button>
              </>
            )}
            {agent.blocked && (
              <button className="flex-1 py-2 bg-text-primary text-bg-card text-[11.5px] font-medium rounded-md cursor-pointer hover:opacity-90 transition-opacity duration-120">
                unblock & continue
              </button>
            )}
          </div>
        </div>
      )}

      {/* Compose */}
      <div className="max-w-[680px] mx-auto w-full px-6 pb-4 shrink-0">
        {canCompose ? (
          <ComposeArea
            onSend={handleSend}
            emptyThread={agent.messages.length === 0 && !agent.streamingBuffer}
          />
        ) : (
          <div className="border border-border-light rounded-lg px-4 py-3 text-center">
            <span className="font-mono text-[10.5px] text-text-faint">
              {agent.status === "queued"
                ? "agent is queued — start it to begin a conversation"
                : "deployed — read only"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
