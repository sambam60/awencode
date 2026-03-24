import {
  useState,
  useRef,
  useCallback,
  useLayoutEffect,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { Plus, ChevronDown, Mic, ArrowUp, X, Image } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import { getThemePortalContainer } from "@/lib/theme-root";
import {
  AWENCODE_FILE_PATH_MIME,
  AWENCODE_FILE_KIND_MIME,
  dataTransferMightContainFiles,
  filePathsFromUriList,
  isAbsoluteFilePath,
} from "@/lib/dnd";
import { FolderIcon, resolveSetiKey, SetiIcon } from "@/lib/seti-icons";
import { useIsDarkMode } from "@/lib/use-is-dark-mode";
import {
  useSettingsStore,
  CURATED_MODELS,
  buildAzureDeploymentModels,
  type ReasoningEffort,
} from "@/lib/stores/settings-store";
import { useThreadStore } from "@/lib/stores/thread-store";
import { useChatUiStore } from "@/lib/stores/chat-ui-store";

export interface Attachment {
  path: string;
  name: string;
  /** mime type if known */
  mime?: string;
  /** base64 data URI for images */
  dataUrl?: string;
  /** From tree drag, OS drop, or path probe — drives folder vs Seti file icon */
  isDirectory?: boolean;
}

export interface PromptEditTarget {
  messageIndex: number;
  seedText: string;
}

interface ComposeAreaProps {
  onSend: (message: string, attachments: Attachment[]) => void;
  disabled?: boolean;
  /** When true, show the new-thread placeholder (Ask anything, @ to add files, / for commands). */
  emptyThread?: boolean;
  /** Thread id — used with `persistQueuedDraft` to save prompt text per project. */
  agentId: string;
  /** Persist prompt text for Queue threads (survives leaving chat / app restart for this project). */
  persistQueuedDraft?: boolean;
  /** When set, Send opens the edit confirmation flow instead of a normal turn. */
  promptEditTarget?: PromptEditTarget | null;
  onPromptEditSubmit?: (message: string, attachments: Attachment[]) => void;
  onCancelPromptEdit?: () => void;
  /** `thread` = inline in transcript (morphs from bubble radius into compose card). */
  placement?: "dock" | "thread";
  /** True while a turn is in progress — swaps the send button for a stop button. */
  isRunning?: boolean;
  /** Called when the user clicks the stop button. */
  onStop?: () => void;
  /** True while a stop request is in flight. */
  stopping?: boolean;
}

const REASONING_LEVELS: Array<{ id: ReasoningEffort; label: string }> = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "xhigh", label: "Extra High" },
];

const EMPTY_THREAD_PLACEHOLDER = "Ask anything, @ to add files, / for commands";
const FOLLOW_UP_PLACEHOLDER = "Ask for follow-up changes";

/** Escape chat column overflow; portal mounts under theme root for `.dark` + tokens. */
function GlassMenuPortal({
  open,
  anchorRef,
  onClose,
  widthPx,
  widthClass,
  children,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  widthPx: number;
  widthClass: string;
  children: ReactNode;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setRect(null);
      return;
    }
    const update = () => {
      if (anchorRef.current) {
        setRect(anchorRef.current.getBoundingClientRect());
      }
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorRef]);

  if (typeof document === "undefined" || !open || !rect) {
    return null;
  }

  const viewportPadding = 8;
  const anchorGap = 4;
  const preferredMaxHeight = 256;
  const preferredMinHeight = 80;
  const spaceAbove = rect.top - anchorGap - viewportPadding;
  const spaceBelow = window.innerHeight - rect.bottom - anchorGap - viewportPadding;
  const openBelow = spaceAbove < preferredMinHeight && spaceBelow > spaceAbove;
  const availableHeight = Math.max(0, openBelow ? spaceBelow : spaceAbove);
  const maxH = Math.min(preferredMaxHeight, availableHeight);
  const left = Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - widthPx - viewportPadding));
  const positionStyle = openBelow
    ? { left, top: rect.bottom + anchorGap }
    : { left, bottom: window.innerHeight - rect.top + anchorGap };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[90]" onClick={onClose} aria-hidden />
      <div
        className={cn(
          "fixed z-[100] rounded-lg glass-overlay text-text-primary",
          widthClass,
        )}
        style={positionStyle}
      >
        <div
          className="overflow-y-auto overscroll-contain rounded-lg"
          style={{ maxHeight: maxH }}
        >
          {children}
        </div>
      </div>
    </>,
    getThemePortalContainer(),
  );
}

