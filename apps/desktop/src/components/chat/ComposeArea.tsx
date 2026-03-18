import { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

interface ComposeAreaProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function ComposeArea({ onSend, disabled }: ComposeAreaProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  return (
    <div className="border-t border-border-light px-4 py-3 bg-bg-card">
      <div className="flex items-end gap-2 border border-border rounded-lg px-3 py-2.5">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder="Send a message..."
          disabled={disabled}
          rows={1}
          className="flex-1 bg-transparent border-none outline-none resize-none text-sm text-text-primary placeholder:text-text-faint leading-relaxed max-h-32"
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          className={cn(
            "font-mono text-[10px] px-2 py-1 rounded cursor-pointer transition-all duration-120",
            value.trim()
              ? "bg-text-primary text-bg-card"
              : "bg-bg-secondary text-text-faint",
          )}
        >
          ↵
        </button>
      </div>
    </div>
  );
}
