import { cn } from "@/lib/utils";
import type { AgentMessage } from "@/lib/stores/thread-store";

interface MessageBubbleProps {
  message: AgentMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "you";

  return (
    <div className="px-4 py-3 bg-bg-card border border-border-light rounded-lg">
      <div
        className={cn(
          "font-mono text-2xs font-semibold uppercase tracking-label-wide mb-2",
          isUser ? "text-text-secondary" : "text-text-faint",
        )}
      >
        {message.role}
      </div>
      <div className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
        {message.content}
      </div>
    </div>
  );
}
