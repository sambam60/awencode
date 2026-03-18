import { useState, useRef, useCallback } from "react";
import { Plus, ChevronDown, Mic, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface ComposeAreaProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  /** When true, show the new-thread placeholder (Ask anything, @ to add files, / for commands). */
  emptyThread?: boolean;
}

const MODELS = ["GPT-5.4"] as const;
const CONTEXT_LEVELS = ["Extra High"] as const;

const EMPTY_THREAD_PLACEHOLDER = "Ask anything, @ to add files, / for commands";
const FOLLOW_UP_PLACEHOLDER = "Ask for follow-up changes";

export function ComposeArea({ onSend, disabled, emptyThread = false }: ComposeAreaProps) {
  const [value, setValue] = useState("");
  const [modelOpen, setModelOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
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
    <div className="bg-bg-card rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="flex flex-col">
        <div className="relative px-4 pt-3 pb-2">
          {!value && (
            <span
              aria-hidden
              className="pointer-events-none absolute left-4 right-4 top-3 z-0 text-[12.5px] leading-[1.4] text-text-faint"
            >
              {emptyThread ? EMPTY_THREAD_PLACEHOLDER : FOLLOW_UP_PLACEHOLDER}
            </span>
          )}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder=" "
            disabled={disabled}
            rows={1}
            className="relative z-10 w-full bg-transparent border-none outline-none resize-none text-[12.5px] text-text-primary py-0 align-baseline max-h-32 leading-[1.4] placeholder:text-transparent"
            style={{ minHeight: "1.4em" }}
          />
        </div>
        <div className="flex items-center gap-2 px-3 pb-3 pt-1">
          <button
            type="button"
            disabled={disabled}
            className="p-1.5 text-text-secondary hover:text-text-primary rounded-md transition-colors duration-120 cursor-pointer disabled:opacity-50"
            aria-label="Add attachment"
          >
            <Plus size={16} strokeWidth={1.5} />
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setModelOpen((v) => !v)}
              disabled={disabled}
              className="flex items-center gap-1 text-[12px] text-text-secondary hover:text-text-primary font-medium rounded-md py-1.5 px-2 transition-colors duration-120 cursor-pointer disabled:opacity-50"
            >
              {MODELS[0]}
              <ChevronDown size={12} className="text-text-tertiary" />
            </button>
            {modelOpen && (
              <>
                <div className="absolute left-0 bottom-full mb-1 w-40 bg-bg-card border border-border-default rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.06)] z-50 py-1">
                  {MODELS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className="w-full text-left px-3 py-2 text-[12px] text-text-primary hover:bg-bg-secondary transition-colors duration-120"
                      onClick={() => setModelOpen(false)}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <div className="fixed inset-0 z-40" onClick={() => setModelOpen(false)} />
              </>
            )}
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setContextOpen((v) => !v)}
              disabled={disabled}
              className="flex items-center gap-1 text-[12px] text-text-secondary hover:text-text-primary font-medium rounded-md py-1.5 px-2 transition-colors duration-120 cursor-pointer disabled:opacity-50"
            >
              {CONTEXT_LEVELS[0]}
              <ChevronDown size={12} className="text-text-tertiary" />
            </button>
            {contextOpen && (
              <>
                <div className="absolute left-0 bottom-full mb-1 w-40 bg-bg-card border border-border-default rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.06)] z-50 py-1">
                  {CONTEXT_LEVELS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="w-full text-left px-3 py-2 text-[12px] text-text-primary hover:bg-bg-secondary transition-colors duration-120"
                      onClick={() => setContextOpen(false)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <div className="fixed inset-0 z-40" onClick={() => setContextOpen(false)} />
              </>
            )}
          </div>
          <div className="flex-1 min-w-0" />
          <button
            type="button"
            disabled={disabled}
            className="p-1.5 text-text-tertiary hover:text-text-secondary rounded-md transition-colors duration-120 cursor-pointer disabled:opacity-50"
            aria-label="Voice input"
          >
            <Mic size={16} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={disabled || !value.trim()}
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-120 cursor-pointer disabled:opacity-50",
              value.trim()
                ? "bg-text-primary text-bg-card hover:opacity-90"
                : "bg-bg-secondary text-text-faint cursor-default",
            )}
            aria-label="Send"
          >
            <ArrowUp size={18} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}
