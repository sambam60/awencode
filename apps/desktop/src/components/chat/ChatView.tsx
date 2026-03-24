import React, {
  Fragment,
  useRef,
  useEffect,
  useMemo,
  useState,
  useCallback,
  memo,
} from "react";
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  GitBranch,
  GitCommit,
  GitPullRequest,
  CloudUpload,
  Box,
  Terminal,
  FolderOpen,
  FileDiff,
  GitFork,
  FileCode,
  ExternalLink,
  Loader2,
  Shield,
  Copy,
  Check,
  FolderTree,
  Undo2,
  Square,
} from "lucide-react";
import { ComposeArea, type Attachment } from "./ComposeArea";
import { CodeBlock } from "./CodeBlock";
import { ShimmerText } from "./ShimmerText";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { agentStatusVisual, statusColor } from "@/lib/status";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { rpcRequest, rpcRespond } from "@/lib/rpc-client";
import { interruptTurn } from "@/lib/codex-turn";
import { sendChatTurn } from "@/lib/send-chat-turn";
import { submitPromptEditRevert } from "@/lib/submit-prompt-edit";
import { useAppStore } from "@/lib/stores/app-store";
import { useChatUiStore } from "@/lib/stores/chat-ui-store";
import { useSettingsStore } from "@/lib/stores/settings-store";
import { useViewStore } from "@/lib/stores/view-store";
import { useThreadStore } from "@/lib/stores/thread-store";
import { useAppListStore } from "@/lib/stores/app-list-store";
import {
  STREAMING_THINKING_ACTIVITY_ID,
  type Agent,
  type AgentActivity,
  type AgentMessage,
} from "@/lib/stores/thread-store";
import type { LinearIssue } from "@/lib/linear";
import { FileTreeView } from "./FileTreeView";
import { DiffActivityView } from "./DiffActivityView";
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
        <span className="font-mono text-[9px] text-text-links opacity-80 uppercase">
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

/** Workspace-relative paths in `[label](path)` — not http(s); open in editor. */
function safeMarkdownFilePath(href: string): string | null {
  const t = href.trim();
  if (t.length === 0 || t === "." || t === "..") return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return null;
  if (!/^[\w./-]+$/u.test(t)) return null;
  return t;
}

const markdownAnchorClass =
  "text-text-links underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-blue focus-visible:outline-offset-1 rounded-sm";

/** Strip trailing punctuation often pasted after URLs in prose. */
function trimUrlPunct(url: string): string {
  return url.replace(/[.,;:!?)]+$/gu, "");
}

