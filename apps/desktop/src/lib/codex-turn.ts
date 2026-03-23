import { rpcRequest } from "@/lib/rpc-client";
import { invoke } from "@tauri-apps/api/core";

/** Cancel an in-flight turn (v2 `turn/interrupt`). */
export function interruptTurn(threadId: string, turnId: string): Promise<unknown> {
  return rpcRequest("turn/interrupt", { threadId, turnId });
}

export async function generateThreadTitle(seedMessage: string): Promise<string | null> {
  try {
    return await invoke<string | null>("generate_thread_title", { seedMessage });
  } catch {
    return null;
  }
}