export function ComposeArea({
  onSend,
  disabled,
  emptyThread = false,
  agentId,
  persistQueuedDraft = false,
  promptEditTarget = null,
  onPromptEditSubmit,
  onCancelPromptEdit,
  placement = "dock",
  isRunning = false,
}: ComposeAreaProps) {
  const setComposeDraft = useChatUiStore((s) => s.setComposeDraft);
  const [value, setValue] = useState(() =>
    placement === "thread"
      ? ""
      : persistQueuedDraft
        ? (useChatUiStore.getState().composeDraftByAgentId[agentId] ?? "")
        : "",
  );

  const syncValue = useCallback(
    (next: string) => {
      setValue(next);
      if (persistQueuedDraft && placement === "dock") {
        setComposeDraft(agentId, next);
      }
    },
    [persistQueuedDraft, placement, agentId, setComposeDraft],
  );
  const [modelOpen, setModelOpen] = useState(false);
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragHighlight, setDragHighlight] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composeRootRef = useRef<HTMLDivElement>(null);
  const modelAnchorRef = useRef<HTMLButtonElement>(null);
  const reasoningAnchorRef = useRef<HTMLButtonElement>(null);

  const defaultSelectedModelId = useSettingsStore((s) => s.selectedModelId);
  const defaultSelectedReasoningEffort = useSettingsStore((s) => s.selectedReasoningEffort);
  const azureDeployments = useSettingsStore((s) => s.azureDeployments);
  const enabledModels = useSettingsStore((s) => s.enabledModels);
  const agentSelectedModelId = useThreadStore(
    (s) => s.agents.find((a) => a.id === agentId)?.selectedModelId ?? null,
  );
  const agentSelectedReasoningEffort = useThreadStore(
    (s) => s.agents.find((a) => a.id === agentId)?.selectedReasoningEffort ?? null,
  );
  const setAgentSelectedModelId = useThreadStore((s) => s.setAgentSelectedModelId);
  const setAgentSelectedReasoningEffort = useThreadStore(
    (s) => s.setAgentSelectedReasoningEffort,
  );
  const isDark = useIsDarkMode();

  const modelOptions = [...CURATED_MODELS, ...buildAzureDeploymentModels(azureDeployments)];
  const selectedModelId = agentSelectedModelId ?? defaultSelectedModelId;
  const selectedReasoningEffort =
    agentSelectedReasoningEffort ?? defaultSelectedReasoningEffort;

  const enabledModelList = modelOptions.filter((m) => enabledModels[m.id]);
  const selectedModel =
    modelOptions.find((m) => m.id === selectedModelId) ??
    enabledModelList[0] ??
    modelOptions[0];

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed && attachments.length === 0) return;
    if (promptEditTarget && onPromptEditSubmit) {
      onPromptEditSubmit(trimmed, attachments);
      return;
    }
    onSend(trimmed, attachments);
    setValue("");
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, attachments, onSend, promptEditTarget, onPromptEditSubmit]);

  const addFilesFromList = useCallback((files: File[]) => {
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
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    addFilesFromList(files);
    e.target.value = "";
  };

  const endDragHighlight = () => setDragHighlight(false);

  const composeDragLooksLikeDrop = (dt: DataTransfer) => {
    if (dataTransferMightContainFiles(dt)) return true;
    // WebKit / OS file drags sometimes expose no types until drop; still need highlight + dragOver default prevented.
    const types = dt.types ? Array.from(dt.types) : [];
    if (types.length === 0) return true;
    return false;
  };

  const handleDragEnter = (e: React.DragEvent) => {
    if (!composeDragLooksLikeDrop(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    setDragHighlight(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    const root = composeRootRef.current;
    const related = e.relatedTarget as Node | null;
    if (root && related && root.contains(related)) return;
    endDragHighlight();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    if (composeDragLooksLikeDrop(e.dataTransfer)) {
      setDragHighlight(true);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    endDragHighlight();

    const dt = e.dataTransfer;
    const seenPaths = new Set<string>();
    const treeKind = dt.getData(AWENCODE_FILE_KIND_MIME);

    void (async () => {
      const pushPath = async (raw: string, kindHint?: "file" | "folder") => {
        const path = raw.trim();
        if (!path || seenPaths.has(path)) return;
        seenPaths.add(path);
        const name = path.split(/[/\\]/).pop() ?? path;
        let isDirectory: boolean;
        if (kindHint === "folder") {
          isDirectory = true;
        } else if (kindHint === "file") {
          isDirectory = false;
        } else if (isAbsoluteFilePath(path)) {
          try {
            isDirectory = await invoke<boolean>("path_is_directory", { path });
          } catch {
            isDirectory = false;
          }
        } else {
          isDirectory = false;
        }
        setAttachments((prev) => [...prev, { path, name, isDirectory }]);
      };

      const custom = dt.getData(AWENCODE_FILE_PATH_MIME);
      if (custom) {
        const hint =
          treeKind === "folder" ? "folder" : treeKind === "file" ? "file" : undefined;
        await pushPath(custom, hint);
      }

      const uriList = dt.getData("text/uri-list");
      if (uriList) {
        for (const p of filePathsFromUriList(uriList)) {
          await pushPath(p, undefined);
        }
      }

      const plain = dt.getData("text/plain").trim();
      if (plain && isAbsoluteFilePath(plain)) {
        await pushPath(plain, undefined);
      }

      const dropped = Array.from(dt.files ?? []);
      if (dropped.length > 0 && seenPaths.size === 0) {
        addFilesFromList(dropped);
      }
    })();
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

  // Expand only after enough content — 30 chars of text OR any attachment
  const EXPAND_THRESHOLD = 50;
  const isExpanded =
    placement === "thread" ||
    value.length >= EXPAND_THRESHOLD ||
    attachments.length > 0;

  const editIndex = promptEditTarget?.messageIndex;
  const editSeed = promptEditTarget?.seedText;
  useLayoutEffect(() => {
    if (editIndex === undefined || editSeed === undefined) return;
    syncValue(editSeed);
    setAttachments([]);
  }, [editIndex, editSeed, syncValue]);

  const [threadMorphOpen, setThreadMorphOpen] = useState(false);
  useLayoutEffect(() => {
    if (placement !== "thread") return;
    setThreadMorphOpen(false);
    let cancelled = false;
    const outer = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) setThreadMorphOpen(true);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(outer);
    };
  }, [placement, promptEditTarget?.messageIndex, promptEditTarget?.seedText]);

  // When transitioning into expanded state, resize the textarea to fit existing content
  useLayoutEffect(() => {
    if (isExpanded && textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      textareaRef.current.focus();
    }
  }, [isExpanded]);

  // Dock: pill → card. Thread: bubble-like → card (morph in transcript).
  const borderRadius =
    placement === "thread"
      ? threadMorphOpen
        ? "10px"
        : "16px"
      : isExpanded
        ? "10px"
        : "9999px";

  return (
    <div
      ref={composeRootRef}
      className={cn(
        "overflow-hidden bg-bg-card border border-border-default shadow-[0_1px_4px_rgba(0,0,0,0.04)]",
        placement === "thread" && "w-full max-w-full min-w-0",
        dragHighlight && "border-accent-blue shadow-[inset_0_0_0_1px_var(--accent-blue)]",
      )}
      style={{
        borderRadius,
        clipPath: `inset(0 round ${borderRadius})`,
        willChange: "border-radius, clip-path",
        transition:
          "border-radius 460ms cubic-bezier(0.16,1,0.3,1), clip-path 460ms cubic-bezier(0.16,1,0.3,1), border-color 180ms ease-out, box-shadow 180ms ease-out",
      }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {promptEditTarget && onCancelPromptEdit && placement === "dock" ? (
        <div className="flex items-center justify-between gap-2 px-4 pt-2.5 pb-1">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-text-tertiary">
            Editing earlier message
          </span>
          <button
            type="button"
            onClick={onCancelPromptEdit}
            className="font-sans text-[11.5px] text-text-secondary hover:text-text-primary transition-colors duration-120 cursor-pointer shrink-0"
          >
            Cancel
          </button>
        </div>
      ) : null}
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.txt,.md,.ts,.tsx,.js,.jsx,.json,.py,.rs,.go,.css,.html"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Expanding content area — grid-rows trick for fluid height animation */}
      <div
        className="grid"
        style={{
          gridTemplateRows: isExpanded ? "1fr" : "0fr",
          transition: "grid-template-rows 440ms cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        <div
          className="overflow-hidden"
          style={{
            opacity: isExpanded ? 1 : 0.72,
            transform: isExpanded ? "translateY(0px)" : "translateY(-3px)",
            transition:
              "opacity 280ms ease-out, transform 440ms cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          {/* Attachment chips */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 pt-3 pb-1">
              {attachments.map((att, i) => {
                const isImage = att.mime?.startsWith("image/");
                const isFolder = att.isDirectory === true;
                const setiKey = !isFolder && !isImage ? resolveSetiKey(att.name) : null;
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
                    ) : isFolder ? (
                      <FolderIcon open={false} size={15} />
                    ) : (
                      <SetiIcon iconKey={setiKey!} isDark={isDark} size={15} />
                    )}
                    <span className="font-sans text-[12px] font-normal text-text-secondary truncate">
                      {att.name}
                    </span>
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

          {/* Expanded textarea */}
          <div className={cn("px-4 pb-1", attachments.length > 0 ? "pt-1" : "pt-3")}>
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => syncValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              onDragOver={handleDragOver}
              disabled={disabled}
              rows={1}
              className="w-full bg-transparent border-none outline-none resize-none text-[13px] text-text-primary py-0 leading-[1.5] max-h-52 overflow-y-auto"
              style={{ minHeight: "1.5em" }}
            />
          </div>
        </div>
      </div>

      {/* Single-row pill bar — always visible */}
      <div className="flex items-center gap-1 px-2 py-2">
        {placement === "thread" && onCancelPromptEdit ? (
          <button
            type="button"
            onClick={onCancelPromptEdit}
            className="flex items-center justify-center w-7 h-7 text-text-tertiary hover:text-text-secondary rounded-full transition-colors duration-120 cursor-pointer shrink-0"
            aria-label="Cancel editing"
            title="Cancel"
          >
            <X size={15} strokeWidth={1.5} />
          </button>
        ) : null}
        {/* + button */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center justify-center w-7 h-7 text-text-secondary hover:text-text-primary rounded-full transition-colors duration-120 cursor-pointer disabled:opacity-50 shrink-0"
          aria-label="Add attachment"
        >
          <Plus size={15} strokeWidth={1.5} />
        </button>

        {/* Inline input area — visible text + placeholder when collapsed */}
        <div className="flex-1 min-w-0 relative">
          {/* Placeholder fades out as user types */}
          <span
            aria-hidden
            className="absolute inset-0 flex items-center text-[12.5px] leading-[1.5] text-text-faint select-none pointer-events-none transition-opacity duration-150"
            style={{ opacity: value.length > 0 ? 0 : 1 }}
          >
            {emptyThread ? EMPTY_THREAD_PLACEHOLDER : FOLLOW_UP_PLACEHOLDER}
          </span>
          {/* Visible single-line input — shown only when collapsed, lets user see what they're typing */}
          {!isExpanded && (
            <input
              type="text"
              value={value}
              onChange={(e) => syncValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              disabled={disabled}
              className="relative w-full bg-transparent border-none outline-none text-[12.5px] text-text-primary leading-[1.5] py-0"
              aria-label={emptyThread ? EMPTY_THREAD_PLACEHOLDER : FOLLOW_UP_PLACEHOLDER}
            />
          )}
          {/* When expanded, clicking this area focuses the textarea above */}
          {isExpanded && (
            <div
              className="w-full h-full cursor-text"
              onClick={() => textareaRef.current?.focus()}
            />
          )}
        </div>

        {/* Right-side controls */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Model selector */}
          <div className="relative">
            <button
              ref={modelAnchorRef}
              type="button"
              onClick={() => {
                setReasoningOpen(false);
                setModelOpen((v) => !v);
              }}
              disabled={disabled}
              className="flex items-center gap-1 text-[11.5px] text-text-secondary hover:text-text-primary font-medium rounded-full py-1 px-2.5 transition-colors duration-120 cursor-pointer disabled:opacity-50"
            >
              {selectedModel.name}
              <ChevronDown size={11} className="text-text-tertiary" />
            </button>
            <GlassMenuPortal
              open={modelOpen}
              anchorRef={modelAnchorRef}
              onClose={() => setModelOpen(false)}
              widthPx={224}
              widthClass="w-56"
            >
              {enabledModelList.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={cn(
                    "w-full text-left px-3 py-2 text-[12px] glass-menu-row outline-none",
                    m.id === selectedModelId
                      ? "glass-menu-row-active text-text-primary font-medium"
                      : "text-text-secondary",
                  )}
                  onClick={() => {
                    setAgentSelectedModelId(agentId, m.id);
                    setModelOpen(false);
                  }}
                >
                  {m.name}
                </button>
              ))}
            </GlassMenuPortal>
          </div>

          {/* Reasoning selector */}
          <div className="relative">
            <button
              ref={reasoningAnchorRef}
              type="button"
              onClick={() => {
                setModelOpen(false);
                setReasoningOpen((v) => !v);
              }}
              disabled={disabled}
              className="flex items-center gap-1 text-[11.5px] text-text-secondary hover:text-text-primary font-medium rounded-full py-1 px-2.5 transition-colors duration-120 cursor-pointer disabled:opacity-50"
            >
              {REASONING_LEVELS.find((r) => r.id === selectedReasoningEffort)?.label ?? "Medium"}
              <ChevronDown size={11} className="text-text-tertiary" />
            </button>
            <GlassMenuPortal
              open={reasoningOpen}
              anchorRef={reasoningAnchorRef}
              onClose={() => setReasoningOpen(false)}
              widthPx={160}
              widthClass="w-40"
            >
              {REASONING_LEVELS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={cn(
                    "w-full text-left px-3 py-2 text-[12px] glass-menu-row outline-none",
                    c.id === selectedReasoningEffort
                      ? "glass-menu-row-active text-text-primary font-medium"
                      : "text-text-secondary",
                  )}
                  onClick={() => {
                    setAgentSelectedReasoningEffort(agentId, c.id);
                    setReasoningOpen(false);
                  }}
                >
                  {c.label}
                </button>
              ))}
            </GlassMenuPortal>
          </div>

          {/* Mic */}
          <button
            type="button"
            disabled={disabled}
            className="flex items-center justify-center w-7 h-7 text-text-tertiary hover:text-text-secondary rounded-full transition-colors duration-120 cursor-pointer disabled:opacity-50"
            aria-label="Voice input"
          >
            <Mic size={15} strokeWidth={1.5} />
          </button>

          {/* Send — always visible; queues message when a turn is in-flight */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSend}
            className={cn(
              "w-7 h-7 rounded-full flex items-center justify-center transition-colors duration-200 cursor-pointer disabled:cursor-default",
              canSend
                ? "bg-text-primary text-bg-card hover:opacity-90"
                : "bg-bg-secondary text-text-faint",
            )}
            aria-label={isRunning ? "Queue message" : "Send"}
          >
            <ArrowUp size={15} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}
