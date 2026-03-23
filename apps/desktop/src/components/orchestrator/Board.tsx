import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { DetailPanel } from "./DetailPanel";
import { AgentCard } from "./AgentCard";
import { CommandBar } from "../command/CommandBar";
import { useThreadStore } from "@/lib/stores/thread-store";
import { tabNameFromPath, useAppStore } from "@/lib/stores/app-store";
import { addRecentProject, getRecentProjects } from "@/lib/recent-projects";
import { useViewStore } from "@/lib/stores/view-store";
import { BOARD_COLUMN_IDS, useBoardUiStore } from "@/lib/stores/board-ui-store";
import { STATUS_CONFIG } from "@/lib/status";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";

export function Orchestrator() {
  const agents = useThreadStore((s) => s.agents);
  const selectedId = useThreadStore((s) => s.selectedAgentId);
  const selectAgent = useThreadStore((s) => s.selectAgent);
  const addAgent = useThreadStore((s) => s.addAgent);
  const setCommandBarOpen = useAppStore((s) => s.setCommandBarOpen);
  const clearWorkspace = useAppStore((s) => s.clearWorkspace);
  const projectTabs = useAppStore((s) => s.projectTabs);
  const projectPath = useAppStore((s) => s.projectPath);
  const switchProjectTab = useAppStore((s) => s.switchProjectTab);
  const addOrFocusProjectTab = useAppStore((s) => s.addOrFocusProjectTab);
  const closeProjectTab = useAppStore((s) => s.closeProjectTab);
  const view = useViewStore((s) => s.view);
  const setView = useViewStore((s) => s.setView);
  const collapsedCols = useBoardUiStore((s) => s.collapsedCols);
  const toggleCol = useBoardUiStore((s) => s.toggleColumn);

  const [recentOpen, setRecentOpen] = useState(false);
  const recentWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!recentOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!recentWrapRef.current?.contains(e.target as Node)) {
        setRecentOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [recentOpen]);

  const dragStyle = { WebkitAppRegion: "drag" } as React.CSSProperties;
  const noDragStyle = { WebkitAppRegion: "no-drag" } as React.CSSProperties;

  const revealInFinder = (path: string) => {
    invoke("open_in_app", { appId: "finder", path }).catch(() => {});
  };

  const pickProjectFromDisk = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false });
      if (!selected || typeof selected !== "string") return;
      const path = selected;
      const name = tabNameFromPath(path);
      addRecentProject(path, name);
      addOrFocusProjectTab(path, name);
    } catch {
      /* ignore */
    }
  };

  const openFromRecents = (path: string, name: string) => {
    addRecentProject(path, name);
    addOrFocusProjectTab(path, name);
    setRecentOpen(false);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandBarOpen(true);
      }
      if (e.key === "Escape") {
        selectAgent(null);
        setRecentOpen(false);
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
    const cwd = useAppStore.getState().projectPath;
    if (cwd) {
      try {
        const info = await invoke<{ branch?: string | null; originUrl?: string | null }>("get_git_info", {
          path: cwd,
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
    });
    setView("chat");
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-bg-primary text-text-primary">

      {/* Top bar — left/top padding for macOS traffic lights (Overlay); full bar is draggable */}
      <div
        data-tauri-drag-region
        className="group/header h-11 flex items-center pl-[92px] pr-5 pt-1.5 pb-0.5 shrink-0 select-none border-b border-border-light min-w-0"
        style={dragStyle}
      >
        {/* no-drag only on actual controls (content-sized); gap to the right stays draggable */}
        <div
          className="flex h-7 shrink-0 items-center gap-1.5"
          style={noDragStyle}
        >
          {/* Home */}
          <button
            onClick={() => {
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
          {/* Settings */}
          <button
            onClick={() => setView("settings")}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded cursor-pointer text-text-primary dark:text-text-primary hover:opacity-80 hover:bg-bg-secondary transition-all duration-120"
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
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded cursor-pointer text-text-primary dark:text-text-faint hover:opacity-80 dark:hover:text-text-secondary hover:bg-bg-secondary transition-all duration-120"
            title="New chat (adds to Drafts until you send)"
          >
            <img src="/newchat_icon.svg" alt="" className="h-2.5 w-2.5 shrink-0 dark:invert" />
          </button>
        </div>

        {projectTabs.length > 0 && (
          <div
            className="ml-1.5 flex h-7 min-w-0 max-w-[calc(100%-7rem)] shrink items-center gap-0"
            style={noDragStyle}
          >
            <div className="flex h-7 min-w-0 items-center gap-0 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {projectTabs.map((tab) => {
                const active = tab.path === projectPath;
                return (
                  <div
                    key={tab.path}
                    className="group/tab flex h-7 max-w-[188px] shrink-0 items-center rounded-md"
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        closeProjectTab(tab.path);
                        if (!useAppStore.getState().projectPath) {
                          setView("home");
                        }
                      }}
                      className={cn(
                        "inline-flex h-7 w-6 shrink-0 items-center justify-center rounded text-text-faint hover:text-text-secondary hover:bg-bg-secondary/90 transition-all duration-120 cursor-pointer outline-none",
                        "opacity-0 pointer-events-none group-hover/tab:opacity-100 group-hover/tab:pointer-events-auto",
                        "focus-visible:opacity-100 focus-visible:pointer-events-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-blue)] focus-visible:outline-offset-2",
                      )}
                      title={`Close ${tab.name}`}
                      aria-label={`Close ${tab.name}`}
                    >
                      <X size={12} strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        active ? revealInFinder(tab.path) : switchProjectTab(tab.path)
                      }
                      title={
                        active
                          ? "Show in Finder"
                          : `Switch to ${tab.name}`
                      }
                      className={cn(
                        "inline-flex h-7 min-w-0 max-w-[152px] items-center truncate rounded-md pl-1 pr-1.5 font-sans text-[13px] font-medium leading-none tracking-[-0.01em] transition-colors duration-120 cursor-pointer",
                        active
                          ? "text-text-primary bg-bg-secondary/70"
                          : "text-text-secondary hover:text-text-primary hover:bg-bg-secondary/80",
                      )}
                    >
                      {tab.name}
                    </button>
                  </div>
                );
              })}
            </div>

            <div
              className={cn(
                "flex h-7 shrink-0 items-center gap-0 -ml-px transition-opacity duration-120",
                "opacity-0 pointer-events-none group-hover/header:opacity-100 group-hover/header:pointer-events-auto",
              )}
            >
              <button
                type="button"
                onClick={() => void pickProjectFromDisk()}
                className="inline-flex h-7 w-6 items-center justify-center rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-secondary transition-colors duration-120 cursor-pointer outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-blue)] focus-visible:outline-offset-2"
                title="Add project from disk"
              >
                <Plus size={12} strokeWidth={2} />
              </button>
              <div className="relative flex h-7 items-center" ref={recentWrapRef}>
                <button
                  type="button"
                  onClick={() => setRecentOpen((o) => !o)}
                  className={cn(
                    "inline-flex h-7 w-6 items-center justify-center rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-secondary transition-colors duration-120 cursor-pointer outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-blue)] focus-visible:outline-offset-2",
                    recentOpen && "bg-bg-secondary text-text-primary",
                  )}
                  title="Recent projects"
                  aria-expanded={recentOpen}
                  aria-haspopup="listbox"
                >
                  <ChevronDown size={12} strokeWidth={2} />
                </button>
                {recentOpen && (
                  <div
                    className="absolute left-0 top-full z-50 mt-1 min-w-[260px] max-h-64 overflow-y-auto rounded-lg border border-border-default bg-bg-card py-1 shadow-[0_4px_16px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.2)]"
                    role="listbox"
                  >
                    {getRecentProjects().length === 0 ? (
                      <div className="px-3 py-2 font-sans text-[12px] text-text-tertiary">
                        No recent projects
                      </div>
                    ) : (
                      getRecentProjects().map((p) => (
                        <button
                          key={p.path}
                          type="button"
                          role="option"
                          onClick={() => openFromRecents(p.path, p.name)}
                          className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left font-sans text-[13px] font-medium text-text-primary hover:bg-bg-secondary transition-colors duration-120 cursor-pointer"
                        >
                          <span className="truncate w-full">{p.name}</span>
                          <span className="w-full truncate text-[11px] font-normal text-text-tertiary">
                            {p.path}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        <div
          data-tauri-drag-region
          className="flex-1 min-w-[3rem] self-stretch"
          style={dragStyle}
          aria-hidden
        />
      </div>

      {/* Board + detail panel (panel overlays from right, columns keep fixed width; scroll horizontally if needed) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Kanban columns — add extra scroll width while keeping content under the overlay */}
        <div className="flex-1 min-w-0 overflow-x-auto overflow-y-auto">
          <div
            className={cn(
              "flex min-w-full gap-0 px-[clamp(12px,2vw,24px)] py-[clamp(12px,2vw,20px)]",
              selected && "pr-[360px]",
            )}
          >
            {BOARD_COLUMN_IDS.map((col, i) => {
              const colAgents = agents.filter((a) => a.status === col);
              const orderedColAgents =
                col === "active"
                  ? [...colAgents].sort((a, b) => Number(b.blocked) - Number(a.blocked))
                  : colAgents;
              const config = STATUS_CONFIG[col];
              const StatusIcon = config.icon;
              const isLast = i === BOARD_COLUMN_IDS.length - 1;
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
                          "min-w-[clamp(96px,14vw,180px)] basis-0 flex-1",
                          !isLast &&
                            "pr-[clamp(8px,1.6vw,20px)] mr-[clamp(8px,1.6vw,20px)] border-r border-border-light",
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
                      <StatusIcon
                        size={12}
                        strokeWidth={1.8}
                        className={cn("shrink-0", config.spin && "animate-spin")}
                        style={{ color: config.color }}
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
                        <StatusIcon
                          size={12}
                          strokeWidth={1.8}
                          className={cn("shrink-0", config.spin && "animate-spin")}
                          style={{ color: config.color }}
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
                        {orderedColAgents.map((agent) => (
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
