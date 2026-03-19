const REGISTRY_BASE = "https://registry.modelcontextprotocol.io/v0.1";

export type RegistryRemote = {
  type?: string;
  url?: string;
};

export type RegistryPackage = {
  registryType?: string;
  identifier?: string;
  version?: string;
  transport?: { type?: string };
  environmentVariables?: Array<{ name?: string; description?: string; isRequired?: boolean }>;
};

export type RegistryServer = {
  name: string;
  description?: string;
  title?: string;
  version?: string;
  remotes?: RegistryRemote[];
  packages?: RegistryPackage[];
};

type RegistryOfficialMeta = {
  updatedAt?: string;
  publishedAt?: string;
};

export type RegistryListItem = {
  server?: RegistryServer;
  _meta?: {
    "io.modelcontextprotocol.registry/official"?: RegistryOfficialMeta;
  };
};

export type RegistryListResponse = {
  servers?: RegistryListItem[];
  metadata?: { next_cursor?: string | null; nextCursor?: string | null; count?: number };
};

function registryItemRecencyMs(item: RegistryListItem): number {
  const o = item._meta?.["io.modelcontextprotocol.registry/official"];
  const iso = o?.updatedAt ?? o?.publishedAt;
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Default registry ordering is alphabetical. With no search query, re-order by
 * official registry timestamps (updated → published) so the preview shows
 * active / recently touched servers first — closest signal the public API exposes
 * to “popular” without a dedicated ranking field.
 */
function sortRegistryItemsByRecency(items: RegistryListItem[]): RegistryListItem[] {
  return [...items].sort((a, b) => registryItemRecencyMs(b) - registryItemRecencyMs(a));
}

/** The registry can return multiple rows per `server.name` (e.g. version rows). */
function dedupeRegistryItemsByName(items: RegistryListItem[]): RegistryListItem[] {
  const seen = new Set<string>();
  const out: RegistryListItem[] = [];
  for (const item of items) {
    const name = item.server?.name?.trim();
    if (!name) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(item);
  }
  return out;
}

export async function searchMcpRegistry(
  query: string,
  opts?: { limit?: number; cursor?: string },
): Promise<RegistryListResponse> {
  const limit = opts?.limit ?? 24;
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  const q = query.trim();
  if (q) params.set("search", q);
  if (opts?.cursor) params.set("cursor", opts.cursor);

  const res = await fetch(`${REGISTRY_BASE}/servers?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Registry request failed (${res.status})`);
  }
  const data = (await res.json()) as RegistryListResponse;
  const raw = data.servers ?? [];
  const ordered = q ? raw : sortRegistryItemsByRecency(raw);
  const servers = dedupeRegistryItemsByName(ordered);
  return { ...data, servers };
}

/**
 * Single segment under `[mcp_servers]`. Codex `config/batchWrite` splits `keyPath` on `.`,
 * so dots/slashes in the name must not appear — e.g. `ai.linear/mcp` would become
 * `mcp_servers.ai` + `linear/mcp` and fail validation.
 */
export function mcpServerTomlKey(raw: string): string {
  const s = raw
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return s.length > 0 ? s : "registry_server";
}
