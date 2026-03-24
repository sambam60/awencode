import { rpcRequest } from "@/lib/rpc-client";
import { generateThreadTitle } from "@/lib/codex-turn";
import { isAbsoluteFilePath } from "@/lib/dnd";
import {
  activateSavedOpenAiApiKeyAuth,
  hasOpenAiAccountAuth,
  isChatgptAccountAuth,
  readOpenAiAccount,
  refreshBridgeCredentials,
} from "@/lib/openai-auth";
import { useAppStore } from "@/lib/stores/app-store";
import { useChatUiStore } from "@/lib/stores/chat-ui-store";
import { useThreadStore } from "@/lib/stores/thread-store";
import {
  getSelectedModel,
  getSelectedReasoningEffort,
  useSettingsStore,
} from "@/lib/stores/settings-store";
import type { Attachment } from "@/components/chat/ComposeArea";
import { invoke } from "@tauri-apps/api/core";

const NEW_THREAD_TITLE = "New thread";

type ApiKeyStatuses = {
  openaiConfigured: boolean;
  openrouterConfigured: boolean;
  azureConfigured: boolean;
};

type ProviderValidationResult =
  | { ok: true; accountState?: Awaited<ReturnType<typeof readOpenAiAccount>> | null }
  | { ok: false; message: string };

