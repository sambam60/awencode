import React, { useRef, useEffect, useMemo, useState, useCallback, memo } from "react";
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
  GitFork,
  FileCode,
  ExternalLink,
  Loader2,
  Search,
  Pencil,
  Shield,
  Play,
  Copy,
  Check,
  FileEdit,
  Lock,
  FolderTree,
} from "lucide-react";
import { ComposeArea, type Attachment } from "./ComposeArea";
import { CodeBlock } from "./CodeBlock";
import { ShimmerText } from "./ShimmerText";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { statusColor } from "@/lib/status";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { rpcRequest, rpcRespond } from "@/lib/rpc-client";
import { generateThreadTitle, interruptTurn } from "@/lib/codex-turn";
import { isAbsoluteFilePath } from "@/lib/dnd";
import { useAppStore } from "@/lib/stores/app-store";
import { useThreadStore } from "@/lib/stores/thread-store";
import { useAppListStore } from "@/lib/stores/app-list-store";
import {
  getSelectedModel,
  getSelectedReasoningEffort,
} from "@/lib/stores/settings-store";
import {
  STREAMING_THINKING_ACTIVITY_ID,
  type Agent,
  type AgentActivity,
  type AgentMessage,
  type ApprovalRequest,
} from "@/lib/stores/thread-store";
import { FileTreeView } from "./FileTreeView";

interface ChatViewProps {
  agent: Agent;
  onBack: () => void;
}

const NEW_THREAD_TITLE = "New thread";

function truncateChatTitle(text: string): string {
  const t = text.trim();
  if (!t) return "";
  return t.length > 56 ? `${t.slice(0, 53)}…` : t;
}

/** First line of what we show in the thread, suitable for a default chat title. */
function titleFromFirstSendDisplay(displayContent: string): string | null {
  const line = displayContent.split("\n")[0]?.trim() ?? "";
  const next = truncateChatTitle(line);
  return next.length > 0 ? next : null;
}

// ─── File chip ────────────────────────────────────────────────────────────────

function FileChip({ path }: { path: string }) {
  const fileName = path.split("/").pop() ?? path;
  const ext = fileName.includes(".") ? fileName.split(".").pop() : "";

  const handleOpen = async () => {
    try {
      await invoke("open_file_in_editor", { path });
    } catch {
      // ignore — command may not be implemented yet
    }
  };

  return (
    <button
      onClick={handleOpen}
      title={path}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border-light bg-bg-secondary hover:bg-bg-card hover:border-border-default transition-colors duration-120 cursor-pointer group/chip focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-blue focus-visible:outline-offset-2"
    >
      <FileCode size={10} className="text-text-links opacity-80 shrink-0" />
      <span className="font-mono text-[10.5px] text-text-links group-hover/chip:opacity-90 transition-opacity duration-120 max-w-[200px] truncate">
        {fileName}
      </span>
      {ext && (
        <span className="font-mono text-[9px] text-text-faint uppercase">
          .{ext}
        </span>
      )}
      <ExternalLink
        size={8}
        className="text-text-links opacity-0 group-hover/chip:opacity-70 transition-opacity duration-120 shrink-0"
      />
    </button>
  );
}

// ─── Tool call block ──────────────────────────────────────────────────────────

function ToolCallBlock({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);

  // Try to parse tool name from JSON or shell( patterns
  let toolName = "tool call";
  let prettyContent = content;
  try {
    const parsed = JSON.parse(content);
    if (parsed?.tool) toolName = parsed.tool;
    else if (parsed?.name) toolName = parsed.name;
    prettyContent = JSON.stringify(parsed, null, 2);
  } catch {
    const shellMatch = content.match(/^(\w+)\(/);
    if (shellMatch) toolName = shellMatch[1];
  }

  return (
    <div className="border border-border-light rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 bg-bg-secondary hover:bg-bg-card transition-colors duration-120 cursor-pointer text-left"
      >
        <Code2 size={11} className="text-text-faint shrink-0" />
        <span className="font-mono text-[10.5px] text-text-secondary flex-1">
          {toolName}
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
        <div className="bg-bg-card border-t border-border-light">
          <CodeBlock code={prettyContent} language="json" showLineNumbers />
        </div>
      )}
    </div>
  );
}

// ─── Lightweight markdown renderer ───────────────────────────────────────────
// Avoids react-markdown ESM issues; handles the common cases from LLM output.

