import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CornerDownLeft, X } from "lucide-react";
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
  const cloneInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecentProjects(getRecentProjects());
  }, []);

  useEffect(() => {
    if (!cloneOpen) return;
    const id = requestAnimationFrame(() => cloneInputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [cloneOpen]);

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

          <AnimatePresence initial={false}>
            {cloneOpen && (
              <motion.div
                key="clone-inline"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
                className="w-full overflow-hidden mb-5"
              >
                <div className="flex flex-col gap-1.5 pb-0.5">
                  <div className="flex items-center gap-1 border-b border-border-light pb-2">
                    <button
                      type="button"
                      title="Close"
                      aria-label="Close"
                      onClick={() => {
                        setCloneOpen(false);
                        setCloneError(null);
                      }}
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-text-secondary hover:text-text-primary transition-colors duration-120 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-blue"
                    >
                      <X size={12} strokeWidth={1.6} />
                    </button>
                    <input
                      ref={cloneInputRef}
                      id="home-clone-url"
                      type="url"
                      aria-label="Repository URL"
                      placeholder="https://github.com/owner/repo"
                      value={cloneUrl}
                      onChange={(e) => setCloneUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && cloneUrl.trim()) {
                          e.preventDefault();
                          void handleCloneRepo();
                        }
                      }}
                      className="min-w-0 flex-1 appearance-none border-0 bg-transparent py-1 pr-1 text-[13px] text-text-primary placeholder:text-text-faint caret-text-tertiary shadow-none [color-scheme:inherit] focus:outline-none focus:ring-0 focus-visible:outline-none selection:bg-border-light selection:text-text-primary"
                    />
                    <button
                      type="button"
                      title="Clone repository"
                      aria-label="Clone repository"
                      disabled={!cloneUrl.trim()}
                      onClick={() => void handleCloneRepo()}
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-text-tertiary hover:text-text-secondary disabled:text-text-faint disabled:pointer-events-none transition-colors duration-120 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-blue"
                    >
                      <CornerDownLeft size={12} strokeWidth={1.6} />
                    </button>
                  </div>
                  {cloneError && (
                    <p className="text-[10.5px] text-accent-red leading-snug px-0.5">
                      {cloneError}
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2 mb-6">
            <button
              type="button"
              onClick={handleOpenProject}
              className="px-4 py-3 bg-bg-card border border-border rounded-lg text-left cursor-pointer hover:shadow-level-1 hover:bg-bg-secondary/40 hover:border-border-focus transition-all duration-120 group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-blue"
            >
              <div className="mb-2 transition-opacity duration-120 opacity-85 group-hover:opacity-100">
                <img
                  src="/folder_icon.svg"
                  alt=""
                  className="h-[14px] w-auto shrink-0 dark:invert"
                />
              </div>
              <div className="text-[13px] font-medium text-text-primary">
                Open project
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                setCloneOpen((open) => !open);
                setCloneError(null);
              }}
              className={`px-4 py-3 bg-bg-card border rounded-lg text-left cursor-pointer hover:shadow-level-1 hover:bg-bg-secondary/40 transition-all duration-120 group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-blue ${
                cloneOpen
                  ? "border-border-focus shadow-level-1"
                  : "border-border hover:border-border-focus"
              }`}
            >
              <div className="mb-2 transition-opacity duration-120 opacity-85 group-hover:opacity-100">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="shrink-0 text-text-primary"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <circle cx="18" cy="18" r="3" />
                  <circle cx="6" cy="6" r="3" />
                  <circle cx="6" cy="18" r="3" />
                  <path d="M8.6 7.6 15.4 16.4" />
                  <path d="M6 9v6" />
                </svg>
              </div>
              <div className="text-[13px] font-medium text-text-primary">
                Clone repo
              </div>
            </button>
          </div>

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
                    <span className="text-[10.5px] text-text-faint truncate max-w-[180px]">
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
