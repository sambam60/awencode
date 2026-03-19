import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DetailPanel } from "./DetailPanel";
import { AgentCard } from "./AgentCard";
import { CommandBar } from "../command/CommandBar";
import { useThreadStore } from "@/lib/stores/thread-store";
import { useAppStore } from "@/lib/stores/app-store";
import { useViewStore } from "@/lib/stores/view-store";
import { STATUS_CONFIG } from "@/lib/status";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";

const ALL_COLUMNS = ["queued", "active", "review", "deployed"] as const;
type BoardColumn = (typeof ALL_COLUMNS)[number];

export function Orchestrator() {
  const agents = useThreadStore((s) => s.agents);
  const selectedId = useThreadStore((s) => s.selectedAgentId);
  const selectAgent = useThreadStore((s) => s.selectAgent);
  const addAgent = useThreadStore((s) => s.addAgent);
  const setCommandBarOpen = useAppStore((s) => s.setCommandBarOpen);
  const projectName = useAppStore((s) => s.projectName);
  const view = useViewStore((s) => s.view);
  const setView = useViewStore((s) => s.setView);

  const [collapsedCols, setCollapsedCols] = useState<Partial<Record<BoardColumn, boolean>>>(
    {},
  );

  const toggleCol = (c: BoardColumn) => {
    setCollapsedCols((prev) => ({ ...prev, [c]: !prev[c] }));
  };

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

  const handleNewChat = async () => {
    const id = `agent-${Date.now()}`;
    // Resolve real git branch before creating the agent
    let branch = "";
    let originUrl: string | undefined;
    const projectPath = useAppStore.getState().projectPath;
    if (projectPath) {
      try {
        const info = await invoke<{ branch?: string | null; originUrl?: string | null }>("get_git_info", {
          path: projectPath,
        });
        branch = info?.branch ?? "";
        originUrl = info?.originUrl ?? undefined;
      } catch {
        // ignore — branch stays empty
      }
    }
    addAgent({
      id,
      title: "New thread",
      branch,
      status: "active",
      lastAction: "Waiting for your first message",
      progress: 0,
      time: "—",
      tokens: "—",
      files: [],
      pr: null,
      messages: [],
      blocked: false,
      originUrl,
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
          {/* Home */}
          <button
            onClick={() => setView("home")}
            className="p-1.5 rounded cursor-pointer text-text-primary dark:text-text-primary hover:opacity-80 hover:bg-bg-secondary transition-all duration-120"
            title="Home"
          >
            <img
              src={view === "home" ? "/house_icon_filled.svg" : "/house_icon.svg"}
              alt=""
              className="h-3 w-3 shrink-0 opacity-85 dark:invert"
            />
          </button>
          {/* Settings */}
          <button
            onClick={() => setView("settings")}
            className="p-1.5 rounded cursor-pointer text-text-primary dark:text-text-primary hover:opacity-80 hover:bg-bg-secondary transition-all duration-120"
            title="Settings"
          >
            <img
              src={view === "settings" ? "/gear_filled.svg" : "/gear.svg"}
              alt=""
              className="h-3 w-3 shrink-0 opacity-85 dark:invert"
            />
          </button>
          {/* New chat */}
          <button
            onClick={handleNewChat}
            className="p-1.5 rounded cursor-pointer text-text-primary dark:text-text-faint hover:opacity-80 dark:hover:text-text-secondary hover:bg-bg-secondary transition-all duration-120"
            title="New chat (adds to Active)"
          >
            <img src="/newchat_icon.svg" alt="" className="h-2.5 w-2.5 shrink-0 dark:invert" />
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
              const collapsed = Boolean(collapsedCols[col]);
              return (
                <div
                  key={col}
                  className={cn(
                    "group/col flex flex-col shrink-0 transition-[width,min-width,max-width,padding,margin] duration-200 ease-out",
                    collapsed
                      ? cn(
                          "w-[44px] min-w-[44px] max-w-[44px]",
                          !isLast && "pr-2 mr-2 border-r border-border-light",
                        )
                      : cn(
                          "flex-1 min-w-[180px]",
                          !isLast && "pr-5 mr-5 border-r border-border-light",
                        ),
                  )}
                >
                  {collapsed ? (
                    <button
                      type="button"
                      onClick={() => toggleCol(col)}
                      className="flex flex-col items-center gap-2 py-3 px-0 w-full rounded-lg hover:bg-bg-secondary/60 transition-colors duration-120 cursor-pointer border-0 bg-transparent text-inherit"
                      title={`Expand ${config.label}`}
                    >
                      <span
                        className="inline-block w-[5px] h-[5px] rounded-full shrink-0"
                        style={{ background: config.color }}
                      />
                      <span
                        className="font-mono text-[9px] uppercase tracking-label text-text-secondary max-h-[100px] truncate"
                        style={{
                          writingMode: "vertical-rl",
                          textOrientation: "mixed",
                        }}
                      >
                        {config.label}
                      </span>
                      <span className="font-mono text-[10px] text-text-faint">
                        {colAgents.length}
                      </span>
                      <ChevronRight size={14} className="text-text-faint shrink-0" strokeWidth={1.5} />
                    </button>
                  ) : (
                    <>
                      {/* Column header */}
                      <div className="relative flex items-center gap-2 mb-3 shrink-0 min-h-[22px] pl-5">
                        <button
                          type="button"
                          aria-label={`Collapse ${config.label}`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleCol(col);
                          }}
                          className={cn(
                            "absolute left-0 top-1/2 -translate-y-1/2 z-[1] p-0.5 rounded text-text-faint hover:text-text-secondary hover:bg-bg-secondary transition-all duration-120",
                            "opacity-0 group-hover/col:opacity-100 focus-visible:opacity-100",
                            "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-blue)] focus-visible:outline-offset-2",
                          )}
                        >
                          <ChevronLeft size={14} strokeWidth={1.5} />
                        </button>
                        <span
                          className="inline-block w-[5px] h-[5px] rounded-full shrink-0"
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
                    </>
                  )}
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
