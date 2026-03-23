import { useEffect, useRef } from "react";
import { Command } from "cmdk";
import { useAppStore } from "@/lib/stores/app-store";

export function CommandBar() {
  const open = useAppStore((s) => s.commandBarOpen);
  const setOpen = useAppStore((s) => s.setCommandBarOpen);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!open);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 glass-backdrop flex items-start justify-center z-50"
      style={{ paddingTop: 160 }}
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[520px] bg-bg-card border border-border rounded-xl overflow-hidden shadow-level-3"
      >
        <Command className="flex flex-col">
          <div className="flex items-center px-4.5 py-4 gap-3">
            <span className="font-mono text-sm text-text-faint">⌘</span>
            <Command.Input
              ref={inputRef}
              placeholder="Tell the orchestrator what to do..."
              className="flex-1 bg-transparent border-none outline-none text-text-primary text-[14px]"
            />
          </div>
          <Command.List>
            <div className="border-t border-border-light px-4.5 py-2.5">
              <div className="font-mono text-xs text-text-faint leading-relaxed">
                "deploy the chart fix" · "what's blocking migration?" · "pause
                all running"
              </div>
            </div>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
