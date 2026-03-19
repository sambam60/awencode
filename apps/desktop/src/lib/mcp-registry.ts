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

export type RegistryListResponse = {
  servers?: Array<{ server?: RegistryServer }>;
  metadata?: { next_cursor?: string | null };
};

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
  return (await res.json()) as RegistryListResponse;
}

/** Safe TOML key segment for mcp_servers.<name> */
export function slugifyMcpServerName(registryName: string): string {
  const base = registryName.trim().replace(/[^a-zA-Z0-9._-]+/g, "_");
  return base.length > 0 ? base : "registry_server";
}
