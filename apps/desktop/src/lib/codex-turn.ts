import { rpcRequest, onNotification } from "@/lib/rpc-client";
import { useAppStore } from "@/lib/stores/app-store";
import { getSelectedModel } from "@/lib/stores/settings-store";

const TITLE_GENERATION_TIMEOUT_MS = 15_000;
const TITLE_PROMPT = `Generate a concise title for this coding chat.

Rules:
- Return only the title text.
- Use 2 to 6 words when possible.
- No quotes.
- No punctuation at the end unless required.
- Prefer a specific technical summary over generic wording.`;

function threadIdFromParams(params: Record<string, unknown>): string | undefined {
  if (typeof params.threadId === "string") return params.threadId;
  if (typeof params.thread_id === "string") return params.thread_id;
  return undefined;
}

function truncateGeneratedTitle(text: string): string {
  return text.length > 56 ? `${text.slice(0, 53)}...` : text;
}

function normalizeGeneratedTitle(raw: string): string | null {
  const firstLine = raw
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return null;

  const cleaned = firstLine
    .replace(/^["'`]+/, "")
    .replace(/["'`]+$/, "")
    .replace(/^title:\s*/i, "")
    .trim();

  if (!cleaned) return null;
  return truncateGeneratedTitle(cleaned);
}

/** Cancel an in-flight turn (v2 `turn/interrupt`). */
export function interruptTurn(threadId: string, turnId: string): Promise<unknown> {
  return rpcRequest("turn/interrupt", { threadId, turnId });
}

export async function generateThreadTitle(seedMessage: string): Promise<string | null> {
  const selected = getSelectedModel();
  const projectPath = useAppStore.getState().projectPath;
  const start = await rpcRequest<{ thread: { id: string } }>("thread/start", {
    cwd: projectPath ?? undefined,
    model: selected.id,
    modelProvider: selected?.provider,
    ephemeral: true,
  });

  const titleThreadId = start?.thread?.id;
  if (!titleThreadId) return null;

  let generated = "";
  let settled = false;
  let finish: ((value: string) => void) | null = null;
  const result = new Promise<string>((resolve) => {
    finish = (value: string) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
  });

  const stopListening = await onNotification((payload: string) => {
    let msg: { method?: string; params?: Record<string, unknown> };
    try {
      msg = JSON.parse(payload) as { method?: string; params?: Record<string, unknown> };
    } catch {
      return;
    }

    const params = msg.params ?? {};
    if (threadIdFromParams(params) !== titleThreadId) return;

    if (msg.method === "item/agentMessage/delta") {
      const delta = typeof params.delta === "string" ? params.delta : "";
      if (delta) generated += delta;
      return;
    }

    if (msg.method === "item/completed") {
      const item = params.item as Record<string, unknown> | undefined;
      if (item?.type === "agentMessage" && typeof item.text === "string" && item.text.trim()) {
        generated = item.text;
      }
      return;
    }

    if (msg.method === "turn/completed") {
      finish?.(generated);
    }
  }).catch(() => null);

  const timeoutId = window.setTimeout(() => {
    finish?.(generated);
  }, TITLE_GENERATION_TIMEOUT_MS);

  try {
    await rpcRequest("turn/start", {
      threadId: titleThreadId,
      input: [
        {
          type: "text",
          text: `${TITLE_PROMPT}\n\nUser request:\n${seedMessage}`,
          textElements: [],
        },
      ],
      effort: "low",
    });

    return normalizeGeneratedTitle(await result);
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
    if (stopListening) {
      stopListening();
    }
  }
}
