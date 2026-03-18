import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/stores/app-store";
import { useViewStore } from "@/lib/stores/view-store";
import { rpcRequest } from "@/lib/rpc-client";
import { CURATED_MODELS, useSettingsStore, type ModelProviderId } from "@/lib/stores/settings-store";
import { invoke } from "@tauri-apps/api/core";

const NAV_ITEMS = [
  { id: "general", label: "General" },
  { id: "appearance", label: "Appearance" },
  { id: "configuration", label: "Configuration" },
  { id: "personalization", label: "Personalization" },
  { id: "usage", label: "Usage" },
  { id: "mcp", label: "MCP Servers" },
  { id: "git", label: "Git" },
  { id: "environments", label: "Environments" },
  { id: "worktrees", label: "Worktrees" },
  { id: "archived", label: "Archived threads" },
];

interface SettingsViewProps {
  onBack: () => void;
}

export function SettingsView({ onBack }: SettingsViewProps) {
  const [activeSection, setActiveSection] = useState("general");
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const view = useViewStore((s) => s.view);
  const setView = useViewStore((s) => s.setView);

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      {/* Top bar — reserve space for macOS traffic lights */}
      <div
        data-tauri-drag-region
        className="h-11 flex items-center justify-between pl-[92px] pr-5 pt-1.5 shrink-0 select-none border-b border-border-light"
      >
        <div className="flex items-center gap-1">
          <button
            onClick={() => setView("home")}
            className="p-1.5 rounded cursor-pointer text-text-primary hover:opacity-80 hover:bg-bg-secondary transition-all duration-120"
            title="Home"
          >
            <img
              src={view === "home" ? "/house_icon_filled.svg" : "/house_icon.svg"}
              alt=""
              className="h-3 w-3 shrink-0 opacity-85 dark:invert"
            />
          </button>
          <button
            onClick={() => setView("settings")}
            className="p-1.5 rounded cursor-pointer text-text-primary hover:opacity-80 hover:bg-bg-secondary transition-all duration-120"
            title="Settings"
          >
            <img
              src={view === "settings" ? "/gear_filled.svg" : "/gear.svg"}
              alt=""
              className="h-3 w-3 shrink-0 opacity-85 dark:invert"
            />
          </button>
        </div>
      </div>
      <div className="flex flex-1 min-h-0">
        {/* Left sidebar */}
        <div className="w-[200px] shrink-0 border-r border-border-light flex flex-col bg-bg-secondary">
          <div className="px-4 pt-4 pb-3 shrink-0">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-widest text-text-faint hover:text-text-secondary cursor-pointer transition-colors duration-120"
            >
              <span>←</span>
              <span>Back to app</span>
            </button>
          </div>

          <nav className="flex-1 px-2 pb-4 overflow-y-auto">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-md text-[13px] transition-colors duration-120 cursor-pointer",
                  activeSection === item.id
                    ? "bg-bg-card text-text-primary font-medium border border-border-light"
                    : "text-text-secondary hover:text-text-primary hover:bg-bg-card/60",
                )}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-10 py-8 max-w-2xl">
            {activeSection === "general" && (
              <GeneralSection />
            )}
            {activeSection === "appearance" && (
              <AppearanceSection theme={theme} toggleTheme={toggleTheme} />
            )}
            {activeSection === "mcp" && <McpSection />}
            {!["general", "appearance", "mcp"].includes(activeSection) && (
              <PlaceholderSection
                label={NAV_ITEMS.find((n) => n.id === activeSection)?.label ?? ""}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Section components ───────────────────────────────────────────────────── */

function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-[17px] font-semibold text-text-primary tracking-tight">{title}</h2>
      {description && (
        <p className="text-[12.5px] text-text-secondary mt-1 leading-relaxed">{description}</p>
      )}
    </div>
  );
}

function SettingsRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-4 py-4 border-b border-border-light last:border-b-0 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-text-primary">{label}</div>
        {description && (
          <div className="text-[11.5px] text-text-tertiary mt-0.5 leading-relaxed">
            {description}
          </div>
        )}
      </div>
      <div className="w-full sm:w-auto sm:shrink-0">{children}</div>
    </div>
  );
}

