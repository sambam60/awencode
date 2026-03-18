import { useState, useRef, useCallback } from "react";
import { Plus, ChevronDown, Mic, ArrowUp, X, FileText, Image } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettingsStore, CURATED_MODELS, type ReasoningEffort } from "@/lib/stores/settings-store";

export interface Attachment {
  path: string;
  name: string;
  /** mime type if known */
  mime?: string;
  /** base64 data URI for images */
  dataUrl?: string;
}

interface ComposeAreaProps {
  onSend: (message: string, attachments: Attachment[]) => void;
  disabled?: boolean;
  /** When true, show the new-thread placeholder (Ask anything, @ to add files, / for commands). */
  emptyThread?: boolean;
}

const REASONING_LEVELS: Array<{ id: ReasoningEffort; label: string }> = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "xhigh", label: "Extra High" },
];

const EMPTY_THREAD_PLACEHOLDER = "Ask anything, @ to add files, / for commands";
const FOLLOW_UP_PLACEHOLDER = "Ask for follow-up changes";

export function ComposeArea({ onSend, disabled, emptyThread = false }: ComposeAreaProps) {
  const [value, setValue] = useState("");
  const [modelOpen, setModelOpen] = useState(false);
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedModelId = useSettingsStore((s) => s.selectedModelId);
  const selectedReasoningEffort = useSettingsStore((s) => s.selectedReasoningEffort);
  const enabledModels = useSettingsStore((s) => s.enabledModels);
  const setSelectedModelId = useSettingsStore((s) => s.setSelectedModelId);
  const setSelectedReasoningEffort = useSettingsStore((s) => s.setSelectedReasoningEffort);

  const enabledModelList = CURATED_MODELS.filter((m) => enabledModels[m.id]);
  const selectedModel = CURATED_MODELS.find((m) => m.id === selectedModelId) ?? enabledModelList[0] ?? CURATED_MODELS[0];

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed && attachments.length === 0) return;
    onSend(trimmed, attachments);
    setValue("");
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, attachments, onSend]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    files.forEach((file) => {
      const isImage = file.type.startsWith("image/");
      if (isImage) {
        const reader = new FileReader();
        reader.onload = () => {
          setAttachments((prev) => [
            ...prev,
            {
              path: file.name,
              name: file.name,
              mime: file.type,
              dataUrl: reader.result as string,
            },
          ]);
        };
        reader.readAsDataURL(file);
      } else {
        setAttachments((prev) => [
          ...prev,
          { path: file.name, name: file.name, mime: file.type },
        ]);
      }
    });
    e.target.value = "";
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

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

  const canSend = !disabled && (value.trim().length > 0 || attachments.length > 0);

  return (
    <div className="bg-bg-card rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.txt,.md,.ts,.tsx,.js,.jsx,.json,.py,.rs,.go,.css,.html"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="flex flex-col">
        {/* Attachment previews */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pt-3 pb-1">
            {attachments.map((att, i) => {
              const isImage = att.mime?.startsWith("image/");
              return (
                <div
                  key={i}
                  className="relative flex items-center gap-1.5 bg-bg-secondary border border-border-light rounded-md px-2 py-1.5 max-w-[160px] group"
                >
                  {isImage && att.dataUrl ? (
                    <img
                      src={att.dataUrl}
                      alt={att.name}
                      className="w-5 h-5 rounded object-cover shrink-0"
                    />
                  ) : isImage ? (
                    <Image size={13} className="text-text-faint shrink-0" />
                  ) : (
                    <FileText size={13} className="text-text-faint shrink-0" />
                  )}
                  <span className="font-mono text-[10px] text-text-secondary truncate">{att.name}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    className="ml-0.5 text-text-faint hover:text-text-secondary transition-colors duration-120 cursor-pointer shrink-0"
                  >
                    <X size={10} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

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
            onClick={() => fileInputRef.current?.click()}
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
              {selectedModel.name}
              <ChevronDown size={12} className="text-text-tertiary" />
            </button>
            {modelOpen && (
              <>
                <div className="absolute left-0 bottom-full mb-1 w-56 bg-bg-card border border-border-default rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.06)] z-50 py-1 max-h-64 overflow-y-auto">
                  {enabledModelList.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={cn(
                        "w-full text-left px-3 py-2 text-[12px] hover:bg-bg-secondary transition-colors duration-120",
                        m.id === selectedModelId ? "text-text-primary font-medium" : "text-text-secondary",
                      )}
                      onClick={() => {
                        setSelectedModelId(m.id);
                        setModelOpen(false);
                      }}
                    >
                      {m.name}
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
              onClick={() => setReasoningOpen((v) => !v)}
              disabled={disabled}
              className="flex items-center gap-1 text-[12px] text-text-secondary hover:text-text-primary font-medium rounded-md py-1.5 px-2 transition-colors duration-120 cursor-pointer disabled:opacity-50"
            >
              {REASONING_LEVELS.find((r) => r.id === selectedReasoningEffort)?.label ?? "medium"}
              <ChevronDown size={12} className="text-text-tertiary" />
            </button>
            {reasoningOpen && (
              <>
                <div className="absolute left-0 bottom-full mb-1 w-40 bg-bg-card border border-border-default rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.06)] z-50 py-1">
                  {REASONING_LEVELS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-[12px] text-text-primary hover:bg-bg-secondary transition-colors duration-120"
                      onClick={() => {
                        setSelectedReasoningEffort(c.id);
                        setReasoningOpen(false);
                      }}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                <div className="fixed inset-0 z-40" onClick={() => setReasoningOpen(false)} />
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
            disabled={!canSend}
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-120 cursor-pointer disabled:opacity-50",
              canSend
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