function safeMarkdownHref(href: string): string | null {
  const t = href.trim();
  if (/^https?:\/\//i.test(t)) return t;
  if (/^mailto:/i.test(t)) return t;
  return null;
}

function parseInline(text: string, keyPrefix: string): React.ReactNode[] {
  // **bold**, *em*, `code`, [File: path], [label](url), @file.ext (12-34)
  const parts = text.split(
    /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[File: [^\]]+\]|\[[^\]]+\]\([^)]+\)|@[\w./-]+\s*\(\d+(?:-\d+)?\))/g,
  );
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={key} className="font-semibold text-text-primary">{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*"))
      return <em key={key} className="italic text-text-secondary">{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={key} className="font-mono text-[11.5px] px-1.5 py-0.5 rounded bg-bg-secondary border border-border-light text-text-primary">{part.slice(1, -1)}</code>;
    const fileMatch = part.match(/^\[File: (.+)\]$/);
    if (fileMatch) return <FileChip key={key} path={fileMatch[1]} />;
    const mdLink = part.match(/^\[([^\]]*)\]\(([^)]+)\)$/);
    if (mdLink) {
      const href = safeMarkdownHref(mdLink[2]);
      if (href) {
        return (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-text-links underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-blue focus-visible:outline-offset-1 rounded-sm"
          >
            {mdLink[1] || href}
          </a>
        );
      }
      return (
        <span key={key} className="text-text-tertiary">
          {mdLink[1]}
        </span>
      );
    }
    const atRef = part.match(/^@([\w./-]+)\s*\((\d+)(?:-(\d+))?\)$/);
    if (atRef) {
      const refPath = atRef[1];
      const handleAtOpen = async () => {
        try {
          await invoke("open_file_in_editor", { path: refPath });
        } catch {
          /* path may be workspace-relative or unknown */
        }
      };
      return (
        <button
          key={key}
          type="button"
          onClick={handleAtOpen}
          title={`Open ${refPath}`}
          className="inline font-mono text-[11px] text-text-links hover:opacity-90 underline-offset-2 hover:underline cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-blue focus-visible:outline-offset-1 rounded-sm"
        >
          @{refPath} ({atRef[2]}
          {atRef[3] ? `-${atRef[3]}` : ""})
        </button>
      );
    }
    return part;
  });
}

// Wrap a node in a div that blur-staggers in via CSS animation
const StreamBlock = memo(({ children }: { children: React.ReactNode }) => (
  <div className="animate-block-in">
    {children}
  </div>
));

type ParsedNode = { key: string; node: React.ReactNode };