function GeneralSection({
}: {}) {
  const openAiApiKey = useSettingsStore((s) => s.openAiApiKey);
  const openRouterApiKey = useSettingsStore((s) => s.openRouterApiKey);
  const azureApiKey = useSettingsStore((s) => s.azureApiKey);
  const azureBaseUrl = useSettingsStore((s) => s.azureBaseUrl);
  const azureDeploymentName = useSettingsStore((s) => s.azureDeploymentName);
  const modelProviderOverrides = useSettingsStore((s) => s.modelProviderOverrides);
  const setModelProviderOverride = useSettingsStore((s) => s.setModelProviderOverride);
  const setOpenAiApiKey = useSettingsStore((s) => s.setOpenAiApiKey);
  const setOpenRouterApiKey = useSettingsStore((s) => s.setOpenRouterApiKey);
  const setAzureApiKey = useSettingsStore((s) => s.setAzureApiKey);
  const setAzureBaseUrl = useSettingsStore((s) => s.setAzureBaseUrl);
  const setAzureDeploymentName = useSettingsStore((s) => s.setAzureDeploymentName);
  const selectedModelId = useSettingsStore((s) => s.selectedModelId);
  const enabledModels = useSettingsStore((s) => s.enabledModels);
  const setSelectedModelId = useSettingsStore((s) => s.setSelectedModelId);
  const setModelEnabled = useSettingsStore((s) => s.setModelEnabled);
  const ensureDefaults = useSettingsStore((s) => s.ensureDefaults);

  const [draftOpenAi, setDraftOpenAi] = useState(openAiApiKey);
  const [draftOpenRouter, setDraftOpenRouter] = useState(openRouterApiKey);
  const [draftAzure, setDraftAzure] = useState(azureApiKey);
  const [draftAzureBaseUrl, setDraftAzureBaseUrl] = useState(azureBaseUrl);
  const [draftAzureDeployment, setDraftAzureDeployment] = useState(azureDeploymentName);
  const [applyStatus, setApplyStatus] = useState<"idle" | "applying" | "applied" | "error">("idle");
  const [applyError, setApplyError] = useState<string | null>(null);

  useEffect(() => {
    ensureDefaults();
  }, [ensureDefaults]);

  useEffect(() => setDraftOpenAi(openAiApiKey), [openAiApiKey]);
  useEffect(() => setDraftOpenRouter(openRouterApiKey), [openRouterApiKey]);
  useEffect(() => setDraftAzure(azureApiKey), [azureApiKey]);
  useEffect(() => setDraftAzureBaseUrl(azureBaseUrl), [azureBaseUrl]);
  useEffect(() => setDraftAzureDeployment(azureDeploymentName), [azureDeploymentName]);

  const hasKeyChanges =
    draftOpenAi !== openAiApiKey ||
    draftOpenRouter !== openRouterApiKey ||
    draftAzure !== azureApiKey ||
    draftAzureBaseUrl !== azureBaseUrl ||
    draftAzureDeployment !== azureDeploymentName;

  const computeAzureDeploymentBaseUrl = () => {
    const base = draftAzureBaseUrl.trim().replace(/\/+$/, "");
    const deployment = draftAzureDeployment.trim();
    if (!base || !deployment) return null;
    if (base.includes("/deployments/")) return base;
    return `${base}/deployments/${encodeURIComponent(deployment)}`;
  };

  const applyKeys = async () => {
    setApplyStatus("applying");
    setApplyError(null);
    try {
      setOpenAiApiKey(draftOpenAi);
      setOpenRouterApiKey(draftOpenRouter);
      setAzureApiKey(draftAzure);
      setAzureBaseUrl(draftAzureBaseUrl);
      setAzureDeploymentName(draftAzureDeployment);

      const azureDeploymentBaseUrl = computeAzureDeploymentBaseUrl();
      if (azureDeploymentBaseUrl) {
        await rpcRequest("config/batchWrite", {
          edits: [
            { keyPath: "model_providers.azure-openai.name", value: "Azure OpenAI", mergeStrategy: "replace" },
            { keyPath: "model_providers.azure-openai.base_url", value: azureDeploymentBaseUrl, mergeStrategy: "replace" },
            { keyPath: "model_providers.azure-openai.env_key", value: "AZURE_OPENAI_API_KEY", mergeStrategy: "replace" },
            { keyPath: "model_providers.azure-openai.wire_api", value: "responses", mergeStrategy: "replace" },
            { keyPath: "model_providers.azure-openai.query_params.api-version", value: "2025-03-01-preview", mergeStrategy: "replace" },
          ],
          reloadUserConfig: true,
        });
      }

      await invoke("codex_set_api_keys", {
        openai_api_key: draftOpenAi,
        openrouter_api_key: draftOpenRouter,
        azure_api_key: draftAzure,
      });
      setApplyStatus("applied");
      window.setTimeout(() => setApplyStatus("idle"), 1200);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e);
      console.error("applyKeys failed", e);
      setApplyError(msg);
      setApplyStatus("error");
      window.setTimeout(() => setApplyStatus("idle"), 2500);
    }
  };

  return (
    <div>
      <SectionHeading title="General" />

      <div className="bg-bg-card border border-border-light rounded-lg overflow-hidden mb-6">
        <div className="px-4 pt-4 pb-3">
          <div className="label-mono">API Keys</div>
        </div>

        <div className="px-4 pb-4">
          <div className="grid gap-3">
            {/* OpenAI */}
            <div className="border border-border-light rounded-lg overflow-hidden bg-bg-secondary/40">
              <div className="px-4 py-3 border-b border-border-light">
                <div className="text-[13px] font-medium text-text-primary">
                  OpenAI
                </div>
                <div className="text-[11.5px] text-text-tertiary mt-0.5 leading-relaxed">
                  Required for using OpenAI as a provider.
                </div>
              </div>
              <div className="divide-y divide-border-light">
                <div className="px-4 py-3 flex items-center justify-between gap-6">
                  <span className="text-[12.5px] text-text-secondary">
                    API key
                  </span>
                  <input
                    type="password"
                    value={draftOpenAi}
                    onChange={(e) => setDraftOpenAi(e.target.value)}
                    placeholder="sk-..."
                    className="w-[280px] max-w-full px-3 py-2 bg-bg-input border border-border rounded-md text-[12.5px] text-text-primary placeholder:text-text-faint outline-none focus:border-border-focus transition-colors duration-120"
                  />
                </div>
              </div>
            </div>

            {/* OpenRouter */}
            <div className="border border-border-light rounded-lg overflow-hidden bg-bg-secondary/40">
              <div className="px-4 py-3 border-b border-border-light">
                <div className="text-[13px] font-medium text-text-primary">
                  OpenRouter
                </div>
                <div className="text-[11.5px] text-text-tertiary mt-0.5 leading-relaxed">
                  Used for models routed through OpenRouter.
                </div>
              </div>
              <div className="divide-y divide-border-light">
                <div className="px-4 py-3 flex items-center justify-between gap-6">
                  <span className="text-[12.5px] text-text-secondary">
                    API key
                  </span>
                  <input
                    type="password"
                    value={draftOpenRouter}
                    onChange={(e) => setDraftOpenRouter(e.target.value)}
                    placeholder="or-..."
                    className="w-[280px] max-w-full px-3 py-2 bg-bg-input border border-border rounded-md text-[12.5px] text-text-primary placeholder:text-text-faint outline-none focus:border-border-focus transition-colors duration-120"
                  />
                </div>
              </div>
            </div>

            {/* Azure OpenAI */}
            <div className="border border-border-light rounded-lg overflow-hidden bg-bg-secondary/40">
              <div className="px-4 py-3 border-b border-border-light">
                <div className="text-[13px] font-medium text-text-primary">
                  Azure OpenAI
                </div>
                <div className="text-[11.5px] text-text-tertiary mt-0.5 leading-relaxed">
                  Configure Azure to use OpenAI models through your Azure account.
                </div>
              </div>
              <div className="divide-y divide-border-light">
                <div className="px-4 py-3 flex items-center justify-between gap-6">
                  <span className="text-[12.5px] text-text-secondary">
                    Base URL
                  </span>
                  <input
                    type="url"
                    value={draftAzureBaseUrl}
                    onChange={(e) => setDraftAzureBaseUrl(e.target.value)}
                    placeholder="https://<resource>.openai.azure.com/openai"
                    className="w-[280px] max-w-full px-3 py-2 bg-bg-input border border-border rounded-md text-[12.5px] text-text-primary placeholder:text-text-faint outline-none focus:border-border-focus transition-colors duration-120"
                  />
                </div>
                <div className="px-4 py-3 flex items-center justify-between gap-6">
                  <span className="text-[12.5px] text-text-secondary">
                    Deployment name
                  </span>
                  <input
                    type="text"
                    value={draftAzureDeployment}
                    onChange={(e) => setDraftAzureDeployment(e.target.value)}
                    placeholder="my-deployment"
                    className="w-[280px] max-w-full px-3 py-2 bg-bg-input border border-border rounded-md text-[12.5px] text-text-primary placeholder:text-text-faint outline-none focus:border-border-focus transition-colors duration-120"
                  />
                </div>
                <div className="px-4 py-3 flex items-center justify-between gap-6">
                  <span className="text-[12.5px] text-text-secondary">
                    API key
                  </span>
                  <input
                    type="password"
                    value={draftAzure}
                    onChange={(e) => setDraftAzure(e.target.value)}
                    placeholder="..."
                    className="w-[280px] max-w-full px-3 py-2 bg-bg-input border border-border rounded-md text-[12.5px] text-text-primary placeholder:text-text-faint outline-none focus:border-border-focus transition-colors duration-120"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-border-light flex items-center justify-between gap-6">
          <div className="text-[11.5px] text-text-tertiary leading-relaxed min-w-0">
            {applyStatus === "applied"
              ? "Applied to Codex."
              : applyStatus === "applying"
                ? "Applying…"
                : applyStatus === "error"
                  ? (applyError ? `Couldn’t apply: ${applyError}` : "Couldn’t apply. Try again.")
                  : "Apply changes."}
          </div>
          <button
            onClick={applyKeys}
            disabled={!hasKeyChanges || applyStatus === "applying"}
            className={cn(
              "px-3 py-1.5 rounded-md text-[11.5px] font-medium transition-colors duration-120 cursor-pointer",
              !hasKeyChanges || applyStatus === "applying"
                ? "bg-bg-secondary text-text-faint border border-border-light cursor-default"
                : "bg-text-primary text-bg-card hover:opacity-90",
            )}
          >
            Apply
          </button>
        </div>
      </div>

      <div className="mb-2">
        <div className="label-mono mb-3">Models</div>
        <div className="bg-bg-card border border-border-light rounded-lg overflow-hidden divide-y divide-border-light">
          {CURATED_MODELS.map((m) => {
            const enabled = enabledModels[m.id];
            const selected = selectedModelId === m.id;
            const providerOverride = modelProviderOverrides?.[m.id];
            const effectiveProvider = providerOverride ?? m.provider;
            const hasAzure = azureDeploymentName.trim().length > 0;
            const canSwitchProviders = m.id.startsWith("gpt-");
            const providerOptions = ([
              { id: "openai", label: "OpenAI", enabled: openAiApiKey.trim().length > 0 },
              { id: "openrouter", label: "OpenRouter", enabled: openRouterApiKey.trim().length > 0 },
              { id: "azure-openai", label: "Azure", enabled: hasAzure },
            ] satisfies Array<{ id: ModelProviderId; label: string; enabled: boolean }>).filter((p) =>
              !canSwitchProviders ? p.id === m.provider : true,
            );
            return (
              <div
                key={m.id}
                className={cn(
                  "px-4 py-3 flex items-center gap-3",
                  enabled ? "cursor-pointer" : "opacity-70",
                )}
                onClick={() => {
                  if (!enabled) setModelEnabled(m.id, true);
                  setSelectedModelId(m.id);
                }}
                role="button"
                tabIndex={0}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-text-primary">
                      {m.name}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {providerOptions.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          disabled={!p.enabled}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!p.enabled) return;
                            setModelProviderOverride(m.id, p.id);
                            if (!enabled) setModelEnabled(m.id, true);
                            setSelectedModelId(m.id);
                          }}
                          className={cn(
                            "font-mono text-[9.5px] uppercase tracking-widest border rounded px-1.5 py-0.5 transition-colors duration-120 cursor-pointer",
                            !p.enabled
                              ? "text-text-faint border-border-light opacity-50 cursor-default"
                              : p.id === effectiveProvider
                                ? "text-text-primary border-border-focus bg-bg-secondary"
                                : "text-text-faint border-border-light hover:bg-bg-secondary",
                          )}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="text-[11px] text-text-tertiary mt-0.5 truncate">
                    {m.description}
                  </div>
                </div>

                {/* Default indicator (circle) sits just left of toggle */}
                <span
                  className={cn(
                    "text-[12px] leading-none",
                    selected ? "text-accent-blue" : "text-transparent",
                  )}
                  aria-hidden
                >
                  ●
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setModelEnabled(m.id, !enabled);
                  }}
                  className={cn(
                    "relative inline-flex h-5 w-9 items-center rounded-full border transition-colors duration-150 shrink-0",
                    enabled
                      ? "bg-[var(--toggle-on)] border-[var(--toggle-on)]"
                      : "bg-bg-secondary border-border",
                  )}
                  aria-label={`${enabled ? "Disable" : "Enable"} ${m.name}`}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 rounded-full bg-[var(--toggle-knob)] shadow-sm transition-transform duration-150",
                      enabled ? "translate-x-[17px]" : "translate-x-[1px]",
                    )}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AppearanceSection({
  theme,
  toggleTheme,
}: {
  theme: string;
  toggleTheme: () => void;
}) {
  return (
    <div>
      <SectionHeading title="Appearance" />
      <div className="bg-bg-card border border-border-light rounded-lg overflow-hidden">
        <SettingsRow label="Theme" description="Switch between light and dark interface">
          <button
            onClick={toggleTheme}
            className={cn(
              "relative inline-flex h-5 w-9 items-center rounded-full border transition-colors duration-150 cursor-pointer",
              theme === "dark"
                ? "bg-[var(--toggle-on)] border-[var(--toggle-on)]"
                : "bg-bg-secondary border-border",
            )}
          >
            <span
              className={cn(
                "inline-block h-4 w-4 rounded-full bg-[var(--toggle-knob)] shadow-sm transition-transform duration-150",
                theme === "dark" ? "translate-x-[17px]" : "translate-x-[1px]",
              )}
            />
          </button>
        </SettingsRow>
      </div>
    </div>
  );
}

