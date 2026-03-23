import { rpcRequest } from "@/lib/rpc-client";
import { invoke } from "@tauri-apps/api/core";

export type OpenAiAccount =
  | { type: "apiKey" }
  | { type: "chatgpt"; email?: string | null; planType?: string | null };

export interface OpenAiAccountState {
  account: OpenAiAccount | null;
  requiresOpenaiAuth: boolean;
}

export function hasOpenAiAccountAuth(
  accountState: OpenAiAccountState | null | undefined,
): boolean {
  return accountState?.account != null;
}

export function isChatgptAccountAuth(
  accountState: OpenAiAccountState | null | undefined,
): boolean {
  return accountState?.account?.type === "chatgpt";
}

export async function readOpenAiAccount(
  refreshToken = false,
): Promise<OpenAiAccountState> {
  const liveState = normalizeOpenAiAccountState(
    await rpcRequest<unknown>("account/read", { refreshToken }),
  );
  if (liveState.account) {
    return liveState;
  }
  const persistedState = normalizeOpenAiAccountState(
    await invoke<unknown>("codex_read_persisted_openai_auth_state"),
  );
  return {
    account: persistedState.account,
    requiresOpenaiAuth: liveState.requiresOpenaiAuth,
  };
}

export async function activateSavedOpenAiApiKeyAuth(): Promise<void> {
  await invoke("codex_activate_openai_api_key_auth");
}

export async function refreshBridgeCredentials(): Promise<void> {
  await invoke("codex_refresh_bridge_credentials");
}

function normalizeOpenAiAccountState(raw: unknown): OpenAiAccountState {
  const object = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const accountRaw =
    object.account && typeof object.account === "object"
      ? (object.account as Record<string, unknown>)
      : null;
  const type = typeof accountRaw?.type === "string" ? accountRaw.type : null;

  let account: OpenAiAccount | null = null;
  if (type === "apiKey") {
    account = { type: "apiKey" };
  } else if (type === "chatgpt") {
    account = {
      type: "chatgpt",
      email: typeof accountRaw?.email === "string" ? accountRaw.email : null,
      planType:
        typeof accountRaw?.planType === "string"
          ? accountRaw.planType
          : typeof accountRaw?.plan_type === "string"
            ? accountRaw.plan_type
            : null,
    };
  }

  return {
    account,
    requiresOpenaiAuth:
      typeof object.requiresOpenaiAuth === "boolean"
        ? object.requiresOpenaiAuth
        : typeof object.requires_openai_auth === "boolean"
          ? object.requires_openai_auth
          : true,
  };
}
