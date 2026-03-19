import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "@/lib/stores/app-store";
import { useViewStore } from "@/lib/stores/view-store";
import {
  getRecentProjects,
  addRecentProject,
  type RecentProject as RecentProjectType,
} from "@/lib/recent-projects";

interface HomeScreenProps {
  onOpenProject: () => void;
}

export function HomeScreen({ onOpenProject }: HomeScreenProps) {
  const openWorkspaceSolo = useAppStore((s) => s.openWorkspaceSolo);
  const view = useViewStore((s) => s.view);
  const setView = useViewStore((s) => s.setView);
  const [recentProjects, setRecentProjects] = useState<RecentProjectType[]>([]);
  const [cloneUrl, setCloneUrl] = useState("");
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);

  useEffect(() => {
    setRecentProjects(getRecentProjects());
  }, []);

  const handleOpenProject = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false });
      if (selected) {
        const path = typeof selected === "string" ? selected : null;
        if (!path) return;
        const name = path.split("/").filter(Boolean).pop() ?? "Project";
        openWorkspaceSolo(path, name);
        addRecentProject(path, name);
        setRecentProjects(getRecentProjects());
        onOpenProject();
      }
    } catch {
      onOpenProject();
    }
  };

  const handleCloneRepo = async () => {
    const url = cloneUrl.trim();
    if (!url) return;
    setCloneError(null);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const parentDir = await open({ directory: true, multiple: false });
      if (!parentDir || typeof parentDir !== "string") {
        setCloneOpen(false);
        return;
      }
      const clonedPath = await invoke<string>("git_clone", { url, parentDir: parentDir });
      const name = clonedPath.split("/").filter(Boolean).pop() ?? "Project";
      openWorkspaceSolo(clonedPath, name);
      addRecentProject(clonedPath, name);
      setRecentProjects(getRecentProjects());
      setCloneUrl("");
      setCloneOpen(false);
      onOpenProject();
    } catch (e) {
      setCloneError(e instanceof Error ? e.message : String(e));
    }
  };

  const openRecent = (project: RecentProjectType) => {
    openWorkspaceSolo(project.path, project.name);
    addRecentProject(project.path, project.name);
    setRecentProjects(getRecentProjects());
    onOpenProject();
  };

  return (
    <div className="h-screen flex flex-col bg-bg-primary text-text-primary select-none">
      {/* Top bar — reserve space for macOS traffic lights */}
      <div
        data-tauri-drag-region
        className="h-11 flex items-center justify-between pl-[92px] pr-5 pt-1.5 pb-0.5 shrink-0 select-none border-b border-border-light"
      >
        <div className="flex h-7 items-center gap-1.5">
          <button
            onClick={() => setView("home")}
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
        </div>
      </div>

      {/* Main content — centered */}
      <div className="flex-1 flex items-center justify-center">
        <div className="w-[340px]">
          {/* Logo */}
          <div className="flex items-center justify-center mb-8">
            <img src="/awencode_logo.svg" alt="awencode" className="h-16 dark:invert" />
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2 mb-6">
            <button
              onClick={handleOpenProject}
              className="px-4 py-3 bg-bg-card border border-border rounded-lg text-left cursor-pointer hover:shadow-level-1 hover:bg-bg-secondary/40 hover:border-border-focus transition-all duration-120 group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-blue"
            >
              <div className="mb-2 text-text-tertiary group-hover:text-text-secondary transition-colors duration-120">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>
                  <path d="M12 11v6"/>
                  <path d="M9 14h6"/>
                </svg>
              </div>
              <div className="text-[13px] font-medium text-text-primary">
                Open project
              </div>
            </button>
            <button
              onClick={() => setCloneOpen(true)}
              className="px-4 py-3 bg-bg-card border border-border rounded-lg text-left cursor-pointer hover:shadow-level-1 hover:bg-bg-secondary/40 hover:border-border-focus transition-all duration-120 group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-blue"
            >
              <div className="mb-2 text-text-tertiary group-hover:text-text-secondary transition-colors duration-120">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="18" r="3"/>
                  <circle cx="6" cy="6" r="3"/>
                  <circle cx="6" cy="18" r="3"/>
                  <path d="M8.6 7.6 15.4 16.4"/>
                  <path d="M6 9v6"/>
                </svg>
              </div>
              <div className="text-[13px] font-medium text-text-primary">
                Clone repo
              </div>
            </button>
          </div>

          {cloneOpen && (
            <>
              <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setCloneOpen(false)} />
              <div className="fixed left-1/2 top-1/2 z-50 w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border-default bg-bg-card p-4 shadow-[0_12px_40px_rgba(0,0,0,0.06)]">
                <div className="font-mono text-[10px] text-text-faint uppercase tracking-widest mb-2">
                  Clone repository
                </div>
                <input
                  type="url"
                  placeholder="https://github.com/user/repo"
                  value={cloneUrl}
                  onChange={(e) => setCloneUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-border-default bg-bg-input text-[13px] text-text-primary placeholder:text-text-faint mb-3"
                />
                {cloneError && (
                  <p className="text-[11px] text-accent-red mb-2">{cloneError}</p>
                )}
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setCloneOpen(false)}
                    className="px-3 py-1.5 text-[11.5px] text-text-secondary border border-border-default rounded-md hover:bg-bg-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCloneRepo}
                    disabled={!cloneUrl.trim()}
                    className="px-3 py-1.5 text-[11.5px] font-medium bg-text-primary text-bg-card rounded-md hover:opacity-90 disabled:opacity-50"
                  >
                    Clone
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Recent projects */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <span className="font-mono text-[10px] text-text-faint uppercase tracking-label">
                Recent projects
              </span>
            </div>

            <div className="flex flex-col gap-px">
              {recentProjects.length === 0 ? (
                <span className="font-mono text-[10.5px] text-text-faint py-1.5">
                  No recent projects
                </span>
              ) : (
                recentProjects.map((project) => (
                  <button
                    key={`${project.path}-${project.lastOpened}`}
                    onClick={() => openRecent(project)}
                    className="flex items-center justify-between w-full px-2 py-2 text-left cursor-pointer group transition-all duration-120 rounded-md hover:bg-bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-blue"
                  >
                    <span className="text-[13px] font-medium text-text-primary">
                      {project.name}
                    </span>
                    <span className="font-mono text-[10.5px] text-text-faint truncate max-w-[180px]">
                      {project.path}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
