import type { Agent } from "@/lib/stores/thread-store";
import { useAppStore } from "@/lib/stores/app-store";
import { useViewStore } from "@/lib/stores/view-store";
import { useResolvedThemeIsDark } from "@/lib/use-resolved-theme-dark";

interface StatusBarProps {
  agents: Agent[];
  onOpenSettings?: () => void;
}

export function StatusBar({ agents, onOpenSettings }: StatusBarProps) {
  const setCommandBarOpen = useAppStore((s) => s.setCommandBarOpen);
  const themePref = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const resolvedDark = useResolvedThemeIsDark();
  const view = useViewStore((s) => s.view);
  const running = agents.filter((a) => a.status === "active").length;
  const review = agents.filter((a) => a.status === "review").length;
  const attention = agents.filter((a) => a.blocked).length;

  return (
    <div
      data-tauri-drag-region
      className="px-7 py-4.5 flex justify-between items-center shrink-0 select-none"
    >
      <div className="flex items-center gap-4">
        <div className="text-xl font-semibold tracking-tighter">
          orchestrator
        </div>
        <span className="font-mono text-[10.5px] text-text-faint tracking-wide">
          awencode
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex gap-4 font-mono text-xs text-text-tertiary">
          <span>
            <span className="text-accent-blue">{running}</span> running
          </span>
          <span>
            <span style={{ color: "#F4B400" }}>{review}</span> review
          </span>
          {attention > 0 && (
            <span>
              <span style={{ color: "#FF4700" }}>{attention}</span> attention
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleTheme}
            className="p-2 rounded cursor-pointer text-text-faint hover:text-text-secondary hover:bg-bg-secondary transition-all duration-120"
            title={
              themePref === "system"
                ? resolvedDark
                  ? "Switch to light (currently following system)"
                  : "Switch to dark (currently following system)"
                : resolvedDark
                  ? "Light mode"
                  : "Dark mode"
            }
          >
            {!resolvedDark ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/>
                <line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            )}
          </button>

          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="p-2 rounded cursor-pointer text-text-faint hover:text-text-secondary hover:bg-bg-secondary transition-all duration-120"
              title="Settings"
            >
              <img
                src={view === "settings" ? "/gear_filled.svg" : "/gear.svg"}
                alt=""
                className="h-3.5 w-3.5 shrink-0 opacity-85 dark:invert"
              />
            </button>
          )}
        </div>

        <button
          onClick={() => setCommandBarOpen(true)}
          className="bg-bg-card border border-border rounded px-3.5 py-1.5 cursor-pointer flex items-center gap-2.5 text-sm text-text-tertiary hover:shadow-level-1 transition-all duration-120"
        >
          Command
          <span className="kbd-badge">⌘K</span>
        </button>
      </div>
    </div>
  );
}
