import { useState, useRef, useCallback } from "react";
import { ChevronDown, Pencil, ArrowUp, ArrowDown, Trash2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatUiStore, type QueuedMessage } from "@/lib/stores/chat-ui-store";

interface QueuedMessagesPanelProps {
  agentId: string;
}

function QueuedMessageRow({
  msg,
  index,
  total,
  agentId,
}: {
  msg: QueuedMessage;
  index: number;
  total: number;
  agentId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(msg.text);
  const inputRef = useRef<HTMLInputElement>(null);

  const updateQueuedMessage = useChatUiStore((s) => s.updateQueuedMessage);
  const removeQueuedMessage = useChatUiStore((s) => s.removeQueuedMessage);
  const moveQueuedMessage = useChatUiStore((s) => s.moveQueuedMessage);

  const handleStartEdit = useCallback(() => {
    setEditText(msg.text);
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [msg.text]);

  const handleSaveEdit = useCallback(() => {
    const trimmed = editText.trim();
    if (trimmed.length === 0) {
      removeQueuedMessage(agentId, msg.id);
    } else {
      updateQueuedMessage(agentId, msg.id, trimmed);
    }
    setEditing(false);
  }, [editText, agentId, msg.id, updateQueuedMessage, removeQueuedMessage]);

  const handleCancelEdit = useCallback(() => {
    setEditing(false);
    setEditText(msg.text);
  }, [msg.text]);

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-secondary/50">
        <input
          ref={inputRef}
          type="text"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSaveEdit();
            if (e.key === "Escape") handleCancelEdit();
          }}
          className="flex-1 min-w-0 bg-transparent border-none outline-none text-[12.5px] text-text-primary"
        />
        <button
          type="button"
          onClick={handleSaveEdit}
          className="w-5 h-5 flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors duration-120 cursor-pointer"
          aria-label="Save"
        >
          <Check size={12} strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={handleCancelEdit}
          className="w-5 h-5 flex items-center justify-center text-text-faint hover:text-text-secondary transition-colors duration-120 cursor-pointer"
          aria-label="Cancel"
        >
          <X size={12} strokeWidth={2} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 group/qrow hover:bg-bg-secondary/40 transition-colors duration-100">
      <span className="flex-1 min-w-0 truncate text-[12.5px] text-text-secondary">
        {msg.text}
      </span>
      <div className="flex items-center gap-0.5 opacity-0 group-hover/qrow:opacity-100 transition-opacity duration-100 shrink-0">
        <button
          type="button"
          onClick={handleStartEdit}
          className="w-5 h-5 flex items-center justify-center text-text-faint hover:text-text-secondary transition-colors duration-120 cursor-pointer"
          aria-label="Edit"
        >
          <Pencil size={11} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={() => moveQueuedMessage(agentId, msg.id, "up")}
          disabled={index === 0}
          className="w-5 h-5 flex items-center justify-center text-text-faint hover:text-text-secondary transition-colors duration-120 cursor-pointer disabled:opacity-30 disabled:cursor-default"
          aria-label="Move up"
        >
          <ArrowUp size={11} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={() => moveQueuedMessage(agentId, msg.id, "down")}
          disabled={index === total - 1}
          className="w-5 h-5 flex items-center justify-center text-text-faint hover:text-text-secondary transition-colors duration-120 cursor-pointer disabled:opacity-30 disabled:cursor-default"
          aria-label="Move down"
        >
          <ArrowDown size={11} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={() => removeQueuedMessage(agentId, msg.id)}
          className="w-5 h-5 flex items-center justify-center text-text-faint hover:text-accent-red transition-colors duration-120 cursor-pointer"
          aria-label="Delete"
        >
          <Trash2 size={11} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}

export function QueuedMessagesPanel({ agentId }: QueuedMessagesPanelProps) {
  const messages = useChatUiStore(
    (s) => s.queuedMessagesByAgentId[agentId] ?? [],
  );
  const [collapsed, setCollapsed] = useState(false);

  if (messages.length === 0) return null;

  return (
    <div className="border border-border-default rounded-lg overflow-hidden bg-bg-card mb-1.5">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-bg-secondary/30 transition-colors duration-100"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-tertiary">
          {messages.length} Queued
        </span>
        <ChevronDown
          size={12}
          strokeWidth={2}
          className={cn(
            "text-text-faint transition-transform duration-150",
            collapsed && "-rotate-90",
          )}
        />
      </button>
      {!collapsed && (
        <div className="border-t border-border-light">
          {messages.map((msg, i) => (
            <QueuedMessageRow
              key={msg.id}
              msg={msg}
              index={i}
              total={messages.length}
              agentId={agentId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
