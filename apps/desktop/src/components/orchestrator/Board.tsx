import { useEffect } from "react";
import { DetailPanel } from "./DetailPanel";
import { AgentCard } from "./AgentCard";
import { CommandBar } from "../command/CommandBar";
import { useThreadStore } from "@/lib/stores/thread-store";
import { useAppStore } from "@/lib/stores/app-store";
import { useViewStore } from "@/lib/stores/view-store";
import { MOCK_AGENTS } from "@/lib/mock-data";
import { STATUS_CONFIG } from "@/lib/status";
import { cn } from "@/lib/utils";

const ALL_COLUMNS = ["queued", "active", "review", "deployed"] as const;

export function Orchestrator() {
  const agents = useThreadStore((s) => s.agents);
  const selectedId = useThreadStore((s) => s.selectedAgentId);
  const selectAgent = useThreadStore((s) => s.selectAgent);
  const setAgents = useThreadStore((s) => s.setAgents);
  const addAgent = useThreadStore((s) => s.addAgent);
  const setCommandBarOpen = useAppStore((s) => s.setCommandBarOpen);
  const projectName = useAppStore((s) => s.projectName);
  const setView = useViewStore((s) => s.setView);

  useEffect(() => {
    if (agents.length === 0) {
      setAgents(MOCK_AGENTS);
    }
  }, [agents.length, setAgents]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandBarOpen(true);
      }
      if (e.key === "Escape") {
        selectAgent(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectAgent, setCommandBarOpen]);

  const selected = agents.find((a) => a.id === selectedId) ?? null;

  const handleNewChat = () => {
    const id = `agent-${Date.now()}`;
    addAgent({
      id,
      title: "New thread",
      branch: "feat/new-thread",
      status: "active",
      lastAction: "Waiting for your first message",
      progress: 0,
      time: "—",
      tokens: "—",
      files: [],
      pr: null,
      messages: [],
      blocked: false,
    });
    setView("chat");
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-bg-primary text-text-primary">

      {/* Top bar — left/top padding for macOS traffic lights (Overlay); full bar is draggable */}
      <div
        data-tauri-drag-region
        className="h-11 flex items-center justify-between pl-[92px] pr-5 pt-1.5 shrink-0 select-none border-b border-border-light"
      >
        {/* Left: settings + new chat + project name (inline with traffic lights) */}
        <div className="flex items-center gap-1">
          {/* Settings */}
          <button
            onClick={() => setView("settings")}
            className="p-1.5 rounded cursor-pointer text-text-primary dark:text-text-primary hover:opacity-80 hover:bg-bg-secondary transition-all duration-120"
            title="Settings"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
          {/* New chat */}
          <button
            onClick={handleNewChat}
            className="p-1.5 rounded cursor-pointer text-text-primary dark:text-text-faint hover:opacity-80 dark:hover:text-text-secondary hover:bg-bg-secondary transition-all duration-120"
            title="New chat (adds to Active)"
          >
            <img src="/newchat_icon.svg" alt="" className="h-3 w-3 shrink-0 dark:invert" />
          </button>
          {/* Project name — sans, to the right of new chat */}
          {projectName && (
            <span className="font-sans text-[13px] font-medium text-text-primary tracking-[-0.01em] ml-2 truncate max-w-[200px]">
              {projectName}
            </span>
          )}
        </div>
      </div>

      {/* Board + detail panel (panel overlays from right, columns keep fixed width; scroll horizontally if needed) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Kanban columns — add extra scroll width while keeping content under the overlay */}
        <div className="flex-1 min-w-0 overflow-x-auto overflow-y-auto">
          <div
            className={cn(
              "flex px-6 py-5 gap-0 min-w-max",
              selected && "pr-[360px]",
            )}
          >
            {ALL_COLUMNS.map((col, i) => {
              const colAgents = agents.filter((a) => a.status === col);
              const config = STATUS_CONFIG[col];
              const isLast = i === ALL_COLUMNS.length - 1;
              return (
                <div
                  key={col}
                  className={cn(
                    "flex flex-col flex-1 min-w-[180px]",
                    !isLast && "pr-5 mr-5 border-r border-border-light",
                  )}
                >
                  {/* Column header */}
                  <div className="flex items-center gap-2 mb-3 shrink-0">
                    <span
                      className="inline-block w-[5px] h-[5px] rounded-full"
                      style={{ background: config.color }}
                    />
                    <span className="font-mono text-[10px] uppercase tracking-label text-text-secondary">
                      {config.label}
                    </span>
                    <span className="font-mono text-[10px] text-text-faint">
                      {colAgents.length}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="flex flex-col gap-2">
                    {colAgents.map((agent) => (
                      <AgentCard
                        key={agent.id}
                        agent={agent}
                        selected={selectedId === agent.id}
                        onOpenThread={(id) => {
                          selectAgent(id);
                          setView("chat");
                        }}
                        onOpenDetails={selectAgent}
                        compact={false}
                      />
                    ))}
                    {colAgents.length === 0 && (
                      <div className="border border-dashed border-border-light rounded-lg p-5 text-center">
                        <span className="font-mono text-[10px] text-text-faint">
                          empty
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detail panel — overlays from right, glass; covers columns when narrow */}
        {selected && (
          <div className="absolute right-0 top-0 bottom-0 z-10">
            <DetailPanel
              agent={selected}
              onClose={() => selectAgent(null)}
              onOpenChat={() => setView("chat")}
            />
          </div>
        )}
      </div>

      <CommandBar />
    </div>
  );
}