/** Turn raw https URLs in plain text into anchors (models often omit markdown link syntax). */
function linkifyBareUrls(text: string, keyPrefix: string): React.ReactNode[] {
  const re = /https?:\/\/[^\s<>"'`]+/gi;
  const matches = [...text.matchAll(re)];
  if (matches.length === 0) {
    return [text];
  }
  const out: React.ReactNode[] = [];
  let last = 0;
  for (let j = 0; j < matches.length; j++) {
    const m = matches[j]!;
    const idx = m.index ?? 0;
    if (idx > last) {
      out.push(text.slice(last, idx));
    }
    const raw = m[0];
    const href = safeMarkdownHref(trimUrlPunct(raw));
    if (href) {
      out.push(
        <a
          key={`${keyPrefix}-u${j}`}
          href={href}
          target="_blank"
          rel="noreferrer"
          className={markdownAnchorClass}
        >
          {raw}
        </a>,
      );
    } else {
      out.push(raw);
    }
    last = idx + raw.length;
  }
  if (last < text.length) {
    out.push(text.slice(last));
  }
  return out;
}

function parseInline(text: string, keyPrefix: string): React.ReactNode[] {
  // **bold**, *em*, `code`, [File: path], [label](url), @file.ext (12-34)
  const parts = text.split(
    /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[File: [^\]]+\]|\[[^\]]+\]\([^)]+\)|@[\w./-]+\s*\(\d+(?:-\d+)?\))/g,
  );
  return parts.flatMap((part, i): React.ReactNode[] => {
    const key = `${keyPrefix}-${i}`;
    if (part === "") {
      return [];
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      if (part.length < 4) {
        return [part];
      }
      const inner = part.slice(2, -2);
      if (inner.length === 0) {
        return [part];
      }
      return [
        <strong key={key} className="font-semibold text-text-primary">
          {parseInline(inner, `${key}-b`)}
        </strong>,
      ];
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      if (part.length < 3) {
        return [part];
      }
      const inner = part.slice(1, -1);
      if (inner.length === 0) {
        return [part];
      }
      return [
        <em key={key} className="italic text-text-secondary">
          {parseInline(inner, `${key}-em`)}
        </em>,
      ];
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return [
        <code
          key={key}
          className="font-mono text-[11.5px] px-1.5 py-0.5 rounded bg-bg-secondary border border-border-light text-text-primary"
        >
          {part.slice(1, -1)}
        </code>,
      ];
    }
    const fileMatch = part.match(/^\[File: (.+)\]$/);
    if (fileMatch) {
      return [<FileChip key={key} path={fileMatch[1]} />];
    }
    const mdLink = part.match(/^\[([^\]]*)\]\(([^)]+)\)$/);
    if (mdLink) {
      const rawHref = mdLink[2];
      const webHref = safeMarkdownHref(rawHref);
      if (webHref) {
        return [
          <a
            key={key}
            href={webHref}
            target="_blank"
            rel="noreferrer"
            className={markdownAnchorClass}
          >
            {mdLink[1] || webHref}
          </a>,
        ];
      }
      const filePath = safeMarkdownFilePath(rawHref);
      if (filePath) {
        const label = mdLink[1] || filePath;
        return [
          <button
            key={key}
            type="button"
            title={filePath}
            onClick={() => {
              invoke("open_file_in_editor", { path: filePath }).catch(() => {});
            }}
            className={cn(
              markdownAnchorClass,
              "inline p-0 border-0 bg-transparent cursor-pointer text-left font-sans text-[13px]",
            )}
          >
            {label}
          </button>,
        ];
      }
      return [
        <span key={key} className="text-text-tertiary">
          {mdLink[1]}
        </span>,
      ];
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
      return [
        <button
          key={key}
          type="button"
          onClick={handleAtOpen}
          title={`Open ${refPath}`}
          className="inline font-mono text-[11px] text-text-links hover:opacity-90 underline-offset-2 hover:underline cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-blue focus-visible:outline-offset-1 rounded-sm"
        >
          @{refPath} ({atRef[2]}
          {atRef[3] ? `-${atRef[3]}` : ""})
        </button>,
      ];
    }
    const linked = linkifyBareUrls(part, key);
    if (linked.length === 1 && typeof linked[0] === "string") {
      return [linked[0]!];
    }
    return [<Fragment key={key}>{linked}</Fragment>];
  });
}

