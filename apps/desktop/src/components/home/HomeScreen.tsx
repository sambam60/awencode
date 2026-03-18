import { useState } from "react";
import { useAppStore } from "@/lib/stores/app-store";

interface RecentProject {
  name: string;
  path: string;
  lastOpened?: string;
}

const RECENT_PROJECTS: RecentProject[] = [
  { name: "website_stuff", path: "Users/samsmith/desktop", lastOpened: "today" },
  { name: "api-service", path: "Users/samsmith/projects/api-service", lastOpened: "yesterday" },
  { name: "mobile-app", path: "Users/samsmith/projects/mobile-app", lastOpened: "2 days ago" },
];

interface HomeScreenProps {
  onOpenProject: () => void;
}

export function HomeScreen({ onOpenProject }: HomeScreenProps) {
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const setProjectName = useAppStore((s) => s.setProjectName);
  const [hoveredProject, setHoveredProject] = useState<string | null>(null);

  const handleOpenProject = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false });
      if (selected) {
        const name = typeof selected === "string" ? selected.split("/").filter(Boolean).pop() ?? null : null;
        setProjectName(name);
        onOpenProject();
      }
    } catch {
      onOpenProject();
    }
  };

  return (
    <div className="h-screen flex flex-col bg-bg-primary text-text-primary select-none">
      {/* Titlebar drag region */}
      <div
        data-tauri-drag-region
        className="h-10 shrink-0 flex items-center justify-end px-4"
      >
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded cursor-pointer text-text-faint hover:text-text-secondary hover:bg-bg-secondary transition-all duration-120"
          title={theme === "light" ? "Dark mode" : "Light mode"}
        >
          {theme === "light" ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          )}
        </button>
      </div>

      {/* Main content — centered */}
      <div className="flex-1 flex items-center justify-center">
        <div className="w-[340px]">
          {/* Logo + wordmark */}
          <div className="flex items-center gap-3 mb-8">
            <img src="/awencode_logo.svg" alt="awencode" className="h-9" />
            <div>
              <div className="text-[22px] font-semibold tracking-[-0.03em] text-text-primary leading-none">
                awencode
              </div>
              <button
                onClick={() => {}}
                className="font-mono text-[10px] text-accent-blue hover:opacity-80 cursor-pointer transition-opacity duration-120 mt-0.5 block"
              >
                Settings
              </button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2 mb-6">
            <button
              onClick={handleOpenProject}
              className="px-4 py-3 bg-bg-card border border-border rounded-lg text-left cursor-pointer hover:shadow-level-1 transition-all duration-120 group"
            >
              <div className="text-[13px] font-medium text-text-primary">
                Open project
              </div>
            </button>
            <button
              onClick={() => {}}
              className="px-4 py-3 bg-bg-card border border-border rounded-lg text-left cursor-pointer hover:shadow-level-1 transition-all duration-120 group"
            >
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
              <button className="font-mono text-[10px] text-text-faint hover:text-text-secondary cursor-pointer transition-colors duration-120">
                View All (48)
              </button>
            </div>

            <div className="flex flex-col gap-px">
              {RECENT_PROJECTS.map((project) => (
                <button
                  key={project.name}
                  onClick={() => {
                    setProjectName(project.name);
                    onOpenProject();
                  }}
                  onMouseEnter={() => setHoveredProject(project.name)}
                  onMouseLeave={() => setHoveredProject(null)}
                  className="flex items-center justify-between w-full px-0 py-1.5 text-left cursor-pointer group transition-all duration-120 rounded"
                >
                  <span
                    className="text-[13px] font-medium transition-colors duration-120"
                    style={{
                      color:
                        hoveredProject === project.name
                          ? "var(--text-primary)"
                          : "var(--text-primary)",
                    }}
                  >
                    {project.name}
                  </span>
                  <span className="font-mono text-[10.5px] text-text-faint">
                    {project.path}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