interface McpServerEntry {
  name: string;
  tools?: Record<string, unknown>;
  authStatus?: string;
}

type McpTransportType = "stdio" | "streamable_http";

type KvRow = { key: string; value: string };

type McpServerDraft =
  | {
      mode: "create";
      name: string;
      transport: McpTransportType;
      command: string;
      args: string[];
      env: KvRow[];
      envVars: string[];
      cwd: string;
      url: string;
      bearerTokenEnvVar: string;
      httpHeaders: KvRow[];
      envHttpHeaders: KvRow[];
    }
  | {
      mode: "edit";
      name: string;
      transport: McpTransportType;
      command: string;
      args: string[];
      env: KvRow[];
      envVars: string[];
      cwd: string;
      url: string;
      bearerTokenEnvVar: string;
      httpHeaders: KvRow[];
      envHttpHeaders: KvRow[];
    };

function normalizeServerName(raw: string): string {
  return raw.trim();
}

function parseCsvList(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function rowsToRecord(rows: KvRow[]): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const r of rows) {
    const k = r.key.trim();
    if (!k) continue;
    out[k] = r.value ?? "";
  }
  return Object.keys(out).length ? out : undefined;
}

function ensureAtLeastOneRow(rows: KvRow[]): KvRow[] {
  if (rows.length > 0) return rows;
  return [{ key: "", value: "" }];
}

