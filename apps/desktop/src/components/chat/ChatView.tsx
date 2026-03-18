import { useRef, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronDown,
  Code2,
  GitBranch,
  GitPullRequest,
  Plus,
  Box,
  Terminal,
  FolderOpen,
  Diff,
  ArrowUpDown,
  MessageSquare,
} from "lucide-react";
import { ComposeArea } from "./ComposeArea";
import { statusColor } from "@/lib/status";
import { cn } from "@/lib/utils";
import { useThreadStore } from "@/lib/stores/thread-store";
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
        <div className="max-w-[80%] px-4 py-3 bg-text-primary text-bg-card rounded-xl rounded-br-sm text-[13px] leading-relaxed">
          {message.content}
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

// Git / PR button
function GitButton({ pr }: { pr: string | null }) {
  const [open, setOpen] = useState(false);
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
        {pr ? (
          <span>{pr}</span>
        ) : (
          <span>git</span>
        )}
        <ChevronDown size={9} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-52 bg-bg-card border border-border-default rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.06)] z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-border-light">
            <span className="font-mono text-[9.5px] text-text-faint uppercase tracking-widest">Pull Request</span>
          </div>
          {pr ? (
            <button className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-bg-secondary transition-colors duration-120 cursor-pointer text-left">
              <GitPullRequest size={12} className="text-[#3a9d63] shrink-0" />
              <span className="text-[12px] text-text-primary">{pr}</span>
            </button>
          ) : (
            <button className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-bg-secondary transition-colors duration-120 cursor-pointer text-left">
              <Plus size={12} className="text-text-faint shrink-0" />
              <span className="text-[12px] text-text-secondary">create pull request</span>
            </button>
          )}
        </div>
      )}
      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
      )}
    </div>
  );
}

// Open In button
function OpenInButton() {
  const [open, setOpen] = useState(false);

  const options = [
    { label: "Cursor", icon: <Box size={12} /> },
    { label: "VS Code", icon: <Code2 size={12} /> },
    { label: "Terminal", icon: <Terminal size={12} /> },
    { label: "Finder", icon: <FolderOpen size={12} /> },
  ];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border-default text-text-secondary bg-bg-secondary hover:bg-bg-card text-[11px] font-mono transition-colors duration-120 cursor-pointer"
      >
        <Box size={12} />
        <span>open in</span>
        <ChevronDown size={9} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-44 bg-bg-card border border-border-default rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.06)] z-50 overflow-hidden py-1">
          <div className="px-3 pt-1.5 pb-1 border-b border-border-light mb-1">
            <span className="font-mono text-[9.5px] text-text-faint uppercase tracking-widest">Open In</span>
          </div>
          {options.map((opt) => (
            <button
              key={opt.label}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-bg-secondary transition-colors duration-120 cursor-pointer text-left"
            >
              <span className="text-text-faint shrink-0">{opt.icon}</span>
              <span className="text-[12px] text-text-primary">{opt.label}</span>
            </button>
          ))}
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
        <span>diff</span>
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
  const setAgents = useThreadStore((s) => s.setAgents);
  const agents = useThreadStore((s) => s.agents);

  const handleQueue = () => {
    const updated = agents.map((a) =>
      a.id === agent.id ? { ...a, status: "queued" as const } : a,
    );
    setAgents(updated);
    onBack();
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [agent.messages.length]);

  const handleSend = (_message: string) => {
    // Will be wired to rpc in a future phase
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
          <span className="font-mono text-[10px]">board</span>
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
          <GitButton pr={agent.pr} />
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
          {agent.messages.length === 0 ? (
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
            agent.messages.map((msg, i) => (
              <MessageRow key={i} message={msg} />
            ))
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
            {agent.status === "active" && !agent.blocked && (
              <>
                <button className="py-2 px-4 bg-transparent border border-border-default text-text-secondary text-[11.5px] font-medium rounded-md cursor-pointer hover:bg-bg-card transition-colors duration-120">
                  pause
                </button>
                <button
                  onClick={handleQueue}
                  className="py-2 px-4 bg-transparent border border-border-default text-text-secondary text-[11.5px] font-medium rounded-md cursor-pointer hover:bg-bg-card transition-colors duration-120"
                >
                  move to queue
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Compose */}
      <div className="max-w-[680px] mx-auto w-full px-6 pb-4 shrink-0">
        {canCompose ? (
          <ComposeArea onSend={handleSend} />
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