// Wrap a node in a div that blur-staggers in via CSS animation
const StreamBlock = memo(({ children }: { children: React.ReactNode }) => (
  <div className="animate-block-in">
    {children}
  </div>
));

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
    return (
      <p className="agent-markdown text-[13px] font-sans text-text-primary leading-relaxed min-w-0 [overflow-wrap:anywhere]">
        {parseInline(content, "fallback")}
      </p>
    );
  }

  return (
    <div className="agent-markdown font-sans min-w-0 [overflow-wrap:anywhere]">
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

function MessageRow({
  message,
  messageIndex,
  onEditPrompt,
  promptEditEnabled,
}: {
  message: AgentMessage;
  messageIndex: number;
  onEditPrompt?: (messageIndex: number, text: string) => void;
  promptEditEnabled?: boolean;
}) {
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
      <div className="flex justify-end mb-5 min-w-0">
        <div className="w-fit max-w-[80%] min-w-0 flex flex-col gap-2 items-end">
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
            <div className="min-w-0 max-w-full flex items-start gap-2 px-2.5 py-2 bg-bg-user-message border border-border-user-message rounded-[10px] text-[13px] text-text-primary leading-relaxed whitespace-pre-wrap text-left [overflow-wrap:anywhere]">
              <span className="min-w-0 flex-1">{message.content}</span>
              {onEditPrompt && promptEditEnabled ? (
                <button
                  type="button"
                  onClick={() => onEditPrompt(messageIndex, message.content)}
                  className="shrink-0 mt-0.5 p-1 rounded-md text-text-tertiary hover:text-text-secondary transition-colors duration-120 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-blue"
                  title="Edit prompt"
                  aria-label="Edit prompt"
                >
                  <Undo2 size={14} strokeWidth={2} />
                </button>
              ) : null}
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
    <div className="mb-5 group/response min-w-0">
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
    <div className="mb-5 min-w-0">
      <AgentMarkdown content={buffer} streaming />
      <span className="inline-block w-[2px] h-[14px] ml-0.5 bg-text-faint align-middle animate-cursor-blink" />
    </div>
  );
}

// ─── Activity feed ────────────────────────────────────────────────────────────

function isThinkingActivity(a: AgentActivity): boolean {
  return a.kind === "log" && a.label === "thinking";
}

const DURATION_MS = 1000;
const FILE_TREE_DEFAULT_WIDTH_PX = 244;
const FILE_TREE_MIN_WIDTH_PX = 216;
const FILE_TREE_MAX_WIDTH_PX = 360;

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

