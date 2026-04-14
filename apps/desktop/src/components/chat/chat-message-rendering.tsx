/**
 * Shared chat message rendering components used by both ChatView (full screen)
 * and DetailPanel (side panel). Includes markdown rendering, tool call blocks,
 * activity feed, streaming indicators, etc.
 */
import React, {
  Fragment,
  useRef,
  useState,
  useCallback,
  memo,
  useEffect,
} from "react";
import {
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Check,
  ExternalLink,
  FileCode,
  Loader2,
  Terminal,
  Undo2,
} from "lucide-react";
import { CodeBlock } from "./CodeBlock";
import { ShimmerText } from "./ShimmerText";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "@/lib/stores/app-store";
import {
  STREAMING_THINKING_ACTIVITY_ID,
  type AgentActivity,
  type AgentMessage,
} from "@/lib/stores/thread-store";

function resolveWorkspacePath(path: string): string {
  if (!path || path.startsWith("/")) return path;
  const projectPath = useAppStore.getState().projectPath?.trim() ?? "";
  if (!projectPath) return path;
  const normalizedProjectPath = projectPath.replace(/\/+$/, "");
  const normalizedPath = path.replace(/^\.\//, "");
  return `${normalizedProjectPath}/${normalizedPath}`;
}

async function revealInFinder(path: string): Promise<void> {
  const resolvedPath = resolveWorkspacePath(path);
  await invoke("open_in_app", { appId: "finder", path: resolvedPath });
}

// ─── File chip ────────────────────────────────────────────────────────────────

export function FileChip({ path }: { path: string }) {
  const fileName = path.split("/").pop() ?? path;
  const ext = fileName.includes(".") ? fileName.split(".").pop() : "";

  const handleOpen = async () => {
    try {
      await revealInFinder(path);
    } catch {
      // ignore
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

export function ToolCallBlock({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);

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

function safeMarkdownHref(href: string): string | null {
  const t = href.trim();
  if (/^https?:\/\//i.test(t)) return t;
  if (/^mailto:/i.test(t)) return t;
  return null;
}

function safeMarkdownFilePath(href: string): string | null {
  const t = href.trim();
  if (t.length === 0 || t === "." || t === "..") return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return null;
  if (!/^[\w./-]+$/u.test(t)) return null;
  return t;
}

const markdownAnchorClass =
  "text-text-links underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-blue focus-visible:outline-offset-1 rounded-sm";

function trimUrlPunct(url: string): string {
  return url.replace(/[.,;:!?)]+$/gu, "");
}

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

export function parseInline(text: string, keyPrefix: string): React.ReactNode[] {
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
              revealInFinder(filePath).catch(() => {});
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
          await revealInFinder(refPath);
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

// ─── Parsed content nodes ────────────────────────────────────────────────────

export type ParsedNode = { key: string; node: React.ReactNode };

export function parseContent(content: string): ParsedNode[] {
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

// ─── StreamBlock ──────────────────────────────────────────────────────────────

export const StreamBlock = memo(({ children }: { children: React.ReactNode }) => (
  <div className="animate-block-in">
    {children}
  </div>
));

// ─── AgentMarkdown ────────────────────────────────────────────────────────────

export function AgentMarkdown({ content, streaming = false }: { content: string; streaming?: boolean }) {
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

export function MessageRow({
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

export function StreamingMessage({ buffer }: { buffer: string }) {
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

function activityDurationSeconds(activity: AgentActivity): number | undefined {
  if (activity.status === "running" || activity.durationMs == null) {
    return undefined;
  }
  return Math.max(1, Math.ceil(activity.durationMs / DURATION_MS));
}

function ThinkingCard({ activity }: { activity: AgentActivity }) {
  const isStreaming = activity.status === "running";
  const detail = activity.detail?.trim() ?? "";
  const durationSec = activityDurationSeconds(activity);
  const hasContent = isStreaming || detail.length > 0;

  if (!hasContent) {
    const label =
      durationSec !== undefined
        ? `Thought for ${durationSec}s`
        : "Thought for a few seconds";
    return (
      <div className="mb-2">
        <span className="inline-flex items-center py-0.5 font-sans text-xs text-text-tertiary select-none">
          {label}
        </span>
      </div>
    );
  }

  return (
    <div className="mb-2">
      <Reasoning
        key={activity.id}
        isStreaming={isStreaming}
        duration={durationSec}
        defaultOpen
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

export function ActivityFeed({ activities }: { activities: AgentActivity[] }) {
  const thinkingActs = activities.filter(isThinkingActivity);
  const toolActs = activities.filter((a) => !isThinkingActivity(a));
  if (thinkingActs.length === 0 && toolActs.length === 0) return null;

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

export function ThinkingIndicator() {
  return (
    <div className="mb-4 flex items-center gap-2">
      <Loader2 size={11} className="text-text-faint animate-spin shrink-0" />
      <ShimmerText className="text-[12px] font-sans">
        Thinking...
      </ShimmerText>
    </div>
  );
}

// ─── Re-export constant for consumers ────────────────────────────────────────

export { STREAMING_THINKING_ACTIVITY_ID };
