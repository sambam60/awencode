import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export async function rpcRequest<T = unknown>(
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  return invoke<T>("rpc_request", { method, params });
}

export async function rpcNotify(
  method: string,
  params: Record<string, unknown> = {},
): Promise<void> {
  return invoke("rpc_notify", { method, params });
}

/** Send a JSON-RPC response back to the app-server for a server request. */
export async function rpcRespond(
  id: number,
  result: unknown = {},
): Promise<void> {
  return invoke("rpc_respond", { id, result });
}

export function onNotification(
  callback: (payload: string) => void,
): Promise<UnlistenFn> {
  return listen<string>("codex:notification", (event) => {
    callback(event.payload);
  });
}