/** First shell invocations for a muted inline summary (e.g. `cd, npx`). */
function shellCommandBins(cmd: string): string {
  const segments = cmd.split(/(?:&&|\|\||;|\n)/g);
  const bins: string[] = [];
  const seen = new Set<string>();
  for (const seg of segments) {
    const t = seg.trim();
    if (!t || t.startsWith("#")) continue;
    const raw = t.split(/\s+/)[0] ?? "";
    const token = raw
      .replace(/^[{(['"`]+/, "")
      .replace(/['")\]}]+$/, "");
    if (!token || seen.has(token)) continue;
    seen.add(token);
    bins.push(token);
    if (bins.length >= 5) break;
  }
  return bins.join(", ");
}

/** Single shell command row — borderless, rendered inside a group card. */
function ShellActivityRow({ activity, isLast }: { activity: AgentActivity; isLast?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<number | null>(null);
  const isRunning = activity.status === "running";
  const commandLine =
    activity.shellCommand ?? (activity.detail?.trim() ? activity.detail : "") ?? "";
  const output = activity.shellCommand != null ? (activity.detail ?? "").trim() : "";
  const fallbackExpandedContent =
    activity.shellCommand == null ? (activity.detail ?? "").trim() : "";
  const expandedContent = output || fallbackExpandedContent;
  const canExpand = isRunning || expandedContent.length > 0;
  const bins = shellCommandBins(commandLine);

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      (e.currentTarget as HTMLButtonElement).blur();
      const text =
        expandedContent.length > 0 ? `${commandLine}\n\n${expandedContent}` : commandLine;
      if (!text.trim()) return;
      navigator.clipboard.writeText(text).catch(() => {});
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
      setCopied(true);
      copyTimeoutRef.current = window.setTimeout(() => {
        setCopied(false);
        copyTimeoutRef.current = null;
      }, 1600);
    },
    [commandLine, expandedContent],
  );

  return (
    <div className={cn(!isLast && "border-b border-border-shell-surface")}>
      <div
        className={cn(
          "group/shell-header flex min-h-[32px] items-stretch transition-colors duration-120",
          canExpand
            ? "cursor-pointer hover:bg-[rgba(0,0,0,0.04)] dark:hover:bg-[rgba(255,255,255,0.04)]"
            : "",
        )}
        onClick={() => canExpand && setExpanded((v) => !v)}
        role={canExpand ? "button" : undefined}
        aria-expanded={canExpand ? expanded : undefined}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5">
          {canExpand ? (
            <ChevronRight
              size={12}
              strokeWidth={2}
              className={cn(
                "shrink-0 text-shell-text-muted transition-all duration-150",
                expanded
                  ? "rotate-90 opacity-100"
                  : "rotate-0 opacity-0 group-hover/shell-header:opacity-100 group-focus-within/shell-header:opacity-100",
              )}
              aria-hidden
            />
          ) : (
            <span className="w-3 shrink-0" aria-hidden />
          )}
          <Terminal
            size={11}
            strokeWidth={2}
            className="shrink-0 text-text-faint"
            aria-hidden
          />
          <div className="min-w-0 flex-1 flex items-center gap-2">
            <span className="truncate font-sans text-[12px] leading-tight text-shell-text">
              {commandLine.trim() ? commandLine : "—"}
            </span>
            {bins ? (
              <span className="shrink-0 font-sans text-[10.5px] leading-tight text-shell-text-muted">
                {bins}
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5 pl-1">
            {isRunning ? (
              <Loader2 size={10} className="text-accent-blue animate-spin" />
            ) : null}
            {!isRunning && activity.durationMs !== undefined ? (
              <span className="font-sans text-[9.5px] tabular-nums text-shell-text-muted">
                {activity.durationMs < 1000
                  ? `${activity.durationMs}ms`
                  : `${(activity.durationMs / 1000).toFixed(1)}s`}
              </span>
            ) : null}
          </div>
        </div>
        {commandLine.trim() ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleCopy(e); }}
            title="Copy command and output"
            aria-label="Copy command and output"
            className={cn(
              "flex items-center justify-center px-2 transition-all duration-150",
              "text-shell-text-muted hover:text-shell-text",
              "opacity-0 group-hover/shell-header:opacity-100 group-focus-within/shell-header:opacity-100",
            )}
          >
            {copied ? (
              <Check size={12} strokeWidth={2.2} className="text-accent-green" />
            ) : (
              <Copy size={12} strokeWidth={2} />
            )}
          </button>
        ) : null}
      </div>
      {expanded && canExpand ? (
        <div className="border-t border-border-shell-surface px-3 py-2">
          {expandedContent ? (
            <pre className="font-mono text-[11px] leading-relaxed text-text-secondary whitespace-pre-wrap [overflow-wrap:anywhere]">
              {expandedContent}
            </pre>
          ) : isRunning ? (
            <span className="font-mono text-[11px] text-shell-text-muted">…</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const SHELL_COLLAPSE_THRESHOLD = 3;

/** Wraps consecutive shell activities in one card; auto-collapses older ones. */
function ShellActivityGroup({ activities }: { activities: AgentActivity[] }) {
  const collapsible = activities.length > SHELL_COLLAPSE_THRESHOLD;
  const [expanded, setExpanded] = useState(false);
  const hiddenCount = activities.length - SHELL_COLLAPSE_THRESHOLD;
  const visible = collapsible && !expanded
    ? activities.slice(activities.length - SHELL_COLLAPSE_THRESHOLD)
    : activities;

  return (
    <div className="mb-1.5 rounded-lg border border-border-shell-surface overflow-hidden bg-bg-shell-surface shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.35)]">
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 text-shell-text-muted hover:text-shell-text transition-colors duration-120 cursor-pointer border-b border-border-shell-surface"
        >
          <ChevronDown
            size={10}
            strokeWidth={2}
            className={cn("transition-transform duration-150", expanded && "rotate-180")}
          />
          <span className="font-sans text-[11px]">
            {expanded
              ? "Collapse"
              : `${hiddenCount} earlier command${hiddenCount === 1 ? "" : "s"}`}
          </span>
        </button>
      )}
      {visible.map((act, i) => (
        <ShellActivityRow
          key={act.id}
          activity={act}
          isLast={i === visible.length - 1}
        />
      ))}
    </div>
  );
}

function ActivityFeed({ activities }: { activities: AgentActivity[] }) {
  const thinkingActs = activities.filter(isThinkingActivity);
  const toolActs = activities.filter((a) => !isThinkingActivity(a));
  if (thinkingActs.length === 0 && toolActs.length === 0) return null;

  /** Group consecutive shell activities into runs. */
  const groups: Array<{ kind: "shell"; items: AgentActivity[] } | { kind: "tool"; item: AgentActivity }> = [];
  for (const act of toolActs) {
    if (act.kind === "shell") {
      const last = groups[groups.length - 1];
      if (last?.kind === "shell") {
        last.items.push(act);
      } else {
        groups.push({ kind: "shell", items: [act] });
      }
    } else {
      groups.push({ kind: "tool", item: act });
    }
  }

  return (
    <div className="mb-2">
      {thinkingActs.map((act) => (
        <ThinkingCard key={act.id} activity={act} />
      ))}
      {groups.map((g) =>
        g.kind === "shell" ? (
          <ShellActivityGroup key={g.items[0].id} activities={g.items} />
        ) : (
          <ToolReasoningRow key={g.item.id} activity={g.item} />
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

// ─── Git button ───────────────────────────────────────────────────────────────

function GitButton({
  pr,
  projectPath,
  branch,
  onGitAction,
  onCommitSuccess,
  onBranchCreated,
}: {
  pr: string | null;
  projectPath: string | null;
  branch: string;
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

  const DEFAULT_BRANCHES = ["main", "master", "develop", "dev"];
  const onDefaultBranch = DEFAULT_BRANCHES.includes(branch.trim().toLowerCase());
  const hasPr = onDefaultBranch ? false : (Boolean(pr) || Boolean(detectedPrUrl));
  const canCreatePr = !hasPr && !onDefaultBranch && Boolean(branch.trim());

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

      const info = await invoke<{
        originUrl?: string | null;
        branch?: string | null;
      }>("get_git_info", { path: projectPath });
      const url = info?.originUrl;
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
            onClick={handlePRAction}
            disabled={!hasPr && !canCreatePr}
            title={
              !hasPr && onDefaultBranch
                ? "Create a feature branch first to open a PR"
                : undefined
            }
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

function DiffButton({ files }: { files: string[] }) {
  const [open, setOpen] = useState(false);
  const fileCount = files.length;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => fileCount > 0 && setOpen((v) => !v)}
        title={fileCount > 0 ? "Changed files" : "No changed files"}
        className={cn(
          "flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[11px] transition-colors duration-120",
          fileCount > 0
            ? "border-border-default text-text-secondary bg-bg-secondary hover:bg-bg-card cursor-pointer"
            : "border-border-light text-text-faint bg-bg-secondary cursor-default",
        )}
        disabled={fileCount === 0}
      >
        <FileDiff size={12} strokeWidth={1.75} className="shrink-0" />
        <span
          className={cn(
            "font-sans leading-none tabular-nums",
            fileCount > 0 ? "text-text-secondary" : "text-text-faint",
          )}
        >
          {fileCount}
        </span>
      </button>
      {open && fileCount > 0 && (
        <div className="absolute right-0 top-full mt-1.5 w-64 rounded-lg glass-overlay z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-border-light">
            <span className="font-mono text-[9.5px] text-text-faint uppercase tracking-widest">
              Changed Files
            </span>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {files.map((file) => (
              <div
                key={file}
                className="px-3 py-2 font-mono text-[11px] text-text-secondary border-b border-border-light last:border-b-0 truncate"
                title={file}
              >
                {file}
              </div>
            ))}
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
          ...(!agent.branch.trim() && info.branch ? { branch: info.branch } : {}),
          sha: info.sha ?? undefined,
          originUrl: info.originUrl ?? undefined,
        });
        if (!agent.codexThreadId) return;
        return rpcRequest("thread/metadata/update", {
          threadId: agent.codexThreadId,
          gitInfo: {
            branch: agent.branch || info.branch || undefined,
            sha: info.sha ?? undefined,
            originUrl: info.originUrl ?? undefined,
          },
        });
      })
      .catch(() => {});
  }, [agent.id, agent.codexThreadId, projectPath, updateAgentGitInfo]);

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

  useEffect(() => {
    if (fileTreeOpen) {
      setFileTreeMounted(true);
      return;
    }
    const t = window.setTimeout(() => setFileTreeMounted(false), 200);
    return () => window.clearTimeout(t);
  }, [fileTreeOpen]);

  const toggleFileTree = useCallback(() => {
    setAgentFileTreeOpen(agent.id, !fileTreeOpen);
  }, [agent.id, fileTreeOpen, setAgentFileTreeOpen]);

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
        const info = await invoke<{ branch?: string | null; originUrl?: string | null }>(
          "get_git_info",
          { path: cwd },
        );
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
          <DiffButton files={agent.files} />
          <OpenInButton linkedLinearIssues={agent.linkedLinearIssues} />
          <GitButton
            pr={agent.pr}
            projectPath={projectPath}
            branch={agent.branch}
            onGitAction={() => {}}
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
          transition: "padding-left 200ms ease-out",
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

        {/* Chat column */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

      {/* Messages */}
      <div className="relative flex-1 min-h-0">
        <div ref={scrollRef} className="h-full min-w-0 overflow-y-auto overflow-x-hidden">
          <div
            className={cn(
              "max-w-[680px] mx-auto pt-16 pb-28 transition-[padding] duration-150",
              fileTreeOpen ? "px-4" : "px-6",
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
                  {agent.diff && agent.turnInProgress && (
                    <DiffActivityView diff={agent.diff} />
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
                  {agent.diff && agent.turnInProgress && (
                    <DiffActivityView diff={agent.diff} />
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
          fileTreeOpen ? "px-4" : "px-6",
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

      {editConfirm ? (
        <>
          <div
            className="fixed inset-0 z-[80] bg-black/20 dark:bg-black/40"
            onClick={() => setEditConfirm(null)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-prompt-dialog-title"
            className="fixed left-1/2 top-1/2 z-[90] w-[min(400px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[10px] border border-border-default bg-bg-card p-5 shadow-[0_12px_40px_rgba(0,0,0,0.06)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.25)]"
          >
            <h2
              id="edit-prompt-dialog-title"
              className="font-sans text-[14px] font-semibold text-text-primary tracking-[-0.02em] mb-2"
            >
              Update this message?
            </h2>
            <p className="font-sans text-[12.5px] text-text-secondary leading-relaxed mb-5">
              <span className="font-medium text-text-primary">Revert</span>{" "}
              removes everything after this prompt on the thread and sends your
              edited text again (matches the server via rollback when available).
            </p>
            <p className="font-sans text-[12.5px] text-text-secondary leading-relaxed mb-5">
              <span className="font-medium text-text-primary">Keep</span>{" "}
              only updates this bubble in the transcript and leaves later
              messages as they are.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2">
              <button
                type="button"
                onClick={() => setEditConfirm(null)}
                className="px-3 py-1.5 text-[11.5px] text-text-secondary border border-border-default rounded-md hover:bg-bg-secondary transition-colors duration-120 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyEditKeep}
                className="px-3 py-1.5 text-[11.5px] text-text-secondary border border-border-default rounded-md hover:bg-bg-secondary transition-colors duration-120 cursor-pointer"
              >
                Keep
              </button>
              <button
                type="button"
                autoFocus
                disabled={editSubmitting}
                onClick={() => void applyEditRevert()}
                className="px-3 py-1.5 text-[11.5px] font-medium bg-text-primary text-bg-card rounded-md hover:opacity-90 transition-opacity duration-120 cursor-pointer disabled:opacity-50"
              >
                {editSubmitting ? "Reverting…" : "Revert"}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
