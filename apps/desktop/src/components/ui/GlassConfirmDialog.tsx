import { useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { getThemePortalContainer } from "@/lib/theme-root";

export function GlassConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] text-text-primary">
      <div
        className="absolute inset-0 glass-backdrop cursor-default"
        role="presentation"
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none">
        <div
          className="w-full max-w-[400px] rounded-[10px] border border-border-light glass-overlay shadow-level-3 overflow-hidden pointer-events-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="glass-confirm-title"
        >
          <div className="px-5 pt-5 pb-4">
            <h2
              id="glass-confirm-title"
              className="text-[15px] font-semibold text-text-primary tracking-tight"
            >
              {title}
            </h2>
            <p className="text-[12.5px] text-text-secondary mt-2 leading-relaxed">{message}</p>
          </div>
          <div className="px-5 py-4 border-t border-border-light flex justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className={cn(
                "px-3.5 py-[7px] rounded-md text-[11.5px] font-medium border border-border-default text-text-secondary",
                "hover:bg-bg-secondary/80 transition-colors duration-120 cursor-pointer",
                busy && "opacity-50 pointer-events-none cursor-not-allowed",
              )}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className={cn(
                "px-3.5 py-[7px] rounded-md text-[11.5px] font-medium transition-colors duration-120 cursor-pointer",
                danger
                  ? "bg-accent-red text-white hover:brightness-95"
                  : "bg-text-primary text-bg-card hover:opacity-90",
                busy && "opacity-50 pointer-events-none cursor-not-allowed",
              )}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    getThemePortalContainer(),
  );
}