function providerLabel(provider: string): string {
  if (provider === "openai") return "OpenAI";
  if (provider === "openrouter") return "OpenRouter";
  if (provider === "azure-openai-custom") return "Azure OpenAI";
  return provider;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

function appendLocalAgentError(agentId: string, content: string) {
  useThreadStore.getState().appendAgentMessage(agentId, {
    role: "agent",
    content,
  });
}

async function maybeFallbackToSavedOpenAiApiKey(
  accountState: Awaited<ReturnType<typeof readOpenAiAccount>> | null,
  keyStatuses: ApiKeyStatuses,
): Promise<boolean> {
  if (!isChatgptAccountAuth(accountState) || !keyStatuses.openaiConfigured) {
    return false;
  }
  try {
    await activateSavedOpenAiApiKeyAuth();
    return true;
  } catch {
    return false;
  }
}

function shouldFallbackOpenAiAuth(error: unknown): boolean {
  const message = extractErrorMessage(error).toLowerCase();
  return (
    message.includes("401") ||
    message.includes("unauthorized") ||
    message.includes("rate limit") ||
    message.includes("quota") ||
    message.includes("insufficient_quota") ||
    message.includes("billing") ||
    message.includes("plan limit")
  );
}

function shouldRefreshProviderCredentials(
  provider: string,
  error: unknown,
): boolean {
  const message = extractErrorMessage(error);
  if (provider === "openrouter") {
    return message.includes("OPENROUTER_API_KEY");
  }
  if (provider === "azure-openai-custom") {
    return message.includes("AZURE_OPENAI_API_KEY");
  }
  if (provider === "openai") {
    return message.includes("OPENAI_API_KEY");
  }
  return false;
}

async function validateSelectedProvider(): Promise<ProviderValidationResult> {
  const selected = getSelectedModel();
  const keyStatuses = await invoke<ApiKeyStatuses>("api_key_statuses");
  const azureDeployments = useSettingsStore.getState().azureDeployments;

  if (selected.provider === "openai") {
    const accountState = await readOpenAiAccount(false);
    if (hasOpenAiAccountAuth(accountState)) {
      return { ok: true, accountState };
    }
    if (keyStatuses.openaiConfigured) {
      try {
        await activateSavedOpenAiApiKeyAuth();
        const nextAccountState = await readOpenAiAccount(false);
        if (hasOpenAiAccountAuth(nextAccountState)) {
          return { ok: true, accountState: nextAccountState };
        }
      } catch {
        // Fall through to the normal error message below.
      }
    }
    return {
      ok: false,
      message:
        "OpenAI is selected, but no OpenAI auth is active. Add an API key or sign in with ChatGPT in Settings.",
    };
  }

  if (selected.provider === "openrouter" && !keyStatuses.openrouterConfigured) {
    return {
      ok: false,
      message:
        "OpenRouter is selected, but no OpenRouter API key is configured. Add one in Settings or switch to another provider.",
    };
  }

  if (selected.provider === "azure-openai-custom") {
    if (!azureDeployments.includes(selected.id)) {
      return {
        ok: false,
        message:
          "Azure OpenAI is selected, but that deployment no longer exists. Add it again in Settings before sending.",
      };
    }
    if (!keyStatuses.azureConfigured) {
      return {
        ok: false,
        message:
          "Azure OpenAI is selected, but no Azure API key is configured. Add one in Settings before sending.",
      };
    }
  }

  return { ok: true, accountState: null };
}

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

  try {
    const validation = await validateSelectedProvider();
    if (!validation.ok) {
      appendLocalAgentError(agentId, validation.message);
      setAgentStatus(agentId, "review");
      return;
    }

    const tryOpenAiFallback = async (error: unknown): Promise<boolean> => {
      if (getSelectedModel().provider !== "openai" || !shouldFallbackOpenAiAuth(error)) {
        return false;
      }
      const keyStatuses = await invoke<ApiKeyStatuses>("api_key_statuses");
      const latestAccountState =
        (await readOpenAiAccount(false).catch(() => validation.accountState ?? null)) ?? null;
      return maybeFallbackToSavedOpenAiApiKey(latestAccountState, keyStatuses);
    };

    const tryProviderCredentialRefresh = async (error: unknown): Promise<boolean> => {
      const provider = getSelectedModel().provider;
      if (!shouldRefreshProviderCredentials(provider, error)) {
        return false;
      }
      try {
        await refreshBridgeCredentials();
        return true;
      } catch {
        return false;
      }
    };

    let threadId = agent.codexThreadId;
    if (!threadId) {
      const handleStartedThread = (res: {
        thread: { id: string; name?: string | null };
        model?: string | null;
      }) => {
        threadId = res?.thread?.id;
        if (threadId) setAgentCodexThreadId(agentId, threadId);
        addAgentModel(agentId, res?.model ?? getSelectedModel().id);
        const serverName =
          typeof res?.thread?.name === "string" ? res.thread.name.trim() : "";
        if (serverName.length > 0) {
          const fromServer = truncateChatTitle(serverName);
          if (fromServer.length > 0) {
            updateAgentTitle(agentId, fromServer);
          }
        }
      };
      const startThread = async () =>
        rpcRequest<{
          thread: { id: string; name?: string | null };
          model?: string | null;
        }>("thread/start", {
          cwd: projectPath ?? undefined,
          model: getSelectedModel().id,
          modelProvider: getSelectedModel().provider,
        });
      try {
        handleStartedThread(await startThread());
      } catch (e) {
        console.error("thread/start failed", e);
        if (!(await tryOpenAiFallback(e))) {
          if (await tryProviderCredentialRefresh(e)) {
            try {
              handleStartedThread(await startThread());
            } catch (retryAfterRefreshError) {
              appendLocalAgentError(
                agentId,
                `Couldn't start a Codex thread with ${providerLabel(getSelectedModel().provider)} after refreshing credentials: ${extractErrorMessage(retryAfterRefreshError)}`,
              );
              setAgentStatus(agentId, "review");
              return;
            }
          }
          appendLocalAgentError(
            agentId,
            `Couldn't start a Codex thread with ${providerLabel(getSelectedModel().provider)}: ${extractErrorMessage(e)}`,
          );
          setAgentStatus(agentId, "review");
          return;
        }
        try {
          handleStartedThread(await startThread());
        } catch (retryError) {
          appendLocalAgentError(
            agentId,
            `Couldn't start a Codex thread with ${providerLabel(getSelectedModel().provider)} after falling back to your API key: ${extractErrorMessage(retryError)}`,
          );
          setAgentStatus(agentId, "review");
          return;
        }
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

    const startTurn = async () =>
      rpcRequest("turn/start", {
        threadId,
        input: inputItems,
        effort: getSelectedReasoningEffort(),
      });

    const resumeThreadIfNeeded = async (error: unknown): Promise<boolean> => {
      const msg = extractErrorMessage(error);
      if (!msg.toLowerCase().includes("thread not found")) return false;
      try {
        await rpcRequest("thread/resume", {
          threadId,
          cwd: projectPath ?? undefined,
          model: getSelectedModel().id,
          modelProvider: getSelectedModel().provider,
        });
        return true;
      } catch (resumeError) {
        console.error("thread/resume failed during auto-resume", resumeError);
        return false;
      }
    };

    try {
      await startTurn();
    } catch (e) {
      let currentError: unknown = e;
      console.error("turn/start failed", currentError);

      if (await resumeThreadIfNeeded(currentError)) {
        try {
          await startTurn();
          return;
        } catch (retryAfterResume) {
          console.error("turn/start failed after auto-resume", retryAfterResume);
          currentError = retryAfterResume;
        }
      }

      if (!(await tryOpenAiFallback(currentError))) {
        if (await tryProviderCredentialRefresh(currentError)) {
          try {
            await startTurn();
            return;
          } catch (retryAfterRefreshError) {
            appendLocalAgentError(
              agentId,
              `Couldn't start the turn with ${providerLabel(getSelectedModel().provider)} after refreshing credentials: ${extractErrorMessage(retryAfterRefreshError)}`,
            );
            setAgentStatus(agentId, "review");
            return;
          }
        }
        appendLocalAgentError(
          agentId,
          `Couldn't start the turn with ${providerLabel(getSelectedModel().provider)}: ${extractErrorMessage(currentError)}`,
        );
        setAgentStatus(agentId, "review");
        return;
      }
      try {
        await startTurn();
      } catch (retryError) {
        appendLocalAgentError(
          agentId,
          `Couldn't start the turn with ${providerLabel(getSelectedModel().provider)} after falling back to your API key: ${extractErrorMessage(retryError)}`,
        );
        setAgentStatus(agentId, "review");
      }
    }
    return;
  } catch (error) {
    appendLocalAgentError(
      agentId,
      `Couldn't verify your provider credentials before sending: ${extractErrorMessage(error)}`,
    );
    setAgentStatus(agentId, "review");
    return;
  }
}