function parseContent(content: string): ParsedNode[] {
  const text = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const segments = text.split(/(```[\s\S]*?```|```[\s\S]*$)/g);

  let nodeIdx = 0;
  const k = (prefix: string) => `${prefix}-${nodeIdx++}`;
  const result: ParsedNode[] = [];

  for (const seg of segments) {
    if (seg.startsWith("```")) {
      const firstNewline = seg.indexOf("\n");
      const lang = firstNewline > 3 ? seg.slice(3, firstNewline).trim() || undefined : undefined;
      const code = firstNewline >= 0 ? seg.slice(firstNewline + 1).replace(/```\s*$/, "").trimEnd() : "";
      const key = k("code");
      result.push({ key, node: <CodeBlock key={key} code={code} language={lang} showLineNumbers={code.split("\n").length > 4} /> });
      continue;
    }

    const lines = seg.split("\n");
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === "") { i++; continue; }

      const hm = line.match(/^(#{1,3}) (.+)/);
      if (hm) {
        const level = hm[1].length;
        const cls = level === 1
          ? "text-[15px] font-semibold text-text-primary tracking-[-0.02em] mt-5 mb-2"
          : level === 2 ? "text-[13.5px] font-semibold text-text-primary tracking-[-0.015em] mt-4 mb-2"
          : "text-[12.5px] font-medium text-text-primary mt-3 mb-1.5";
        const Tag = `h${level}` as "h1" | "h2" | "h3";
        const key = k("h");
        result.push({ key, node: <Tag key={key} className={cls}>{parseInline(hm[2], key)}</Tag> });
        i++; continue;
      }

      if (/^---+$/.test(line.trim())) {
        const key = k("hr");
        result.push({ key, node: <hr key={key} className="my-4 border-border-light" /> });
        i++; continue;
      }

      if (line.startsWith("> ")) {
        const key = k("bq");
        result.push({ key, node: <blockquote key={key} className="border-l-[2.5px] border-border-default pl-3 my-2 text-text-secondary italic text-[13px] leading-relaxed">{parseInline(line.slice(2), key)}</blockquote> });
        i++; continue;
      }

      if (/^[-*+] /.test(line)) {
        const items: React.ReactNode[] = [];
        const startI = i;
        while (i < lines.length && /^[-*+] /.test(lines[i])) {
          items.push(<li key={i} className="leading-relaxed">{parseInline(lines[i].slice(2), `li-${i}`)}</li>);
          i++;
        }
        const key = k("ul");
        result.push({ key, node: <ul key={key} className="mb-3 pl-4 space-y-0.5 list-disc list-outside text-[13px] text-text-primary leading-relaxed">{items}</ul> });
        void startI; continue;
      }

      if (/^\d+[.)]\s/.test(line)) {
        const items: React.ReactNode[] = [];
        const startI = i;
        while (i < lines.length && /^\d+[.)]\s/.test(lines[i])) {
          items.push(<li key={i} className="leading-relaxed">{parseInline(lines[i].replace(/^\d+[.)]\s/, ""), `oli-${i}`)}</li>);
          i++;
        }
        const key = k("ol");
        result.push({ key, node: <ol key={key} className="mb-3 pl-4 space-y-0.5 list-decimal list-outside text-[13px] text-text-primary leading-relaxed">{items}</ol> });
        void startI; continue;
      }

      const paraLines: string[] = [];
      const startPara = i;
      while (
        i < lines.length &&
        lines[i].trim() !== "" &&
        !/^#{1,3} /.test(lines[i]) &&
        !/^[-*+] /.test(lines[i]) &&
        !/^\d+[.)]\s/.test(lines[i]) &&
        !/^---+$/.test(lines[i].trim()) &&
        !lines[i].startsWith("> ")
      ) {
        paraLines.push(lines[i]);
        i++;
      }
      if (paraLines.length > 0) {
        const key = k("p");
        result.push({ key, node: <p key={key} className="mb-3 last:mb-0 text-[13px] text-text-primary leading-relaxed">{parseInline(paraLines.join(" "), `p-${startPara}`)}</p> });
      }
    }
  }

  return result;
}

function AgentMarkdown({ content, streaming = false }: { content: string; streaming?: boolean }) {
  // During streaming, track which keys have already been shown so only new blocks animate
  const seenKeysRef = useRef<Set<string>>(new Set());

  const parsed = parseContent(content);

  if (parsed.length === 0) {
    return <p className="text-[13px] font-sans text-text-primary leading-relaxed">{content}</p>;
  }

  return (
    <div className="font-sans">
      {parsed.map(({ key, node }) => {
        if (!streaming) return <React.Fragment key={key}>{node}</React.Fragment>;

        const isNew = !seenKeysRef.current.has(key);
        if (isNew) seenKeysRef.current.add(key);

        if (isNew) {
          return <StreamBlock key={key}>{node}</StreamBlock>;
        }
        return <React.Fragment key={key}>{node}</React.Fragment>;
      })}
    </div>
  );
}

// ─── Message row ──────────────────────────────────────────────────────────────

function MessageRow({ message }: { message: AgentMessage }) {
  const isUser = message.role === "you";
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) {
        window.clearTimeout(copiedTimeoutRef.current);
        copiedTimeoutRef.current = null;
      }
    };
  }, []);

  if (isUser) {
    return (
      <div className="flex justify-end mb-5">
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
            <div className="px-4 py-3 bg-text-primary text-bg-card rounded-full text-[13px] leading-relaxed whitespace-pre-wrap">
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
    <div className="mb-5 group/response">
      <AgentMarkdown content={message.content} />
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(message.content).catch(() => {});
          if (copiedTimeoutRef.current) {
            window.clearTimeout(copiedTimeoutRef.current);
          }
          setCopied(true);
          copiedTimeoutRef.current = window.setTimeout(() => {
            setCopied(false);
            copiedTimeoutRef.current = null;
          }, 1200);
        }}
        className={cn(
          "mt-1 inline-flex items-center justify-center rounded-sm p-1",
          "cursor-pointer transition-all duration-200 ease-out",
          "opacity-0 translate-y-0.5 group-hover/response:opacity-100 group-hover/response:translate-y-0",
          "focus-visible:opacity-100 focus-visible:translate-y-0",
          copied
            ? "text-accent-green"
            : "text-text-faint hover:text-text-secondary",
        )}
        title="Copy response"
        aria-label="Copy response"
      >
        {copied ? (
          <Check size={11} strokeWidth={2.2} />
        ) : (
          <Copy size={11} strokeWidth={2} />
        )}
      </button>
    </div>
  );
}

// ─── Streaming message ────────────────────────────────────────────────────────

function StreamingMessage({ buffer }: { buffer: string }) {
  return (
    <div className="mb-5">
      <AgentMarkdown content={buffer} streaming />
      <span className="inline-block w-[2px] h-[14px] ml-0.5 bg-text-faint align-middle animate-cursor-blink" />
    </div>
  );
}

// ─── Activity feed ────────────────────────────────────────────────────────────

const TOOL_ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  shell:      <Terminal size={10} className="shrink-0" />,
  read_file:  <FileCode size={10} className="shrink-0" />,
  write_file: <Pencil size={10} className="shrink-0" />,
  search:     <Search size={10} className="shrink-0" />,
  tool:       <Code2 size={10} className="shrink-0" />,
};

function isThinkingActivity(a: AgentActivity): boolean {
  return a.kind === "log" && a.label === "thinking";
}

const DURATION_MS = 1000;

function activityDurationSeconds(activity: AgentActivity): number | undefined {
  if (activity.status === "running" || activity.durationMs == null) {
    return undefined;
  }
  return Math.max(1, Math.ceil(activity.durationMs / DURATION_MS));
}

/** Model reasoning — ai-elements Reasoning pattern (collapsible + shimmer). */
function ThinkingCard({ activity }: { activity: AgentActivity }) {
  const isStreaming = activity.status === "running";
  const detail = activity.detail?.trim() ?? "";
  const durationSec = activityDurationSeconds(activity);

  return (
    <div className="mb-2">
      <Reasoning
        key={activity.id}
        isStreaming={isStreaming}
        duration={durationSec}
        defaultOpen={isStreaming}
      >
        <ReasoningTrigger />
        {detail ? <ReasoningContent>{detail}</ReasoningContent> : null}
      </Reasoning>
    </div>
  );
}

function toolTriggerLabel(
  label: string,
  isStreaming: boolean,
  duration?: number,
): string {
  if (isStreaming || duration === 0) {
    return `${label}…`;
  }
  if (duration === undefined) {
    return label;
  }
  return `${label} · ${duration}s`;
}

/** Non-shell tools — same collapsible / shimmer pattern as reasoning. */
function ToolReasoningRow({ activity }: { activity: AgentActivity }) {
  const isStreaming = activity.status === "running";
  const detail = activity.detail ?? "";
  const durationSec = activityDurationSeconds(activity);

  return (
    <div className="mb-2">
      <Reasoning
        key={activity.id}
        isStreaming={isStreaming}
        duration={durationSec}
        defaultOpen={Boolean(isStreaming && detail)}
      >
        <ReasoningTrigger
          getThinkingMessage={(streaming, dur) =>
            toolTriggerLabel(activity.label, streaming, dur)
          }
        />
        {detail.trim() ? (
          <ReasoningContent>{detail}</ReasoningContent>
        ) : null}
      </Reasoning>
    </div>
  );
}

/** Shell / bash — monospace + bordered detail (unchanged UX). */
function ShellActivityRow({ activity }: { activity: AgentActivity }) {
  const [expanded, setExpanded] = useState(false);
  const icon = TOOL_ACTIVITY_ICONS.shell;
  const isRunning = activity.status === "running";

  return (
    <div className="mb-2 flex flex-col gap-0.5 rounded-lg border border-border-light bg-bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => activity.detail && setExpanded((v) => !v)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 text-left w-full bg-bg-secondary hover:bg-bg-card transition-colors duration-120",
          activity.detail ? "cursor-pointer" : "cursor-default",
        )}
      >
        <span
          className={cn(
            "transition-colors duration-120",
            isRunning ? "text-accent-blue animate-pulse" : "text-text-faint",
          )}
        >
          {icon}
        </span>
        <span className="font-mono text-[10.5px] text-text-tertiary uppercase tracking-wider">
          {activity.label}
        </span>
        {activity.detail ? (
          <span className="font-mono text-[10.5px] text-text-faint truncate max-w-[280px]">
            {activity.detail}
          </span>
        ) : null}
        {isRunning ? (
          <Loader2 size={9} className="text-accent-blue animate-spin shrink-0 ml-auto" />
        ) : null}
        {!isRunning && activity.durationMs !== undefined ? (
          <span className="font-mono text-[9.5px] text-text-faint ml-auto shrink-0 tabular-nums">
            {activity.durationMs < 1000
              ? `${activity.durationMs}ms`
              : `${(activity.durationMs / 1000).toFixed(1)}s`}
          </span>
        ) : null}
        {activity.detail ? (
          <ChevronDown
            size={10}
            className={cn(
              "text-text-faint transition-transform duration-150 shrink-0",
              expanded ? "rotate-180" : "",
            )}
          />
        ) : null}
      </button>
      {expanded && activity.detail ? (
        <div className="px-3 py-2 border-t border-border-light bg-bg-card">
          <pre className="font-mono text-[10.5px] text-text-secondary whitespace-pre-wrap leading-relaxed">
            {activity.detail}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

function ActivityFeed({ activities }: { activities: AgentActivity[] }) {
  const thinkingActs = activities.filter(isThinkingActivity);
  const toolActs = activities.filter((a) => !isThinkingActivity(a));
  if (thinkingActs.length === 0 && toolActs.length === 0) return null;

  return (
    <div className="mb-2">
      {thinkingActs.map((act) => (
        <ThinkingCard key={act.id} activity={act} />
      ))}
      {toolActs.map((act) =>
        act.kind === "shell" ? (
          <ShellActivityRow key={act.id} activity={act} />
        ) : (
          <ToolReasoningRow key={act.id} activity={act} />
        ),
      )}
    </div>
  );
}

// ─── Thinking indicator ───────────────────────────────────────────────────────

function ThinkingIndicator() {
  return (
    <div className="mb-4 flex items-center gap-2">
      <Loader2 size={11} className="text-text-faint animate-spin shrink-0" />
      <ShimmerText className="text-[12px] font-sans">
        Thinking...
      </ShimmerText>
    </div>
  );
}

// ─── Approval banner ──────────────────────────────────────────────────────────

function ApprovalBanner({
  approval,
  onResolved,
}: {
  approval: ApprovalRequest;
  onResolved: () => void;
}) {
  const [responding, setResponding] = useState(false);

  const respond = useCallback(
    async (decision: string) => {
      setResponding(true);
      try {
        if (approval.type === "permissions") {
          await rpcRespond(approval.rpcId, {
            permissions: approval.permissions ?? {},
            scope: decision === "acceptForSession" ? "session" : "turn",
          });
        } else {
          await rpcRespond(approval.rpcId, { decision });
        }
        onResolved();
      } catch (e) {
        console.error("Approval response failed", e);
      } finally {
        setResponding(false);
      }
    },
    [approval, onResolved],
  );

  const icon =
    approval.type === "commandExecution" ? (
      <Play size={12} className="text-accent-amber" />
    ) : approval.type === "fileChange" ? (
      <FileEdit size={12} className="text-accent-amber" />
    ) : (
      <Lock size={12} className="text-accent-amber" />
    );

  const title =
    approval.type === "commandExecution"
      ? "run command"
      : approval.type === "fileChange"
        ? "apply file changes"
        : "grant permissions";

  return (
    <div className="mb-4 border border-accent-amber/30 rounded-lg overflow-hidden bg-bg-card">
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border-light bg-bg-secondary">
        <Shield size={11} className="text-accent-amber shrink-0" />
        <span className="font-mono text-[10px] text-accent-amber uppercase tracking-widest">
          Approval required
        </span>
      </div>

      <div className="px-3.5 py-3 space-y-2">
        <div className="flex items-start gap-2">
          {icon}
          <div className="flex-1 min-w-0">
            <span className="font-sans text-[12.5px] text-text-primary">{title}</span>
            {approval.reason && (
              <p className="font-sans text-[11.5px] text-text-secondary mt-0.5 leading-snug">
                {approval.reason}
              </p>
            )}
          </div>
        </div>

        {approval.command && (
          <div className="rounded-md bg-bg-secondary border border-border-light px-3 py-2">
            <pre className="font-mono text-[11px] text-text-secondary whitespace-pre-wrap break-all leading-relaxed">
              {approval.command}
            </pre>
            {approval.cwd && (
              <span className="font-mono text-[9.5px] text-text-faint mt-1 block">
                {approval.cwd}
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => respond("accept")}
            disabled={responding}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-text-primary text-bg-card text-[11.5px] font-sans font-medium hover:opacity-90 transition-opacity duration-120 cursor-pointer disabled:opacity-50"
          >
            allow
            <kbd className="font-mono text-[8.5px] opacity-60 ml-1">⌘⏎</kbd>
          </button>
          <button
            onClick={() => respond("acceptForSession")}
            disabled={responding}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border-default text-text-secondary text-[11.5px] font-sans hover:bg-bg-secondary transition-colors duration-120 cursor-pointer disabled:opacity-50"
          >
            always allow
          </button>
          <button
            onClick={() => respond("decline")}
            disabled={responding}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border-default text-text-secondary text-[11.5px] font-sans hover:bg-bg-secondary transition-colors duration-120 cursor-pointer disabled:opacity-50"
          >
            deny
          </button>
          <div className="flex-1" />
          <button
            onClick={() => respond("cancel")}
            disabled={responding}
            className="font-sans text-[11px] text-text-faint hover:text-text-secondary transition-colors duration-120 cursor-pointer disabled:opacity-50"
          >
            cancel turn
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Git button ───────────────────────────────────────────────────────────────

function GitButton({
  pr,
  projectPath,
  branch,
  onGitAction,
  onBranchCreated,
}: {
  pr: string | null;
  projectPath: string | null;
  branch: string;
  onGitAction: () => void;
  onBranchCreated?: (branch: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [commitOpen, setCommitOpen] = useState(false);
  const [createBranchOpen, setCreateBranchOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [gitError, setGitError] = useState<string | null>(null);

  const handleCommit = async () => {
    if (!projectPath || !commitMessage.trim()) return;
    setGitError(null);
    try {
      await invoke("git_commit", {
        path: projectPath,
        message: commitMessage.trim(),
      });
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
      const info = await invoke<{
        originUrl?: string | null;
        branch?: string | null;
      }>("get_git_info", { path: projectPath });
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
        <div className="absolute right-0 top-full mt-1.5 w-52 rounded-lg glass-overlay z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-border-light">
            <div className="font-mono text-[9.5px] text-text-faint uppercase tracking-widest mb-0.5">
              current branch
            </div>
            <div className="flex items-center gap-1.5">
              <GitBranch size={10} className="text-text-tertiary shrink-0" />
              <span className="font-mono text-[11px] text-text-primary truncate">
                {branch || "—"}
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
            <span className="text-[12px] text-text-primary">Push</span>
          </button>
          <div className="border-t border-border-light" role="separator" />
          <button
            onClick={handleCreatePR}
            className="w-full flex items-center gap-2.5 px-3 py-2 glass-menu-row cursor-pointer text-left outline-none"
          >
            <img
              src="/octicon.svg"
              alt=""
              className="w-3 h-3 shrink-0 opacity-40 dark:invert"
            />
            <span className="text-[12px] text-text-primary">
              Open PR on GitHub
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
              placeholder="Describe your changes..."
              className="w-full px-3 py-2 rounded-md border border-border-default bg-bg-input text-[13px] text-text-primary placeholder:text-text-faint mb-3"
            />
            {gitError && (
              <p className="text-[11px] text-accent-red mb-2">{gitError}</p>
            )}
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

function OpenInButton() {
  const [open, setOpen] = useState(false);
  const [appIcons, setAppIcons] = useState<Record<string, string>>({});
  const [detectedApps, setDetectedApps] = useState<
    Array<{ id: string; name: string; isAccessible: boolean }>
  >([]);
  const projectPath = useAppStore((s) => s.projectPath);
  const apps = useAppListStore((s) => s.apps);
  const displayApps = useMemo(
    () =>
      (detectedApps.length > 0 ? detectedApps : apps).filter(
        (app) => app.isAccessible,
      ),
    [apps, detectedApps],
  );

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
          if (iconDataUrl) next[appId] = iconDataUrl;
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

  const firstApp = displayApps[0];
  const triggerIconUrl = firstApp ? appIcons[firstApp.id] : undefined;
  const TriggerIcon = firstApp
    ? (APP_ICON_MAP[firstApp.id.toLowerCase()] ?? Box)
    : Box;

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
        ) : (
          <TriggerIcon size={12} className="shrink-0" />
        )}
        <ChevronDown size={9} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-44 rounded-lg glass-overlay z-50 overflow-hidden">
          {displayApps.map((app) => {
            const Icon = APP_ICON_MAP[app.id.toLowerCase()] ?? Box;
            const iconDataUrl = appIcons[app.id];
            return (
              <button
                key={app.id}
                onClick={() => handleOpenIn(app.id)}
                disabled={!projectPath}
                className="w-full flex items-center gap-2.5 px-3 py-2 glass-menu-row cursor-pointer text-left outline-none disabled:opacity-50 disabled:cursor-default"
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

// ─── Diff button ──────────────────────────────────────────────────────────────

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
        <div className="absolute right-0 top-full mt-1.5 w-64 rounded-lg glass-overlay z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-border-light">
            <span className="font-mono text-[9.5px] text-text-faint uppercase tracking-widest">
              Changed Files
            </span>
          </div>
          <div className="max-h-64 overflow-y-auto">
            <div className="px-3 py-2 text-center">
              <span className="font-mono text-[11px] text-text-faint">
                diff viewer coming soon
              </span>
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

// ─── Main ChatView ────────────────────────────────────────────────────────────

export function ChatView({ agent, onBack }: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const accent = statusColor(agent);
  const projectPath = useAppStore((s) => s.projectPath);
  const setAgentCodexThreadId = useThreadStore((s) => s.setAgentCodexThreadId);
  const appendAgentMessage = useThreadStore((s) => s.appendAgentMessage);
  const updateAgentGitInfo = useThreadStore((s) => s.updateAgentGitInfo);
  const setAgentPendingApproval = useThreadStore((s) => s.setAgentPendingApproval);
  const updateAgentTitle = useThreadStore((s) => s.updateAgentTitle);

  const clearApproval = useCallback(() => {
    setAgentPendingApproval(agent.id, null);
  }, [agent.id, setAgentPendingApproval]);

  // Scroll to bottom on new messages / streaming updates / approval
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [agent.messages.length, agent.streamingBuffer, agent.pendingApproval]);

  // Fetch git info on mount
  useEffect(() => {
    if (!projectPath) return;
    invoke<{
      branch?: string | null;
      sha?: string | null;
      originUrl?: string | null;
    }>("get_git_info", { path: projectPath })
      .then((info) => {
        if (!info?.branch && !info?.sha && !info?.originUrl) return;
        updateAgentGitInfo(agent.id, {
          branch: info.branch ?? undefined,
          sha: info.sha ?? undefined,
          originUrl: info.originUrl ?? undefined,
        });
        if (!agent.codexThreadId) return;
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
  }, [agent.id, agent.codexThreadId, projectPath, updateAgentGitInfo]);

  const handleSend = useCallback(
    async (message: string, attachments: Attachment[]) => {
      const trimmed = message.trim();
      if (!trimmed && attachments.length === 0) return;

      const wasUnsetTitle = agent.title === NEW_THREAD_TITLE;

      const displayContent =
        trimmed ||
        (attachments.length > 0
          ? `[${attachments.map((a) => a.name).join(", ")}]`
          : "");
      const imageUrls = attachments
        .filter((a) => a.mime?.startsWith("image/") && a.dataUrl)
        .map((a) => a.dataUrl as string);
      appendAgentMessage(agent.id, {
        role: "you",
        content: displayContent,
        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
      });

      const provisionalTitle = wasUnsetTitle
        ? titleFromFirstSendDisplay(displayContent)
        : null;
      if (provisionalTitle) {
        updateAgentTitle(agent.id, provisionalTitle);
      }

      let threadId = agent.codexThreadId;
      if (!threadId) {
        try {
          const selected = getSelectedModel();
          const res = await rpcRequest<{
            thread: { id: string; name?: string | null };
          }>("thread/start", {
            cwd: projectPath ?? undefined,
            model: selected.id,
            modelProvider: selected?.provider,
          });
          threadId = res?.thread?.id;
          if (threadId) setAgentCodexThreadId(agent.id, threadId);
          const serverName =
            typeof res?.thread?.name === "string" ? res.thread.name.trim() : "";
          if (serverName.length > 0) {
            const fromServer = truncateChatTitle(serverName);
            if (fromServer.length > 0) {
              updateAgentTitle(agent.id, fromServer);
            }
          }
        } catch (e) {
          console.error("thread/start failed", e);
          return;
        }
      }
      if (!threadId) return;

      if (wasUnsetTitle) {
        const latestTitle =
          useThreadStore
            .getState()
            .agents.find((a) => a.id === agent.id)
            ?.title.trim() ?? "";
        if (latestTitle.length > 0 && latestTitle !== NEW_THREAD_TITLE) {
          rpcRequest("thread/name/set", { threadId, name: latestTitle }).catch((e) => {
            console.error("thread/name/set failed", e);
          });
        }

        if (displayContent.trim().length > 0) {
          generateThreadTitle(displayContent)
            .then((generatedTitle) => {
              if (!generatedTitle) return;
              const currentTitle =
                useThreadStore.getState().agents.find((a) => a.id === agent.id)?.title ?? "";
              if (
                currentTitle !== NEW_THREAD_TITLE &&
                provisionalTitle &&
                currentTitle !== provisionalTitle
              ) {
                return;
              }
              updateAgentTitle(agent.id, generatedTitle);
              return rpcRequest("thread/name/set", { threadId, name: generatedTitle });
            })
            .catch((e) => {
              console.error("thread title generation failed", e);
            });
        }
      }

      const inputItems: Array<Record<string, unknown>> = [];
      for (const att of attachments) {
        if (att.mime?.startsWith("image/") && att.dataUrl) {
          inputItems.push({ type: "image", url: att.dataUrl });
        } else if (att.mime?.startsWith("image/") && isAbsoluteFilePath(att.path)) {
          inputItems.push({ type: "localImage", path: att.path });
        } else if (isAbsoluteFilePath(att.path)) {
          inputItems.push({
            type: "mention",
            name: att.name,
            path: att.path,
          });
        } else {
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
    },
    [
      agent.id,
      agent.codexThreadId,
      agent.title,
      projectPath,
      appendAgentMessage,
      setAgentCodexThreadId,
      updateAgentTitle,
    ],
  );

  const [stopping, setStopping] = useState(false);
  const [fileTreeOpen, setFileTreeOpen] = useState(false); // visible
  const [fileTreeMounted, setFileTreeMounted] = useState(false); // keep mounted during close animation
  const fileTreeCloseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (fileTreeCloseTimerRef.current) {
        window.clearTimeout(fileTreeCloseTimerRef.current);
        fileTreeCloseTimerRef.current = null;
      }
    };
  }, []);

  const toggleFileTree = useCallback(() => {
    if (!fileTreeOpen) {
      // Opening: mount immediately, then animate in.
      if (fileTreeCloseTimerRef.current) {
        window.clearTimeout(fileTreeCloseTimerRef.current);
        fileTreeCloseTimerRef.current = null;
      }
      setFileTreeMounted(true);
      setFileTreeOpen(true);
      return;
    }

    // Closing: animate out by toggling visibility; keep mounted until animation ends.
    setFileTreeOpen(false);
    fileTreeCloseTimerRef.current = window.setTimeout(() => {
      setFileTreeMounted(false);
      fileTreeCloseTimerRef.current = null;
    }, 200);
  }, [fileTreeOpen]);

  const handleStop = useCallback(async () => {
    const tid = agent.codexThreadId;
    const turnId = agent.currentTurnId;
    if (!tid || !turnId) return;
    setStopping(true);
    try {
      await interruptTurn(tid, turnId);
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
    } catch {
      // ignore
    } finally {
      setStopping(false);
    }
  }, [agent.id, agent.codexThreadId, agent.currentTurnId]);

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

  const canCompose =
    agent.status !== "queued" && agent.status !== "deployed";

  const isThinking =
    agent.turnInProgress &&
    !agent.streamingBuffer &&
    agent.messages[agent.messages.length - 1]?.role === "you";

  const hasInlineThinkingStream =
    agent.activities?.some(
      (a) => a.id === STREAMING_THINKING_ACTIVITY_ID && a.status === "running",
    ) ?? false;

  const isRunning = agent.status === "active" && agent.turnInProgress;
  const isReview = agent.status === "review";
  const isBlocked = agent.blocked;
  const hasPendingApproval = !!agent.pendingApproval;
  const showBar = isRunning || isReview || isBlocked || hasPendingApproval;

  const projectName = projectPath?.split("/").pop() ?? "";

  return (
    <div className="flex flex-col h-full bg-bg-primary overflow-hidden">
      {/* Top bar — spans full width */}
      <div
        data-tauri-drag-region
        className="h-12 shrink-0 flex items-center pl-[92px] pr-4 gap-3 border-b border-border-light select-none"
      >
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-text-faint hover:text-text-secondary cursor-pointer transition-colors duration-120 shrink-0 mr-1"
        >
          <ChevronLeft size={12} />
          <span className="font-sans text-[10px]">Back</span>
        </button>

        <div className="h-4 w-px bg-border-light shrink-0" />

        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: accent }}
          />
          <span className="text-[13px] font-medium text-text-primary tracking-[-0.01em] truncate">
            {agent.title}
          </span>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[9.5px] text-text-faint uppercase tracking-widest">
              time
            </span>
            <span className="font-mono text-[11px] text-text-secondary">
              {agent.time}
            </span>
          </div>
          <div className="h-3 w-px bg-border-light" />
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[9.5px] text-text-faint uppercase tracking-widest">
              tokens
            </span>
            <span className="font-mono text-[11px] text-text-secondary">
              {agent.tokens}
            </span>
          </div>
          <div className="h-3 w-px bg-border-light" />
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[9.5px] text-text-faint uppercase tracking-widest">
              files
            </span>
            <span className="font-mono text-[11px] text-text-secondary">
              {agent.files.length}
            </span>
          </div>
          {agent.status !== "queued" && (
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
          <DiffButton fileCount={agent.files.length} />
          <OpenInButton />
          <GitButton
            pr={agent.pr}
            projectPath={projectPath}
            branch={agent.branch}
            onGitAction={() => {}}
            onBranchCreated={(b) => updateAgentGitInfo(agent.id, { branch: b })}
          />
        </div>
      </div>

      {/* Content area — chat with overlaying file tree */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden relative">
        {/* File tree overlay (no layout shift) */}
        <div
          className={cn(
            "absolute left-0 top-0 bottom-0 z-40 w-[260px] transition-transform duration-200 ease-out",
            fileTreeOpen ? "translate-x-0" : "-translate-x-full",
          )}
          aria-hidden={!fileTreeMounted}
        >
          {fileTreeMounted && (
            <FileTreeView
              projectPath={projectPath}
              projectName={projectName}
              branch={agent.branch}
              open={fileTreeMounted}
              onClose={() => {}}
            />
          )}
        </div>

        {/* Stash — icon only, just past the panel edge (chat side) */}
        {fileTreeOpen && (
          <button
            type="button"
            onClick={toggleFileTree}
            className="absolute left-[260px] top-1/2 z-50 -translate-y-1/2 p-2 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-secondary/80 transition-colors duration-150 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-blue focus-visible:outline-offset-2"
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

        {/* Chat column */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

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
              {agent.messages.length > 0 &&
              agent.messages[agent.messages.length - 1]?.role === "agent" ? (
                <>
                  {agent.messages.slice(0, -1).map((msg, i) => (
                    <MessageRow key={i} message={msg} />
                  ))}
                  {(agent.activities?.length ?? 0) > 0 && (
                    <ActivityFeed activities={agent.activities ?? []} />
                  )}
                  <MessageRow
                    key={agent.messages.length - 1}
                    message={agent.messages[agent.messages.length - 1]!}
                  />
                </>
              ) : (
                <>
                  {agent.messages.map((msg, i) => (
                    <MessageRow key={i} message={msg} />
                  ))}
                  {(agent.activities?.length ?? 0) > 0 && (
                    <ActivityFeed activities={agent.activities ?? []} />
                  )}
                </>
              )}

              {/* Approval banner — inline when server needs permission */}
              {agent.pendingApproval && (
                <ApprovalBanner
                  approval={agent.pendingApproval}
                  onResolved={clearApproval}
                />
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

      {/* Compose + action bar stacked — bar peeks out behind compose like a folder tab */}
      <div className="max-w-[680px] mx-auto w-full px-6 pb-4 shrink-0 relative">

        {/* Action bar — rendered first so it sits behind compose in z-order */}
        {showBar && (agent.files.length > 0 || hasPendingApproval) && (
          <div className="absolute bottom-0 left-6 right-6 pb-4 flex justify-center pointer-events-none">
            {/* Narrower than compose: 24px inset each side */}
            <div className="w-full mx-6 pointer-events-auto">
              <div className="flex items-center h-9 rounded-b-lg border border-t-0 border-border-default bg-bg-secondary overflow-hidden">

                {/* Left — file count */}
                <button className="flex items-center gap-1.5 pl-3 pr-2 h-full hover:bg-bg-card transition-colors duration-120 cursor-pointer shrink-0">
                  <ChevronDown size={11} className="text-text-faint" />
                  <span className="font-sans text-[12px] text-text-secondary">
                    {agent.files.length} {agent.files.length === 1 ? "file" : "files"}
                  </span>
                </button>

                <div className="flex-1" />

                {/* Pending approval indicator */}
                {hasPendingApproval && (
                  <div className="flex items-center gap-1.5 px-3 h-full border-r border-border-light">
                    <Shield size={10} className="text-accent-amber shrink-0" />
                    <span className="font-mono text-[10px] text-accent-amber uppercase tracking-wider">
                      Waiting for approval
                    </span>
                  </div>
                )}

                {/* Running: Stop */}
                {isRunning && (
                  <button
                    onClick={handleStop}
                    disabled={stopping || !agent.currentTurnId}
                    className="flex items-center gap-1.5 px-3 h-full hover:bg-bg-card transition-colors duration-120 cursor-pointer disabled:opacity-50 border-r border-border-light"
                  >
                    <span className="font-sans text-[12px] text-text-secondary">
                      {stopping ? "Stopping…" : "Stop"}
                    </span>
                    <kbd className="font-mono text-[9px] text-text-faint bg-bg-primary border border-border-light rounded px-1 py-0.5 leading-none">
                      ⌃C
                    </kbd>
                  </button>
                )}

                {/* Review state: ✓ Accept all / ✕ Reject all */}
                {isReview && (
                  <>
                    <button className="flex items-center gap-1.5 px-3 h-full hover:bg-bg-card transition-colors duration-120 cursor-pointer border-r border-border-light group/accept">
                      <div className="w-3.5 h-3.5 rounded-full bg-accent-green/15 flex items-center justify-center shrink-0">
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                          <path d="M1.5 4L3.5 6L6.5 2" stroke="var(--accent-green)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <span className="font-sans text-[12px] text-text-secondary group-hover/accept:text-text-primary transition-colors duration-120">
                        Accept all
                      </span>
                    </button>
                    <button className="flex items-center gap-1.5 px-3 h-full hover:bg-bg-card transition-colors duration-120 cursor-pointer border-r border-border-light group/reject">
                      <div className="w-3.5 h-3.5 rounded-full bg-accent-red/15 flex items-center justify-center shrink-0">
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                          <path d="M2 2L6 6M6 2L2 6" stroke="var(--accent-red)" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </div>
                      <span className="font-sans text-[12px] text-text-secondary group-hover/reject:text-text-primary transition-colors duration-120">
                        Reject all
                      </span>
                    </button>
                  </>
                )}

                {/* Blocked: Unblock */}
                {isBlocked && (
                  <button className="flex items-center gap-1.5 px-3 h-full hover:bg-bg-card transition-colors duration-120 cursor-pointer border-r border-border-light">
                    <span className="font-sans text-[12px] text-text-secondary hover:text-text-primary transition-colors duration-120">
                      Unblock
                    </span>
                  </button>
                )}

                {/* Review pill */}
                <button className="flex items-center px-3 h-full bg-bg-card hover:bg-bg-primary transition-colors duration-120 cursor-pointer border-l border-border-light">
                  <span className="font-sans text-[12px] font-medium text-text-primary">
                    Review
                  </span>
                </button>

              </div>
            </div>
          </div>
        )}

        {/* Compose — sits on top, with bottom padding to reveal the bar beneath */}
        <div className={cn(showBar && (agent.files.length > 0 || hasPendingApproval) ? "pb-7" : "")}>
          {canCompose ? (
            <ComposeArea
              onSend={handleSend}
              emptyThread={
                agent.messages.length === 0 && !agent.streamingBuffer
              }
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

      </div>{/* end chat column */}
      </div>{/* end content area flex-row */}
    </div>
  );
}
