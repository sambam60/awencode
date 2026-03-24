import type { Attachment } from "@/components/chat/ComposeArea";
import { buildLinearDynamicTools } from "@/lib/linear-thread-tools";
import { rpcRequest } from "@/lib/rpc-client";
import { sendChatTurn } from "@/lib/send-chat-turn";
import { useAppStore } from "@/lib/stores/app-store";
import { getModelById, useSettingsStore } from "@/lib/stores/settings-store";
import { useThreadStore, type AgentMessage } from "@/lib/stores/thread-store";

const LINEAR_AUTO_SYNC_DEVELOPER_INSTRUCTION =
  "When Linear auto-sync is enabled, do not directly change the status of linked Linear issues. Change the Awencode thread status instead, and let Awencode sync linked Linear issues automatically.";

function linearAutoSyncDeveloperInstruction(): string | null {
  return useSettingsStore.getState().linearAutoSyncEnabled
    ? LINEAR_AUTO_SYNC_DEVELOPER_INSTRUCTION
    : null;
}

function countUserMessagesFrom(messages: AgentMessage[], fromIndex: number): number {
  return messages.slice(fromIndex).filter((m) => m.role === "you").length;
}

function isThreadNotFound(error: unknown): boolean {
  const msg =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return msg.toLowerCase().includes("thread not found");
}

/**
 * Roll back server turns from the edited user message onward, truncate local history,
 * then send the replacement prompt (same as a new turn from that point).
 */
export async function submitPromptEditRevert(
  agentId: string,
  messageIndex: number,
  message: string,
  attachments: Attachment[],
): Promise<void> {
  const agent = useThreadStore.getState().agents.find((a) => a.id === agentId);
  if (!agent) return;
  const selectedModel = getModelById(agent.selectedModelId);

  const numTurns = countUserMessagesFrom(agent.messages, messageIndex);
  if (numTurns < 1) return;

  const threadId = agent.codexThreadId;
  if (threadId) {
    try {
      await rpcRequest("thread/rollback", { threadId, numTurns });
    } catch (e) {
      if (isThreadNotFound(e)) {
        try {
          const projectPath = useAppStore.getState().projectPath;
          await rpcRequest("thread/resume", {
            threadId,
            cwd: projectPath ?? undefined,
            model: selectedModel.id,
            modelProvider: selectedModel.provider,
            developerInstructions: linearAutoSyncDeveloperInstruction(),
            dynamicTools: buildLinearDynamicTools(),
          });
          await rpcRequest("thread/rollback", { threadId, numTurns });
        } catch (resumeErr) {
          console.error("thread/rollback failed after auto-resume", resumeErr);
        }
      } else {
        console.error("thread/rollback failed", e);
      }
    }
  }

  useThreadStore.getState().truncateAgentMessagesFrom(agentId, messageIndex);
  await sendChatTurn(agentId, message, attachments);
}
