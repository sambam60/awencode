import { rpcRequest } from "@/lib/rpc-client";
import { generateThreadTitle } from "@/lib/codex-turn";
import { isAbsoluteFilePath } from "@/lib/dnd";
import { useAppStore } from "@/lib/stores/app-store";
import { useChatUiStore } from "@/lib/stores/chat-ui-store";
import { useThreadStore } from "@/lib/stores/thread-store";
import {
  getSelectedModel,
  getSelectedReasoningEffort,
} from "@/lib/stores/settings-store";
import type { Attachment } from "@/components/chat/ComposeArea";

const NEW_THREAD_TITLE = "New thread";

function truncateChatTitle(text: string): string {
  const t = text.trim();
  if (!t) return "";
  return t.length > 56 ? `${t.slice(0, 53)}…` : t;
}

function titleFromFirstSendDisplay(displayContent: string): string | null {
  const line = displayContent.split("\n")[0]?.trim() ?? "";
  const next = truncateChatTitle(line);
  return next.length > 0 ? next : null;
}

/**
 * Send a user turn to Codex (thread/start, append message, turn/start).
 * Used by ChatView composer and the board “play” control on queued threads.
 */
export async function sendChatTurn(
  agentId: string,
  message: string,
  attachments: Attachment[],
): Promise<void> {
  const trimmed = message.trim();
  if (!trimmed && attachments.length === 0) return;

  const agent = useThreadStore.getState().agents.find((a) => a.id === agentId);
  if (!agent) return;

  const projectPath = useAppStore.getState().projectPath;
  const wasUnsetTitle = agent.title === NEW_THREAD_TITLE;
  const firstUserSend = agent.messages.length === 0;

  const displayContent =
    trimmed ||
    (attachments.length > 0
      ? `[${attachments.map((a) => a.name).join(", ")}]`
      : "");
  const imageUrls = attachments
    .filter((a) => a.mime?.startsWith("image/") && a.dataUrl)
    .map((a) => a.dataUrl as string);

  useChatUiStore.getState().setComposeDraft(agentId, "");

  const {
    appendAgentMessage,
    setAgentStatus,
    setAgentCodexThreadId,
    addAgentModel,
    updateAgentTitle,
  } = useThreadStore.getState();

  appendAgentMessage(agentId, {
    role: "you",
    content: displayContent,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
  });

  if (firstUserSend && agent.status === "queued") {
    setAgentStatus(agentId, "active");
  }

  const provisionalTitle = wasUnsetTitle
    ? titleFromFirstSendDisplay(displayContent)
    : null;
  if (provisionalTitle) {
    updateAgentTitle(agentId, provisionalTitle);
  }

  let threadId = agent.codexThreadId;
  if (!threadId) {
    try {
      const selected = getSelectedModel();
      const res = await rpcRequest<{
        thread: { id: string; name?: string | null };
        model?: string | null;
      }>("thread/start", {
        cwd: projectPath ?? undefined,
        model: selected.id,
        modelProvider: selected?.provider,
      });
      threadId = res?.thread?.id;
      if (threadId) setAgentCodexThreadId(agentId, threadId);
      addAgentModel(agentId, res?.model ?? selected.id);
      const serverName =
        typeof res?.thread?.name === "string" ? res.thread.name.trim() : "";
      if (serverName.length > 0) {
        const fromServer = truncateChatTitle(serverName);
        if (fromServer.length > 0) {
          updateAgentTitle(agentId, fromServer);
        }
      }
    } catch (e) {
      console.error("thread/start failed", e);
      return;
    }
  }
  if (!threadId) return;

  if (wasUnsetTitle) {
    const latestTitle =
      useThreadStore.getState().agents.find((a) => a.id === agentId)?.title.trim() ??
      "";
    if (latestTitle.length > 0 && latestTitle !== NEW_THREAD_TITLE) {
      rpcRequest("thread/name/set", { threadId, name: latestTitle }).catch((e) => {
        console.error("thread/name/set failed", e);
      });
    }

    if (displayContent.trim().length > 0) {
      generateThreadTitle(displayContent)
        .then((generatedTitle) => {
          if (!generatedTitle) return;
          const currentTitle =
            useThreadStore.getState().agents.find((a) => a.id === agentId)?.title ?? "";
          if (
            currentTitle !== NEW_THREAD_TITLE &&
            provisionalTitle &&
            currentTitle !== provisionalTitle
          ) {
            return;
          }
          updateAgentTitle(agentId, generatedTitle);
          return rpcRequest("thread/name/set", { threadId, name: generatedTitle });
        })
        .catch((e) => {
          console.error("thread title generation failed", e);
        });
    }
  }

  const inputItems: Array<Record<string, unknown>> = [];
  for (const att of attachments) {
    if (att.mime?.startsWith("image/") && att.dataUrl) {
      inputItems.push({ type: "image", url: att.dataUrl });
    } else if (att.mime?.startsWith("image/") && isAbsoluteFilePath(att.path)) {
      inputItems.push({ type: "localImage", path: att.path });
    } else if (isAbsoluteFilePath(att.path)) {
      inputItems.push({
        type: "mention",
        name: att.name,
        path: att.path,
      });
    } else {
      inputItems.push({
        type: "text",
        text: `[File: ${att.name}]`,
        textElements: [],
      });
    }
  }
  if (trimmed) {
    inputItems.push({ type: "text", text: trimmed, textElements: [] });
  }

  try {
    await rpcRequest("turn/start", {
      threadId,
      input: inputItems,
      effort: getSelectedReasoningEffort(),
    });
  } catch (e) {
    console.error("turn/start failed", e);
  }
}