function buildEmptyDraft(mode: "create" | "edit", name = ""): McpServerDraft {
  return {
    mode,
    name,
    transport: "stdio",
    command: "",
    args: [],
    env: [{ key: "", value: "" }],
    envVars: [],
    cwd: "",
    url: "",
    bearerTokenEnvVar: "",
    httpHeaders: [{ key: "", value: "" }],
    envHttpHeaders: [{ key: "", value: "" }],
  };
}

async function readMcpServerConfigFromEffectiveConfig(
  name: string,
): Promise<Partial<McpServerDraft> | null> {
  try {
    const res = await rpcRequest<{ config?: Record<string, unknown> }>(
      "config/read",
      {},
    );
    const cfg = res?.config ?? {};
    const mcpServers = (cfg as Record<string, unknown>)["mcp_servers"];
    if (!mcpServers || typeof mcpServers !== "object") return null;
    const server = (mcpServers as Record<string, unknown>)[name];
    if (!server || typeof server !== "object") return null;

    const obj = server as Record<string, unknown>;
    const hasCommand = typeof obj.command === "string" && obj.command.length > 0;
    const hasUrl = typeof obj.url === "string" && obj.url.length > 0;
    const transport: McpTransportType = hasCommand
      ? "stdio"
      : hasUrl
        ? "streamable_http"
        : "stdio";

    const args = Array.isArray(obj.args)
      ? obj.args.filter((x): x is string => typeof x === "string")
      : [];
    const envObj =
      obj.env && typeof obj.env === "object" ? (obj.env as Record<string, unknown>) : null;
    const env: KvRow[] = envObj
      ? Object.entries(envObj).map(([k, v]) => ({
          key: k,
          value: typeof v === "string" ? v : String(v ?? ""),
        }))
      : [];

    const envVars = Array.isArray(obj.env_vars)
      ? obj.env_vars.filter((x): x is string => typeof x === "string")
      : Array.isArray(obj.envVars)
        ? (obj.envVars as unknown[]).filter((x): x is string => typeof x === "string")
        : [];

    const httpHeadersObj =
      obj.http_headers && typeof obj.http_headers === "object"
        ? (obj.http_headers as Record<string, unknown>)
        : null;
    const envHttpHeadersObj =
      obj.env_http_headers && typeof obj.env_http_headers === "object"
        ? (obj.env_http_headers as Record<string, unknown>)
        : null;

    return {
      transport,
      command: typeof obj.command === "string" ? obj.command : "",
      args,
      env: ensureAtLeastOneRow(env),
      envVars,
      cwd: typeof obj.cwd === "string" ? obj.cwd : "",
      url: typeof obj.url === "string" ? obj.url : "",
      bearerTokenEnvVar:
        typeof obj.bearer_token_env_var === "string" ? obj.bearer_token_env_var : "",
      httpHeaders: ensureAtLeastOneRow(
        httpHeadersObj
          ? Object.entries(httpHeadersObj).map(([k, v]) => ({
              key: k,
              value: typeof v === "string" ? v : String(v ?? ""),
            }))
          : [],
      ),
      envHttpHeaders: ensureAtLeastOneRow(
        envHttpHeadersObj
          ? Object.entries(envHttpHeadersObj).map(([k, v]) => ({
              key: k,
              value: typeof v === "string" ? v : String(v ?? ""),
            }))
          : [],
      ),
    };
  } catch {
    return null;
  }
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-md border border-border-light overflow-hidden bg-bg-secondary">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "px-3 py-1.5 text-[11.5px] font-medium transition-colors duration-120 cursor-pointer",
              active
                ? "bg-bg-card text-text-primary"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function KvEditor({
  rows,
  onChange,
  keyPlaceholder,
  valuePlaceholder,
}: {
  rows: KvRow[];
  onChange: (next: KvRow[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}) {
  const normalized = ensureAtLeastOneRow(rows);
  return (
    <div className="grid gap-2">
      {normalized.map((r, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input
            value={r.key}
            onChange={(e) => {
              const next = normalized.slice();
              next[idx] = { ...next[idx], key: e.target.value };
              onChange(next);
            }}
            placeholder={keyPlaceholder ?? "Key"}
            className="w-[200px] max-w-full px-3 py-2 bg-bg-input border border-border rounded-md text-[12.5px] text-text-primary placeholder:text-text-faint outline-none focus:border-border-focus transition-colors duration-120"
          />
          <input
            value={r.value}
            onChange={(e) => {
              const next = normalized.slice();
              next[idx] = { ...next[idx], value: e.target.value };
              onChange(next);
            }}
            placeholder={valuePlaceholder ?? "Value"}
            className="flex-1 min-w-0 px-3 py-2 bg-bg-input border border-border rounded-md text-[12.5px] text-text-primary placeholder:text-text-faint outline-none focus:border-border-focus transition-colors duration-120"
          />
          <button
            onClick={() => {
              const next = normalized.filter((_, i) => i !== idx);
              onChange(ensureAtLeastOneRow(next));
            }}
            className="shrink-0 px-2 py-1.5 text-[11.5px] font-medium text-text-secondary border border-border rounded hover:border-border-focus hover:text-text-primary transition-all duration-120 cursor-pointer"
            aria-label="Remove row"
          >
            Remove
          </button>
        </div>
      ))}
      <div>
        <button
          onClick={() => onChange([...normalized, { key: "", value: "" }])}
          className="text-[11.5px] text-text-secondary hover:text-text-primary transition-colors duration-120 cursor-pointer"
        >
          + Add
        </button>
      </div>
    </div>
  );
}

function ModalShell({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 glass-backdrop"
        onClick={onClose}
        role="button"
        aria-label="Close"
      />
      <div className="absolute inset-0 flex items-center justify-center p-6">
        <div className="w-full max-w-[720px] rounded-[10px] border border-border-light glass-overlay overflow-hidden">
          <div className="px-5 py-4 border-b border-border-light flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[14px] font-semibold text-text-primary tracking-tight">
                {title}
              </div>
              {description && (
                <div className="text-[11.5px] text-text-tertiary mt-0.5 leading-relaxed">
                  {description}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="shrink-0 px-2 py-1 text-[11.5px] font-medium text-text-secondary border border-border rounded hover:border-border-focus hover:text-text-primary transition-all duration-120 cursor-pointer"
            >
              Close
            </button>
          </div>
          <div className="px-5 py-5 max-h-[70vh] overflow-y-auto">{children}</div>
        </div>
      </div>
    </div>
  );
}

function McpServerModal({
  draft,
  setDraft,
  onClose,
  onSaved,
}: {
  draft: McpServerDraft;
  setDraft: (next: McpServerDraft) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<
    "idle" | "saving" | "saved" | "error" | "removing" | "removed"
  >("idle");

  const isCreate = draft.mode === "create";
  const name = normalizeServerName(draft.name);

  const canSave =
    name.length > 0 &&
    (draft.transport === "stdio"
      ? draft.command.trim().length > 0
      : draft.url.trim().length > 0) &&
    status !== "saving" &&
    status !== "removing";

  const save = async () => {
    if (!canSave) return;
    setStatus("saving");
    try {
      const keyPath = `mcp_servers.${name}`;
      const value =
        draft.transport === "stdio"
          ? {
              command: draft.command.trim(),
              args: draft.args.map((a) => a.trim()).filter(Boolean),
              env: rowsToRecord(draft.env),
              env_vars: draft.envVars.map((v) => v.trim()).filter(Boolean),
              cwd: draft.cwd.trim() || undefined,
            }
          : {
              url: draft.url.trim(),
              bearer_token_env_var: draft.bearerTokenEnvVar.trim() || undefined,
              http_headers: rowsToRecord(draft.httpHeaders),
              env_http_headers: rowsToRecord(draft.envHttpHeaders),
            };

      await rpcRequest("config/batchWrite", {
        edits: [{ keyPath, value, mergeStrategy: "replace" }],
        reloadUserConfig: true,
      });
      await rpcRequest("config/mcpServer/reload", {});
      setStatus("saved");
      window.setTimeout(() => setStatus("idle"), 900);
      onSaved();
      onClose();
    } catch {
      setStatus("error");
      window.setTimeout(() => setStatus("idle"), 1800);
    }
  };

  const remove = async () => {
    if (isCreate || !name) return;
    setStatus("removing");
    try {
      await rpcRequest("config/batchWrite", {
        edits: [{ keyPath: `mcp_servers.${name}`, value: null, mergeStrategy: "replace" }],
        reloadUserConfig: true,
      });
      await rpcRequest("config/mcpServer/reload", {});
      setStatus("removed");
      window.setTimeout(() => setStatus("idle"), 900);
      onSaved();
      onClose();
    } catch {
      setStatus("error");
      window.setTimeout(() => setStatus("idle"), 1800);
    }
  };

  return (
    <ModalShell
      title={isCreate ? "Add MCP server" : `Update ${name}`}
      description={
        isCreate
          ? "Add a custom MCP server to your Codex configuration."
          : "Edits are written to your user config.toml and applied after reload."
      }
      onClose={onClose}
    >
      <div className="grid gap-5">
        <div className="bg-bg-card border border-border-light rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border-light flex items-center justify-between gap-4">
            <div className="label-mono">Basics</div>
            <Segmented
              value={draft.transport}
              onChange={(v) =>
                setDraft({
                  ...draft,
                  transport: v === "streamable_http" ? "streamable_http" : "stdio",
                })
              }
              options={[
                { value: "stdio", label: "STDIO" },
                { value: "streamable_http", label: "Streamable HTTP" },
              ]}
            />
          </div>

          <div className="divide-y divide-border-light">
            <div className="px-4 py-3 flex items-center justify-between gap-6">
              <span className="text-[12.5px] text-text-secondary">Name</span>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                disabled={!isCreate}
                placeholder="MCP server name"
                className={cn(
                  "w-[360px] max-w-full px-3 py-2 bg-bg-input border border-border rounded-md text-[12.5px] text-text-primary placeholder:text-text-faint outline-none focus:border-border-focus transition-colors duration-120",
                  !isCreate && "opacity-70 cursor-default",
                )}
              />
            </div>

            {draft.transport === "stdio" ? (
              <>
                <div className="px-4 py-3 flex items-center justify-between gap-6">
                  <span className="text-[12.5px] text-text-secondary">Command to launch</span>
                  <input
                    value={draft.command}
                    onChange={(e) => setDraft({ ...draft, command: e.target.value })}
                    placeholder="openai-dev-mcp serve-sqlite"
                    className="w-[360px] max-w-full px-3 py-2 bg-bg-input border border-border rounded-md text-[12.5px] text-text-primary placeholder:text-text-faint outline-none focus:border-border-focus transition-colors duration-120"
                  />
                </div>
                <div className="px-4 py-3 flex items-center justify-between gap-6">
                  <span className="text-[12.5px] text-text-secondary">Arguments</span>
                  <input
                    value={draft.args.join(", ")}
                    onChange={(e) =>
                      setDraft({ ...draft, args: parseCsvList(e.target.value) })
                    }
                    placeholder="comma-separated"
                    className="w-[360px] max-w-full px-3 py-2 bg-bg-input border border-border rounded-md text-[12.5px] text-text-primary placeholder:text-text-faint outline-none focus:border-border-focus transition-colors duration-120"
                  />
                </div>
                <div className="px-4 py-3">
                  <div className="text-[12.5px] text-text-secondary mb-2">
                    Environment variables
                  </div>
                  <KvEditor
                    rows={draft.env}
                    onChange={(env) => setDraft({ ...draft, env })}
                  />
                </div>
                <div className="px-4 py-3 flex items-center justify-between gap-6">
                  <span className="text-[12.5px] text-text-secondary">
                    Environment variable passthrough
                  </span>
                  <input
                    value={draft.envVars.join(", ")}
                    onChange={(e) =>
                      setDraft({ ...draft, envVars: parseCsvList(e.target.value) })
                    }
                    placeholder="comma-separated env var names"
                    className="w-[360px] max-w-full px-3 py-2 bg-bg-input border border-border rounded-md text-[12.5px] text-text-primary placeholder:text-text-faint outline-none focus:border-border-focus transition-colors duration-120"
                  />
                </div>
                <div className="px-4 py-3 flex items-center justify-between gap-6">
                  <span className="text-[12.5px] text-text-secondary">Working directory</span>
                  <input
                    value={draft.cwd}
                    onChange={(e) => setDraft({ ...draft, cwd: e.target.value })}
                    placeholder="~/code"
                    className="w-[360px] max-w-full px-3 py-2 bg-bg-input border border-border rounded-md text-[12.5px] text-text-primary placeholder:text-text-faint outline-none focus:border-border-focus transition-colors duration-120"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="px-4 py-3 flex items-center justify-between gap-6">
                  <span className="text-[12.5px] text-text-secondary">URL</span>
                  <input
                    value={draft.url}
                    onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                    placeholder="http://localhost:8080/mcp"
                    className="w-[360px] max-w-full px-3 py-2 bg-bg-input border border-border rounded-md text-[12.5px] text-text-primary placeholder:text-text-faint outline-none focus:border-border-focus transition-colors duration-120"
                  />
                </div>
                <div className="px-4 py-3 flex items-center justify-between gap-6">
                  <span className="text-[12.5px] text-text-secondary">
                    Bearer token env var
                  </span>
                  <input
                    value={draft.bearerTokenEnvVar}
                    onChange={(e) =>
                      setDraft({ ...draft, bearerTokenEnvVar: e.target.value })
                    }
                    placeholder="MCP_BEARER_TOKEN"
                    className="w-[360px] max-w-full px-3 py-2 bg-bg-input border border-border rounded-md text-[12.5px] text-text-primary placeholder:text-text-faint outline-none focus:border-border-focus transition-colors duration-120"
                  />
                </div>
                <div className="px-4 py-3">
                  <div className="text-[12.5px] text-text-secondary mb-2">Headers</div>
                  <KvEditor
                    rows={draft.httpHeaders}
                    onChange={(httpHeaders) => setDraft({ ...draft, httpHeaders })}
                  />
                </div>
                <div className="px-4 py-3">
                  <div className="text-[12.5px] text-text-secondary mb-2">
                    Headers from environment variables
                  </div>
                  <KvEditor
                    rows={draft.envHttpHeaders}
                    onChange={(envHttpHeaders) => setDraft({ ...draft, envHttpHeaders })}
                    keyPlaceholder="Header"
                    valuePlaceholder="ENV_VAR_NAME"
                  />
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="text-[11.5px] text-text-tertiary leading-relaxed">
            {status === "saving"
              ? "Saving…"
              : status === "saved"
                ? "Saved."
                : status === "removing"
                  ? "Removing…"
                  : status === "removed"
                    ? "Removed."
                    : status === "error"
                      ? "Couldn’t apply. Try again."
                      : isCreate
                        ? "Writes to your user config.toml."
                        : "Edits apply after reload."}
          </div>
          <div className="flex items-center gap-2">
            {!isCreate && (
              <button
                onClick={remove}
                disabled={status === "saving" || status === "removing"}
                className={cn(
                  "px-3 py-1.5 rounded-md text-[11.5px] font-medium transition-colors duration-120 cursor-pointer border",
                  status === "saving" || status === "removing"
                    ? "bg-bg-secondary text-text-faint border-border-light cursor-default"
                    : "bg-bg-card text-accent-red border-border hover:border-border-focus",
                )}
              >
                Uninstall
              </button>
            )}
            <button
              onClick={save}
              disabled={!canSave}
              className={cn(
                "px-3 py-1.5 rounded-md text-[11.5px] font-medium transition-colors duration-120 cursor-pointer",
                !canSave
                  ? "bg-bg-secondary text-text-faint border border-border-light cursor-default"
                  : "bg-text-primary text-bg-card hover:opacity-90",
              )}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

function McpSection() {
  const [servers, setServers] = useState<McpServerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalDraft, setModalDraft] = useState<McpServerDraft | null>(null);

  const refresh = () => {
    setLoading(true);
    rpcRequest<{ data?: McpServerEntry[] }>("mcpServerStatus/list", {})
      .then((res) => {
        if (Array.isArray(res?.data)) setServers(res.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div>
      <SectionHeading
        title="MCP Servers"
        description="Connect external tools and data sources."
      />

      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="label-mono">Custom servers</span>
          <button
            onClick={() => setModalDraft(buildEmptyDraft("create"))}
            className="text-[11.5px] text-text-secondary hover:text-text-primary transition-colors duration-120 cursor-pointer"
          >
            + Add server
          </button>
        </div>
        <div className="bg-bg-card border border-border-light rounded-lg overflow-hidden">
          {loading ? (
            <div className="px-4 py-3 text-[12px] text-text-faint">
              Loading…
            </div>
          ) : servers.length === 0 ? (
            <div className="px-4 py-3 text-[12px] text-text-faint">
              No MCP servers configured.
            </div>
          ) : (
            servers.map((server) => (
              <div
                key={server.name}
                className="px-4 py-3 flex items-center justify-between border-t border-border-light first:border-t-0 cursor-pointer"
                onClick={async () => {
                  const name = server.name;
                  const base = buildEmptyDraft("edit", name);
                  setModalDraft(base);
                  const loaded = await readMcpServerConfigFromEffectiveConfig(name);
                  if (loaded) setModalDraft({ ...base, ...loaded, mode: "edit", name });
                }}
                role="button"
                tabIndex={0}
              >
                <span className="text-[13px] text-text-primary">{server.name}</span>
                <span className="font-mono text-[10px] text-text-faint">
                  {server.authStatus ?? "—"}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {modalDraft && (
        <McpServerModal
          draft={modalDraft}
          setDraft={(next) => setModalDraft(next)}
          onClose={() => setModalDraft(null)}
          onSaved={() => refresh()}
        />
      )}
    </div>
  );
}

function PlaceholderSection({ label }: { label: string }) {
  return (
    <div>
      <SectionHeading title={label} />
      <div className="px-4 py-8 rounded-lg border border-dashed border-border-light text-center">
        <div className="text-[12.5px] text-text-faint">No settings configured</div>
      </div>
    </div>
  );
}
