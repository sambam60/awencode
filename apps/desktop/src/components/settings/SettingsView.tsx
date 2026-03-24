import {
  useState,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useCallback,
  type ComponentType,
} from "react";
import { useThreadStore } from "@/lib/stores/thread-store";
import { getThemePortalContainer } from "@/lib/theme-root";
import { createPortal } from "react-dom";
import {
  Archive,
  BarChart2,
  Box,
  Bot,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  Layers,
  Laptop,
  Loader2,
  Moon,
  Palette,
  Plug,
  Search,
  SlidersHorizontal,
  Sun,
  X,
  type LucideProps,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore, type ThemePreference } from "@/lib/stores/app-store";
import { useViewStore } from "@/lib/stores/view-store";
import { onNotification, rpcRequest } from "@/lib/rpc-client";
import {
  hasOpenAiAccountAuth,
  readOpenAiAccount,
  type OpenAiAccountState,
} from "@/lib/openai-auth";
import {
  CURATED_MODELS,
  buildAzureDeploymentModels as buildAzureModels,
  isGptFamilyModelId,
  useSettingsStore,
  type ModelProviderId,
} from "@/lib/stores/settings-store";
import { invoke } from "@tauri-apps/api/core";
import { searchMcpRegistry, mcpServerTomlKey, type RegistryServer } from "@/lib/mcp-registry";
type NavIcon = ComponentType<LucideProps>;

/** MCP mark from public asset geometry; inline so strokes use `currentColor` like Lucide. */
function McpNavMark({ className }: LucideProps) {
  const clipPathId = `mcp_nav_clip_${useId().replace(/:/g, "_")}`;
  return (
    <svg
      className={className}
      viewBox="0 0 180 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <g clipPath={`url(#${clipPathId})`}>
        <path
          d="M18 84.8528L85.8822 16.9706C95.2548 7.59798 110.451 7.59798 119.823 16.9706V16.9706C129.196 26.3431 129.196 41.5391 119.823 50.9117L68.5581 102.177"
          stroke="currentColor"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          d="M69.2652 101.47L119.823 50.9117C129.196 41.5391 144.392 41.5391 153.765 50.9117L154.118 51.2652C163.491 60.6378 163.491 75.8338 154.118 85.2063L92.7248 146.6C89.6006 149.724 89.6006 154.789 92.7248 157.913L105.331 170.52"
          stroke="currentColor"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          d="M102.853 33.9411L52.6482 84.1457C43.2756 93.5183 43.2756 108.714 52.6482 118.087V118.087C62.0208 127.459 77.2167 127.459 86.5893 118.087L136.794 67.8822"
          stroke="currentColor"
          strokeWidth="12"
          strokeLinecap="round"
        />
      </g>
      <defs>
        <clipPath id={clipPathId}>
          <rect width="180" height="180" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

const NAV_ITEMS: Array<{
  id: string;
  label: string;
  icon: NavIcon;
}> = [
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "agent", label: "Agent", icon: Bot },
  { id: "usage", label: "Usage", icon: BarChart2 },
  { id: "mcp", label: "MCP Servers", icon: McpNavMark },
  { id: "git", label: "Git", icon: GitBranch },
  { id: "environments", label: "Environments", icon: Layers },
  { id: "worktrees", label: "Worktrees", icon: Box },
  { id: "archived", label: "Archived threads", icon: Archive },
];

interface SettingsViewProps {
  onBack: () => void;
}

export function SettingsView({ onBack }: SettingsViewProps) {
  const [activeSection, setActiveSection] = useState("general");
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const view = useViewStore((s) => s.view);
  const setView = useViewStore((s) => s.setView);
  const clearWorkspace = useAppStore((s) => s.clearWorkspace);

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      {/* Top bar — reserve space for macOS traffic lights */}
      <div
        data-tauri-drag-region
        className="h-11 flex items-center justify-between pl-[92px] pr-5 pt-1.5 pb-0.5 shrink-0 select-none border-b border-border-light"
      >
        <div className="flex h-7 items-center gap-1.5">
          <button
            onClick={() => {
              clearWorkspace();
              setView("home");
            }}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded cursor-pointer text-text-primary dark:text-text-primary hover:opacity-80 hover:bg-bg-secondary transition-all duration-120"
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
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded cursor-pointer text-text-primary dark:text-text-primary hover:opacity-80 hover:bg-bg-secondary transition-all duration-120"
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
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 text-left px-3 py-2 rounded-md text-[13px] transition-colors duration-120 cursor-pointer",
                    activeSection === item.id
                      ? "bg-bg-card text-text-primary font-medium border border-border-light"
                      : "text-text-secondary hover:text-text-primary hover:bg-bg-card/60",
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" strokeWidth={1.75} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto flex justify-center">
          <div className="w-full max-w-3xl xl:max-w-[52rem] px-10 py-8">
            {activeSection === "general" && (
              <GeneralSection />
            )}
            {activeSection === "integrations" && <IntegrationsSection />}
            {activeSection === "appearance" && (
              <AppearanceSection theme={theme} setTheme={setTheme} />
            )}
            {activeSection === "agent" && <AgentSection />}
            {activeSection === "mcp" && <McpSection />}
            {activeSection === "archived" && <ArchivedThreadsSection />}
            {!["general", "integrations", "appearance", "agent", "mcp", "archived"].includes(activeSection) && (
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
  icon,
  children,
  layout = "default",
}: {
  label: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  /** `stacked`: label/description on top, control full width below (e.g. textarea). */
  layout?: "default" | "stacked";
}) {
  const stacked = layout === "stacked";
  return (
    <div
      className={cn(
        "px-4 py-4 border-b border-border-light last:border-b-0 flex flex-col gap-3",
        !stacked && "sm:flex-row sm:items-start sm:justify-between sm:gap-8",
        stacked && "gap-4",
      )}
    >
      <div className={cn("flex gap-3", !stacked && "flex-1 min-w-0", stacked && "w-full")}>
        {icon ? <div className="shrink-0 pt-0.5 text-text-tertiary">{icon}</div> : null}
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-text-primary">{label}</div>
          {description && (
            <div className="text-[11.5px] text-text-tertiary mt-0.5 leading-relaxed">
              {description}
            </div>
          )}
        </div>
      </div>
      <div
        className={cn(
          "w-full",
          !stacked && "sm:w-auto sm:shrink-0 sm:max-w-[min(100%,380px)]",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function SettingsChoiceField<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { value: T; label: string; description: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuBox, setMenuBox] = useState<{
    left: number;
    width: number;
    maxHeight: number;
    top?: number;
    bottom?: number;
  } | null>(null);
  const selected = options.find((o) => o.value === value) ?? options[0];

  useLayoutEffect(() => {
    if (!open) {
      setMenuBox(null);
      return;
    }
    const update = () => {
      const el = wrapRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const viewportPadding = 8;
      const gap = 4;
      const preferredMax = 280;
      const preferredMin = 72;
      const spaceBelow = window.innerHeight - rect.bottom - gap - viewportPadding;
      const spaceAbove = rect.top - gap - viewportPadding;
      const openBelow = spaceBelow >= preferredMin || spaceBelow >= spaceAbove;
      const available = Math.max(0, openBelow ? spaceBelow : spaceAbove);
      const maxHeight = Math.min(preferredMax, available);
      const left = Math.max(
        viewportPadding,
        Math.min(rect.left, window.innerWidth - rect.width - viewportPadding),
      );
      if (openBelow) {
        setMenuBox({
          left,
          width: rect.width,
          maxHeight,
          top: rect.bottom + gap,
        });
      } else {
        setMenuBox({
          left,
          width: rect.width,
          maxHeight,
          bottom: window.innerHeight - rect.top + gap,
        });
      }
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const menu =
    open &&
    menuBox &&
    createPortal(
      <div
        ref={menuRef}
        className="fixed z-[100] rounded-lg border border-border-light glass-overlay shadow-level-2 py-1 overflow-y-auto overscroll-contain text-text-primary"
        style={{
          left: menuBox.left,
          width: menuBox.width,
          maxHeight: menuBox.maxHeight,
          ...(menuBox.top !== undefined
            ? { top: menuBox.top }
            : { bottom: menuBox.bottom }),
        }}
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => {
              onChange(o.value);
              setOpen(false);
            }}
            className={cn(
              "w-full text-left px-3 py-2.5 flex items-start justify-between gap-2 transition-colors duration-120 cursor-pointer glass-menu-row",
              o.value === value && "glass-menu-row-active",
            )}
          >
            <div className="min-w-0">
              <div className="text-[12.5px] font-medium text-text-primary">{o.label}</div>
              <div className="text-[11px] text-text-tertiary mt-0.5 leading-snug">
                {o.description}
              </div>
            </div>
            {o.value === value ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-text-primary mt-0.5" />
            ) : (
              <span className="w-3.5 shrink-0" />
            )}
          </button>
        ))}
      </div>,
      getThemePortalContainer(),
    );

  return (
    <>
      <div className="relative w-full" ref={wrapRef}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "w-full text-left px-3 py-2.5 rounded-md border border-border-light bg-bg-secondary/60 hover:bg-bg-secondary transition-colors duration-120 flex items-start justify-between gap-3 cursor-pointer disabled:opacity-50",
          )}
        >
          <div className="min-w-0">
            <div className="text-[12.5px] font-medium text-text-primary">{selected.label}</div>
            <div className="text-[11px] text-text-tertiary mt-0.5 leading-snug">
              {selected.description}
            </div>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-text-faint mt-0.5" />
        </button>
      </div>
      {menu}
    </>
  );
}

type ApiKeyStatuses = {
  openaiConfigured: boolean;
  openrouterConfigured: boolean;
  azureConfigured: boolean;
};

const EMPTY_API_KEY_STATUSES: ApiKeyStatuses = {
  openaiConfigured: false,
  openrouterConfigured: false,
  azureConfigured: false,
};

const EMPTY_OPENAI_ACCOUNT_STATE: OpenAiAccountState = {
  account: null,
  requiresOpenaiAuth: true,
};

function formatPlanType(planType?: string | null): string | null {
  const trimmed = planType?.trim();
  if (!trimmed) return null;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

type GitHubConnectedUser = {
  login: string;
  name?: string | null;
  avatarUrl?: string | null;
};

type GitHubDeviceFlowStartResult = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number;
  expiresIn: number;
};

type GitHubDeviceFlowPollResult =
  | { status: "pending"; interval: number; message?: string | null }
  | { status: "complete"; user: GitHubConnectedUser }
  | { status: "error"; message: string };

type LinearConnectedUser = {
  id: string;
  name: string;
  email?: string | null;
};

type LinearOauthStartResult = {
  requestId: string;
  authUrl: string;
};

type LinearOauthStatusResult =
  | { status: "pending"; message?: string | null }
  | { status: "complete"; user: LinearConnectedUser }
  | { status: "error"; message: string };

function IntegrationCard({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border-light rounded-lg overflow-hidden bg-bg-card">
      <div className="px-4 py-3 border-b border-border-light flex items-start gap-3">
        <div className="mt-0.5 shrink-0 text-text-tertiary">{icon}</div>
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-text-primary">{title}</div>
          <div className="mt-0.5 text-[11.5px] text-text-tertiary leading-relaxed">
            {description}
          </div>
        </div>
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

function IntegrationActionButton({
  label,
  onClick,
  disabled,
  loading = false,
  variant = "secondary",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "secondary";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11.5px] transition-colors duration-120 cursor-pointer disabled:opacity-50 disabled:cursor-default",
        variant === "primary"
          ? "bg-text-primary text-bg-card hover:opacity-90"
          : "border border-border-default text-text-secondary hover:bg-bg-secondary",
      )}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      <span>{label}</span>
    </button>
  );
}

function GeneralSection({
}: {}) {
  const azureBaseUrl = useSettingsStore((s) => s.azureBaseUrl);
  const azureDeployments = useSettingsStore((s) => s.azureDeployments);
  const modelProviderOverrides = useSettingsStore((s) => s.modelProviderOverrides);
  const setModelProviderOverride = useSettingsStore((s) => s.setModelProviderOverride);
  const setAzureBaseUrl = useSettingsStore((s) => s.setAzureBaseUrl);
  const addAzureDeployment = useSettingsStore((s) => s.addAzureDeployment);
  const removeAzureDeployment = useSettingsStore((s) => s.removeAzureDeployment);
  const selectedModelId = useSettingsStore((s) => s.selectedModelId);
  const enabledModels = useSettingsStore((s) => s.enabledModels);
  const setSelectedModelId = useSettingsStore((s) => s.setSelectedModelId);
  const setModelEnabled = useSettingsStore((s) => s.setModelEnabled);
  const ensureDefaults = useSettingsStore((s) => s.ensureDefaults);

  const [storedKeyStatus, setStoredKeyStatus] = useState<ApiKeyStatuses>(EMPTY_API_KEY_STATUSES);
  const [draftOpenAi, setDraftOpenAi] = useState("");
  const [draftOpenRouter, setDraftOpenRouter] = useState("");
  const [draftAzure, setDraftAzure] = useState("");
  const [removeOpenAi, setRemoveOpenAi] = useState(false);
  const [removeOpenRouter, setRemoveOpenRouter] = useState(false);
  const [removeAzure, setRemoveAzure] = useState(false);
  const [draftAzureBaseUrl, setDraftAzureBaseUrl] = useState(azureBaseUrl);
  const [draftAzureDeployment, setDraftAzureDeployment] = useState("");
  const [azureDeploymentStatus, setAzureDeploymentStatus] = useState<string | null>(null);
  const [applyStatus, setApplyStatus] = useState<"idle" | "applying" | "applied" | "error">("idle");
  const [applyError, setApplyError] = useState<string | null>(null);
  const [openAiAccountState, setOpenAiAccountState] = useState<OpenAiAccountState>(
    EMPTY_OPENAI_ACCOUNT_STATE,
  );
  const refreshApiKeyStatus = useCallback(async () => {
    const nextStatus = await invoke<ApiKeyStatuses>("api_key_statuses");
    setStoredKeyStatus(nextStatus);
  }, []);
  const refreshOpenAiAccount = useCallback(async () => {
    const nextAccount = await readOpenAiAccount(false);
    setOpenAiAccountState(nextAccount);
  }, []);

  useEffect(() => {
    ensureDefaults();
  }, [ensureDefaults]);

  useEffect(() => {
    refreshApiKeyStatus().catch((error) => {
      console.error("api_key_statuses failed", error);
    });
  }, [refreshApiKeyStatus]);

  useEffect(() => {
    refreshOpenAiAccount().catch((error) => {
      console.error("account/read failed", error);
    });
  }, [refreshOpenAiAccount]);

  const hasKeyChanges =
    draftOpenAi.trim().length > 0 ||
    draftOpenRouter.trim().length > 0 ||
    draftAzure.trim().length > 0 ||
    removeOpenAi ||
    removeOpenRouter ||
    removeAzure ||
    draftAzureBaseUrl !== azureBaseUrl;

  const hasOpenAiKey = (storedKeyStatus.openaiConfigured && !removeOpenAi) || draftOpenAi.trim().length > 0;
  const hasOpenRouterKey =
    (storedKeyStatus.openrouterConfigured && !removeOpenRouter) || draftOpenRouter.trim().length > 0;
  const hasOpenAiAuth = hasOpenAiAccountAuth(openAiAccountState) || hasOpenAiKey;
  const azureDeploymentModels = buildAzureModels(azureDeployments);

  const computeAzureResponsesBaseUrl = () => {
    // Azure Responses API expects the model/deployment name in the request body (field: `model`),
    // and does not require `/deployments/<deployment>` to be embedded in the URL path.
    //
    // We normalize a few common user inputs:
    // - `https://<resource>.openai.azure.com` -> `.../openai/v1`
    // - `.../openai` -> `.../openai/v1`
    // - `.../openai/deployments/<deployment>` -> `.../openai/v1`
    const raw = draftAzureBaseUrl.trim().replace(/\/+$/, "");
    if (!raw) return null;

    const baseLower = raw.toLowerCase();

    // If user pasted the deployment-specific path, strip it back to the resource's /openai prefix.
    const deploymentPathMarker = "/openai/deployments/";
    if (baseLower.includes(deploymentPathMarker)) {
      const prefix = raw.slice(0, baseLower.indexOf(deploymentPathMarker)).replace(/\/+$/, "");
      return `${prefix}/v1`;
    }

    if (!baseLower.includes("/openai")) {
      return `${raw}/openai/v1`;
    }

    if (baseLower.endsWith("/openai")) {
      return `${raw}/v1`;
    }

    // If already using /openai/v1, keep it.
    if (baseLower.endsWith("/openai/v1")) return raw;
    if (baseLower.includes("/openai/v1/")) return raw;

    // Fall back to whatever user provided; the request will 404 if it doesn't match Azure's expectations.
    return raw;
  };

  const applyKeys = async () => {
    setApplyStatus("applying");
    setApplyError(null);
    try {
      setAzureBaseUrl(draftAzureBaseUrl);

      const azureResponsesBaseUrl = computeAzureResponsesBaseUrl();
      if (azureResponsesBaseUrl) {
        await rpcRequest("config/batchWrite", {
          edits: [
            {
              keyPath: "model_providers.azure-openai-custom.name",
              value: "Azure OpenAI (Custom)",
              mergeStrategy: "replace",
            },
            {
              keyPath: "model_providers.azure-openai-custom.base_url",
              value: azureResponsesBaseUrl,
              mergeStrategy: "replace",
            },
            {
              keyPath: "model_providers.azure-openai-custom.env_key",
              value: "AZURE_OPENAI_API_KEY",
              mergeStrategy: "replace",
            },
            {
              keyPath: "model_providers.azure-openai-custom.wire_api",
              value: "responses",
              mergeStrategy: "replace",
            },
            {
              keyPath: "model_providers.azure-openai-custom.query_params.api-version",
              value: "preview",
              mergeStrategy: "replace",
            },
          ],
          reloadUserConfig: true,
        });
      }

      await invoke("codex_set_api_keys", {
        openaiApiKey: removeOpenAi ? "" : (draftOpenAi.trim() ? draftOpenAi : null),
        openrouterApiKey: removeOpenRouter ? "" : (draftOpenRouter.trim() ? draftOpenRouter : null),
        azureApiKey: removeAzure ? "" : (draftAzure.trim() ? draftAzure : null),
      });
      setDraftOpenAi("");
      setDraftOpenRouter("");
      setDraftAzure("");
      setRemoveOpenAi(false);
      setRemoveOpenRouter(false);
      setRemoveAzure(false);
      await refreshApiKeyStatus();
      await refreshOpenAiAccount();
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

  const submitAzureDeployment = () => {
    const nextDeployment = draftAzureDeployment.trim();
    if (!nextDeployment) {
      setAzureDeploymentStatus("Enter a deployment name, then press Enter.");
      return;
    }
    const added = addAzureDeployment(nextDeployment);
    if (!added) {
      setAzureDeploymentStatus("That deployment is already in your model list.");
      return;
    }
    setDraftAzureDeployment("");
    setAzureDeploymentStatus(`Added ${nextDeployment}.`);
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
                  Save an API key for OpenAI-hosted models. ChatGPT sign-in lives in Integrations.
                </div>
              </div>
              <div className="divide-y divide-border-light">
                <div className="px-4 py-3 flex items-center justify-between gap-6">
                  <span className="text-[12.5px] text-text-secondary">
                    API key
                  </span>
                  <div className="w-[280px] max-w-full flex flex-col items-end gap-1.5">
                    <div className="w-full flex items-center gap-2">
                      <input
                        type="password"
                        value={draftOpenAi}
                        onChange={(e) => {
                          setDraftOpenAi(e.target.value);
                          setRemoveOpenAi(false);
                        }}
                        placeholder={storedKeyStatus.openaiConfigured && !removeOpenAi ? "Stored securely" : "sk-..."}
                        className="flex-1 min-w-0 px-3 py-2 bg-bg-input border border-border rounded-md text-[12.5px] text-text-primary placeholder:text-text-faint outline-none focus:border-border-focus transition-colors duration-120"
                      />
                      {storedKeyStatus.openaiConfigured && !removeOpenAi && (
                        <button
                          type="button"
                          onClick={() => {
                            setDraftOpenAi("");
                            setRemoveOpenAi(true);
                          }}
                          className="px-2.5 py-2 text-[10.5px] text-text-secondary border border-border-light rounded-md hover:bg-bg-secondary transition-colors duration-120 cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="w-full text-[10.5px] text-text-tertiary text-right">
                      {removeOpenAi
                        ? "Stored key will be removed when you apply."
                        : draftOpenAi.trim().length > 0
                          ? "New key ready to save securely."
                          : storedKeyStatus.openaiConfigured
                            ? "Stored securely in your OS keychain."
                            : "Not set."}
                    </div>
                  </div>
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
                  <div className="w-[280px] max-w-full flex flex-col items-end gap-1.5">
                    <div className="w-full flex items-center gap-2">
                      <input
                        type="password"
                        value={draftOpenRouter}
                        onChange={(e) => {
                          setDraftOpenRouter(e.target.value);
                          setRemoveOpenRouter(false);
                        }}
                        placeholder={storedKeyStatus.openrouterConfigured && !removeOpenRouter ? "Stored securely" : "or-..."}
                        className="flex-1 min-w-0 px-3 py-2 bg-bg-input border border-border rounded-md text-[12.5px] text-text-primary placeholder:text-text-faint outline-none focus:border-border-focus transition-colors duration-120"
                      />
                      {storedKeyStatus.openrouterConfigured && !removeOpenRouter && (
                        <button
                          type="button"
                          onClick={() => {
                            setDraftOpenRouter("");
                            setRemoveOpenRouter(true);
                          }}
                          className="px-2.5 py-2 text-[10.5px] text-text-secondary border border-border-light rounded-md hover:bg-bg-secondary transition-colors duration-120 cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="w-full text-[10.5px] text-text-tertiary text-right">
                      {removeOpenRouter
                        ? "Stored key will be removed when you apply."
                        : draftOpenRouter.trim().length > 0
                          ? "New key ready to save securely."
                          : storedKeyStatus.openrouterConfigured
                            ? "Stored securely in your OS keychain."
                            : "Not set."}
                    </div>
                  </div>
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
                    placeholder="https://<resource>.openai.azure.com/openai/v1"
                    className="w-[280px] max-w-full px-3 py-2 bg-bg-input border border-border rounded-md text-[12.5px] text-text-primary placeholder:text-text-faint outline-none focus:border-border-focus transition-colors duration-120"
                  />
                </div>
                <div className="px-4 py-3 flex items-center justify-between gap-6">
                  <span className="text-[12.5px] text-text-secondary">
                    Deployment name
                  </span>
                  <div className="w-[280px] max-w-full">
                    <input
                      type="text"
                      value={draftAzureDeployment}
                      onChange={(e) => {
                        setDraftAzureDeployment(e.target.value);
                        if (azureDeploymentStatus) {
                          setAzureDeploymentStatus(null);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        submitAzureDeployment();
                      }}
                      placeholder="Type a deployment, then press Enter"
                      className="w-full px-3 py-2 bg-bg-input border border-border rounded-md text-[12.5px] text-text-primary placeholder:text-text-faint outline-none focus:border-border-focus transition-colors duration-120"
                    />
                    <div className="mt-1 text-[10.5px] text-text-tertiary leading-relaxed">
                      {azureDeploymentStatus ?? "Press Enter to add this deployment to the model list."}
                    </div>
                  </div>
                </div>
                <div className="px-4 py-3 flex items-center justify-between gap-6">
                  <span className="text-[12.5px] text-text-secondary">
                    API key
                  </span>
                  <div className="w-[280px] max-w-full flex flex-col items-end gap-1.5">
                    <div className="w-full flex items-center gap-2">
                      <input
                        type="password"
                        value={draftAzure}
                        onChange={(e) => {
                          setDraftAzure(e.target.value);
                          setRemoveAzure(false);
                        }}
                        placeholder={storedKeyStatus.azureConfigured && !removeAzure ? "Stored securely" : "..."}
                        className="flex-1 min-w-0 px-3 py-2 bg-bg-input border border-border rounded-md text-[12.5px] text-text-primary placeholder:text-text-faint outline-none focus:border-border-focus transition-colors duration-120"
                      />
                      {storedKeyStatus.azureConfigured && !removeAzure && (
                        <button
                          type="button"
                          onClick={() => {
                            setDraftAzure("");
                            setRemoveAzure(true);
                          }}
                          className="px-2.5 py-2 text-[10.5px] text-text-secondary border border-border-light rounded-md hover:bg-bg-secondary transition-colors duration-120 cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="w-full text-[10.5px] text-text-tertiary text-right">
                      {removeAzure
                        ? "Stored key will be removed when you apply."
                        : draftAzure.trim().length > 0
                          ? "New key ready to save securely."
                          : storedKeyStatus.azureConfigured
                            ? "Stored securely in your OS keychain."
                            : "Not set."}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-border-light flex items-center justify-between gap-6">
          <div className="text-[11.5px] text-text-tertiary leading-relaxed min-w-0">
            {applyStatus === "applied"
              ? "Applied to awencode."
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
          {[...CURATED_MODELS, ...azureDeploymentModels].map((m) => {
            const enabled = enabledModels[m.id];
            const selected = selectedModelId === m.id;
            const providerOverride = modelProviderOverrides?.[m.id];
            const effectiveProvider = providerOverride ?? m.provider;
            const isCuratedModel = CURATED_MODELS.some((c) => c.id === m.id);
            const isAzureDeploymentModel = !isCuratedModel && m.provider === "azure-openai-custom";
            // Only GPT-family models can be routed to OpenAI or OpenRouter; all others are fixed.
            const isGptModel = isCuratedModel && isGptFamilyModelId(m.id);
            const providerOptions = ([
              { id: "openai", label: "OpenAI", enabled: hasOpenAiAuth },
              { id: "openrouter", label: "OpenRouter", enabled: hasOpenRouterKey },
            ] satisfies Array<{ id: ModelProviderId; label: string; enabled: boolean }>).filter((p) => {
              if (!isCuratedModel) return false;
              if (!isGptModel) return p.id === "openrouter";
              return true;
            });
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
                    {isAzureDeploymentModel ? (
                      <span className="font-mono text-[9.5px] uppercase tracking-widest border rounded px-1.5 py-0.5 text-text-primary border-border-focus bg-bg-secondary">
                        Azure
                      </span>
                    ) : (
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
                    )}
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
                {isAzureDeploymentModel && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeAzureDeployment(m.id);
                    }}
                    className="inline-flex h-5 w-5 items-center justify-center rounded border border-border-light text-text-faint hover:text-text-primary hover:border-border-focus transition-colors duration-120 cursor-pointer"
                    aria-label={`Remove ${m.name}`}
                    title={`Remove ${m.name}`}
                  >
                    <X className="h-3 w-3" strokeWidth={1.75} />
                  </button>
                )}
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

function IntegrationsSection() {
  const [openAiAccountState, setOpenAiAccountState] = useState<OpenAiAccountState>(
    EMPTY_OPENAI_ACCOUNT_STATE,
  );
  const [openAiAuthStatus, setOpenAiAuthStatus] = useState<string | null>(null);
  const [openAiAuthBusy, setOpenAiAuthBusy] = useState<"idle" | "login" | "logout">("idle");
  const [pendingChatgptLoginId, setPendingChatgptLoginId] = useState<string | null>(null);

  const [githubUser, setGithubUser] = useState<GitHubConnectedUser | null>(null);
  const [githubStatus, setGithubStatus] = useState<string | null>(null);
  const [githubBusy, setGithubBusy] = useState<"idle" | "starting" | "disconnecting">("idle");
  const [githubFlow, setGithubFlow] = useState<GitHubDeviceFlowStartResult | null>(null);

  const [linearUser, setLinearUser] = useState<LinearConnectedUser | null>(null);
  const [linearStatus, setLinearStatus] = useState<string | null>(null);
  const [linearBusy, setLinearBusy] = useState<"idle" | "starting" | "disconnecting">("idle");
  const [linearRequestId, setLinearRequestId] = useState<string | null>(null);

  const refreshOpenAiAccount = useCallback(async () => {
    const nextAccount = await readOpenAiAccount(false);
    setOpenAiAccountState(nextAccount);
  }, []);

  const refreshGithubUser = useCallback(async () => {
    const nextUser = await invoke<GitHubConnectedUser | null>("github_get_user");
    setGithubUser(nextUser);
  }, []);

  const refreshLinearUser = useCallback(async () => {
    const nextUser = await invoke<LinearConnectedUser | null>("linear_get_user");
    setLinearUser(nextUser);
  }, []);

  useEffect(() => {
    refreshOpenAiAccount().catch((error) => {
      console.error("account/read failed", error);
    });
    refreshGithubUser().catch((error) => {
      console.error("github_get_user failed", error);
    });
    refreshLinearUser().catch((error) => {
      console.error("linear_get_user failed", error);
    });
  }, [refreshGithubUser, refreshLinearUser, refreshOpenAiAccount]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    onNotification((payload: string) => {
      try {
        const msg = JSON.parse(payload) as {
          method?: string;
          params?: {
            loginId?: string | null;
            success?: boolean;
            error?: string | null;
          };
        };

        if (msg.method === "account/login/completed") {
          const completedLoginId = msg.params?.loginId ?? null;
          if (pendingChatgptLoginId && completedLoginId !== pendingChatgptLoginId) {
            return;
          }
          setPendingChatgptLoginId(null);
          setOpenAiAuthBusy("idle");
          setOpenAiAuthStatus(
            msg.params?.success
              ? "Connected with ChatGPT."
              : msg.params?.error?.trim() || "ChatGPT login failed.",
          );
          refreshOpenAiAccount().catch((error) => {
            console.error("account/read failed", error);
          });
          return;
        }

        if (msg.method === "account/updated") {
          refreshOpenAiAccount().catch((error) => {
            console.error("account/read failed", error);
          });
        }
      } catch {
        // Ignore malformed notifications.
      }
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [pendingChatgptLoginId, refreshOpenAiAccount]);

  useEffect(() => {
    if (!githubFlow) return;
    let cancelled = false;
    let timeoutId: number | null = null;

    const poll = (delayMs: number) => {
      timeoutId = window.setTimeout(() => {
        invoke<GitHubDeviceFlowPollResult>("github_device_flow_poll", {
          deviceCode: githubFlow.deviceCode,
        })
          .then((result) => {
            if (cancelled) return;
            if (result.status === "pending") {
              setGithubStatus(result.message ?? "Waiting for GitHub authorization…");
              poll(result.interval * 1000);
              return;
            }
            setGithubBusy("idle");
            setGithubFlow(null);
            if (result.status === "complete") {
              setGithubUser(result.user);
              setGithubStatus(`Connected as @${result.user.login}.`);
              return;
            }
            setGithubStatus(result.message);
          })
          .catch((error) => {
            if (cancelled) return;
            setGithubBusy("idle");
            setGithubFlow(null);
            setGithubStatus(
              error instanceof Error ? error.message : "Could not complete GitHub login.",
            );
          });
      }, delayMs);
    };

    poll(githubFlow.interval * 1000);
    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [githubFlow]);

  useEffect(() => {
    if (!linearRequestId) return;
    let cancelled = false;
    let timeoutId: number | null = null;

    const poll = () => {
      timeoutId = window.setTimeout(() => {
        invoke<LinearOauthStatusResult>("linear_oauth_status", {
          requestId: linearRequestId,
        })
          .then((result) => {
            if (cancelled) return;
            if (result.status === "pending") {
              poll();
              return;
            }
            setLinearBusy("idle");
            setLinearRequestId(null);
            if (result.status === "complete") {
              setLinearUser(result.user);
              setLinearStatus(`Connected as ${result.user.name}.`);
              return;
            }
            setLinearStatus(result.message);
          })
          .catch((error) => {
            if (cancelled) return;
            setLinearBusy("idle");
            setLinearRequestId(null);
            setLinearStatus(
              error instanceof Error ? error.message : "Could not complete Linear login.",
            );
          });
      }, 1500);
    };

    poll();
    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [linearRequestId]);

  const startChatgptLogin = useCallback(async () => {
    setOpenAiAuthBusy("login");
    setOpenAiAuthStatus("Opening ChatGPT login…");
    try {
      const res = await rpcRequest<{
        type: "chatgpt";
        loginId: string;
        authUrl: string;
      }>("account/login/start", { type: "chatgpt" });
      setPendingChatgptLoginId(res.loginId);
      await invoke("open_url", { url: res.authUrl });
      setOpenAiAuthStatus("Complete login in your browser…");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Could not start ChatGPT login.";
      setPendingChatgptLoginId(null);
      setOpenAiAuthBusy("idle");
      setOpenAiAuthStatus(message);
    }
  }, []);

  const logoutOpenAiAccount = useCallback(async () => {
    setOpenAiAuthBusy("logout");
    setOpenAiAuthStatus(null);
    try {
      await rpcRequest("account/logout", {});
      setPendingChatgptLoginId(null);
      await refreshOpenAiAccount();
      setOpenAiAuthStatus("Signed out.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Could not sign out.";
      setOpenAiAuthStatus(message);
    } finally {
      setOpenAiAuthBusy("idle");
    }
  }, [refreshOpenAiAccount]);

  const startGithubLogin = useCallback(async () => {
    setGithubBusy("starting");
    setGithubStatus("Preparing GitHub login…");
    try {
      const result = await invoke<GitHubDeviceFlowStartResult>("github_device_flow_start");
      setGithubFlow(result);
      await invoke("open_url", { url: result.verificationUri });
      setGithubStatus("Enter the GitHub device code in your browser.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Could not start GitHub login.";
      setGithubBusy("idle");
      setGithubFlow(null);
      setGithubStatus(message);
    }
  }, []);

  const disconnectGithub = useCallback(async () => {
    setGithubBusy("disconnecting");
    setGithubStatus(null);
    try {
      await invoke("github_disconnect");
      setGithubFlow(null);
      setGithubUser(null);
      setGithubStatus("Disconnected.");
    } catch (error) {
      setGithubStatus(
        error instanceof Error ? error.message : "Could not disconnect GitHub.",
      );
    } finally {
      setGithubBusy("idle");
    }
  }, []);

  const startLinearLogin = useCallback(async () => {
    setLinearBusy("starting");
    setLinearStatus("Opening Linear login…");
    try {
      const result = await invoke<LinearOauthStartResult>("linear_oauth_start");
      setLinearRequestId(result.requestId);
      await invoke("open_url", { url: result.authUrl });
      setLinearStatus("Complete the Linear login in your browser…");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Could not start Linear login.";
      setLinearBusy("idle");
      setLinearRequestId(null);
      setLinearStatus(message);
    }
  }, []);

  const disconnectLinear = useCallback(async () => {
    setLinearBusy("disconnecting");
    setLinearStatus(null);
    try {
      await invoke("linear_disconnect");
      setLinearRequestId(null);
      setLinearUser(null);
      setLinearStatus("Disconnected.");
    } catch (error) {
      setLinearStatus(
        error instanceof Error ? error.message : "Could not disconnect Linear.",
      );
    } finally {
      setLinearBusy("idle");
    }
  }, []);

  const openAiAccount = openAiAccountState.account;
  const openAiDisplay =
    openAiAccount?.type === "chatgpt"
      ? [formatPlanType(openAiAccount.planType), openAiAccount.email]
          .filter(Boolean)
          .join(" · ") || "Connected with ChatGPT."
      : "Not connected.";

  return (
    <div>
      <SectionHeading
        title="Integrations"
        description="Connect external accounts for PR metadata, issue linking, and managed OpenAI authentication."
      />

      <div className="grid gap-4">
        <IntegrationCard
          title="GitHub"
          description="Use GitHub OAuth for pull request checks, approvals, comments, and merge status."
          icon={<GitPullRequest className="h-4 w-4" strokeWidth={1.75} />}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[12.5px] font-medium text-text-primary">
                {githubUser ? `@${githubUser.login}` : "Not connected"}
              </div>
              <div className="mt-0.5 text-[11px] text-text-tertiary leading-relaxed">
                {githubUser?.name ?? "Required for private-repo PR metadata and status checks."}
              </div>
            </div>
            {githubUser ? (
              <div className="flex items-center gap-3">
                {githubUser.avatarUrl ? (
                  <img
                    src={githubUser.avatarUrl}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-full border border-border-light"
                  />
                ) : null}
                <IntegrationActionButton
                  label={githubBusy === "disconnecting" ? "Disconnecting…" : "Disconnect"}
                  onClick={() => void disconnectGithub()}
                  disabled={githubBusy !== "idle"}
                  loading={githubBusy === "disconnecting"}
                />
              </div>
            ) : (
              <IntegrationActionButton
                label={githubBusy === "starting" ? "Starting…" : "Connect GitHub"}
                onClick={() => void startGithubLogin()}
                disabled={githubBusy !== "idle"}
                loading={githubBusy === "starting"}
                variant="primary"
              />
            )}
          </div>

          {githubFlow ? (
            <div className="mt-4 rounded-lg border border-border-light bg-bg-secondary/60 p-3">
              <div className="text-[10.5px] text-text-tertiary uppercase tracking-widest mb-2">
                Device code
              </div>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 rounded-md border border-border-light bg-bg-card px-3 py-2 font-mono text-[12px] text-text-primary">
                  {githubFlow.userCode}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(githubFlow.userCode).catch(() => {});
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-border-default px-2.5 py-2 text-[10.5px] text-text-secondary hover:bg-bg-secondary transition-colors duration-120 cursor-pointer"
                >
                  <Copy className="h-3 w-3" strokeWidth={1.75} />
                  Copy
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void invoke("open_url", { url: githubFlow.verificationUri });
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-border-default px-2.5 py-2 text-[10.5px] text-text-secondary hover:bg-bg-secondary transition-colors duration-120 cursor-pointer"
                >
                  <ExternalLink className="h-3 w-3" strokeWidth={1.75} />
                  Open GitHub
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-3 text-[11px] text-text-tertiary leading-relaxed">
            {githubStatus ?? "Connect GitHub to replace placeholder PR metadata with real checks and review data."}
          </div>
        </IntegrationCard>

        <IntegrationCard
          title="Linear"
          description="Use Linear OAuth to link threads to issues and prepare Linear issue workflows."
          icon={<Layers className="h-4 w-4" strokeWidth={1.75} />}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[12.5px] font-medium text-text-primary">
                {linearUser?.name ?? "Not connected"}
              </div>
              <div className="mt-0.5 text-[11px] text-text-tertiary leading-relaxed">
                {linearUser?.email ?? "Connect Linear to link Awencode threads to issues."}
              </div>
            </div>
            {linearUser ? (
              <IntegrationActionButton
                label={linearBusy === "disconnecting" ? "Disconnecting…" : "Disconnect"}
                onClick={() => void disconnectLinear()}
                disabled={linearBusy !== "idle"}
                loading={linearBusy === "disconnecting"}
              />
            ) : (
              <IntegrationActionButton
                label={linearBusy === "starting" ? "Starting…" : "Connect Linear"}
                onClick={() => void startLinearLogin()}
                disabled={linearBusy !== "idle"}
                loading={linearBusy === "starting"}
                variant="primary"
              />
            )}
          </div>

          <div className="mt-3 text-[11px] text-text-tertiary leading-relaxed">
            {linearStatus ?? "Complete the browser flow to make Linear issue linking available."}
          </div>
        </IntegrationCard>

        <IntegrationCard
          title="ChatGPT"
          description="Use your ChatGPT account for managed OpenAI authentication. API keys remain in General."
          icon={<Bot className="h-4 w-4" strokeWidth={1.75} />}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[12.5px] font-medium text-text-primary">
                {openAiAccount?.type === "chatgpt" ? "Connected" : "Not connected"}
              </div>
              <div className="mt-0.5 text-[11px] text-text-tertiary leading-relaxed">
                {openAiDisplay}
              </div>
            </div>
            {openAiAccount?.type === "chatgpt" ? (
              <IntegrationActionButton
                label={openAiAuthBusy === "logout" ? "Signing out…" : "Sign out"}
                onClick={() => void logoutOpenAiAccount()}
                disabled={openAiAuthBusy !== "idle"}
                loading={openAiAuthBusy === "logout"}
              />
            ) : (
              <IntegrationActionButton
                label={openAiAuthBusy === "login" ? "Opening…" : "Connect ChatGPT"}
                onClick={() => void startChatgptLogin()}
                disabled={openAiAuthBusy !== "idle"}
                loading={openAiAuthBusy === "login"}
                variant="primary"
              />
            )}
          </div>

          <div className="mt-3 text-[11px] text-text-tertiary leading-relaxed">
            {openAiAuthStatus ??
              (openAiAccount?.type === "chatgpt"
                ? "Codex uses your ChatGPT session first and can still fall back to saved API keys."
                : "Connect ChatGPT when you want managed OpenAI auth instead of an API key.")}
          </div>
        </IntegrationCard>
      </div>
    </div>
  );
}

function ThemeSegmented({
  value,
  onChange,
}: {
  value: ThemePreference;
  onChange: (v: ThemePreference) => void;
}) {
  const seg = (
    pref: ThemePreference,
    label: string,
    Icon: NavIcon,
  ) => {
    const active = value === pref;
    return (
      <button
        type="button"
        key={pref}
        onClick={() => onChange(pref)}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11.5px] font-medium transition-colors duration-120 cursor-pointer",
          active
            ? "bg-bg-secondary text-text-primary shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
            : "text-text-secondary hover:text-text-primary",
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" strokeWidth={1.75} />
        {label}
      </button>
    );
  };

  return (
    <div className="inline-flex items-center gap-0.5 p-1 rounded-lg border border-border-light bg-bg-secondary/50">
      {seg("light", "Light", Sun)}
      {seg("dark", "Dark", Moon)}
      {seg("system", "System", Laptop)}
    </div>
  );
}

function AppearanceSection({
  theme,
  setTheme,
}: {
  theme: ThemePreference;
  setTheme: (v: ThemePreference) => void;
}) {
  return (
    <div>
      <SectionHeading title="Appearance" />
      <div className="bg-bg-card border border-border-light rounded-lg overflow-hidden">
        <SettingsRow
          label="Theme"
          description="Use a fixed look or follow your system setting"
          icon={<Sun className="h-4 w-4" strokeWidth={1.5} />}
        >
          <ThemeSegmented value={theme} onChange={setTheme} />
        </SettingsRow>
      </div>
    </div>
  );
}

type ApprovalPolicyValue = "untrusted" | "on-failure" | "on-request" | "never";
type SandboxModeValue = "read-only" | "workspace-write" | "danger-full-access";

function normalizeApprovalPolicy(raw: unknown): ApprovalPolicyValue {
  if (
    raw === "untrusted" ||
    raw === "on-failure" ||
    raw === "on-request" ||
    raw === "never"
  ) {
    return raw;
  }
  return "on-request";
}

function normalizeSandboxMode(raw: unknown): SandboxModeValue {
  if (
    raw === "read-only" ||
    raw === "workspace-write" ||
    raw === "danger-full-access"
  ) {
    return raw;
  }
  return "read-only";
}

function isGranularApprovalPolicy(raw: unknown): boolean {
  return (
    typeof raw === "object" &&
    raw !== null &&
    "granular" in raw &&
    typeof (raw as { granular?: unknown }).granular === "object"
  );
}

function AgentSection() {
  const [approvalPolicy, setApprovalPolicy] = useState<ApprovalPolicyValue>("on-request");
  const [approvalPolicyGranular, setApprovalPolicyGranular] = useState(false);
  const [sandboxMode, setSandboxMode] = useState<SandboxModeValue>("read-only");
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveHint, setSaveHint] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await rpcRequest<{ config?: Record<string, unknown> }>("config/read", {});
      const cfg = res?.config ?? {};
      const apRaw = cfg.approval_policy;
      if (isGranularApprovalPolicy(apRaw)) {
        setApprovalPolicyGranular(true);
        setApprovalPolicy("on-request");
      } else {
        setApprovalPolicyGranular(false);
        setApprovalPolicy(normalizeApprovalPolicy(apRaw));
      }
      setSandboxMode(normalizeSandboxMode(cfg.sandbox_mode));
      setInstructions(typeof cfg.instructions === "string" ? cfg.instructions : "");
    } catch {
      setSaveHint("Couldn’t load agent settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const persistAgent = async () => {
    setSaving(true);
    setSaveHint(null);
    try {
      const edits: Array<{
        keyPath: string;
        value: unknown;
        mergeStrategy: "replace";
      }> = [];
      if (!approvalPolicyGranular) {
        edits.push({
          keyPath: "approval_policy",
          value: approvalPolicy,
          mergeStrategy: "replace",
        });
      }
      edits.push(
        {
          keyPath: "sandbox_mode",
          value: sandboxMode,
          mergeStrategy: "replace",
        },
        {
          keyPath: "instructions",
          value: instructions.trim() || null,
          mergeStrategy: "replace",
        },
      );
      await rpcRequest("config/batchWrite", {
        edits,
        reloadUserConfig: true,
      });
      setSaveHint("Saved.");
      window.setTimeout(() => setSaveHint(null), 2000);
    } catch {
      setSaveHint("Couldn’t save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const approvalOptions: {
    value: ApprovalPolicyValue;
    label: string;
    description: string;
  }[] = [
    {
      value: "untrusted",
      label: "Untrusted",
      description: "Always ask before taking action",
    },
    {
      value: "on-failure",
      label: "On failure",
      description: "Ask only when a command fails",
    },
    {
      value: "on-request",
      label: "On request",
      description: "Ask when escalation is requested",
    },
    {
      value: "never",
      label: "Never",
      description: "Run without asking for approval",
    },
  ];

  const sandboxOptions: {
    value: SandboxModeValue;
    label: string;
    description: string;
  }[] = [
    {
      value: "read-only",
      label: "Read only",
      description: "Can read files, but cannot edit them",
    },
    {
      value: "workspace-write",
      label: "Workspace write",
      description: "Can edit files, but only in this workspace",
    },
    {
      value: "danger-full-access",
      label: "Full access",
      description: "Can edit files outside this workspace",
    },
  ];

  return (
    <div>
      <SectionHeading
        title="Agent"
        description="How Codex asks for approval, what it can change on disk, and your custom instructions."
      />

      <div className="bg-bg-card border border-border-light rounded-lg mb-6">
        {loading ? (
          <div className="px-4 py-4 text-[12px] text-text-faint">Loading…</div>
        ) : (
          <>
            <SettingsRow
              label="Approval policy"
              description={
                approvalPolicyGranular
                  ? "Your config uses granular approval rules. Edit config.toml to change them."
                  : "Choose when Codex asks for approval"
              }
              icon={<SlidersHorizontal className="h-4 w-4" strokeWidth={1.5} />}
            >
              <SettingsChoiceField
                value={approvalPolicy}
                options={approvalOptions}
                onChange={setApprovalPolicy}
                disabled={saving || approvalPolicyGranular}
              />
            </SettingsRow>
            <SettingsRow
              label="Sandbox settings"
              description="Choose how much Codex can do when running commands"
              icon={<Layers className="h-4 w-4" strokeWidth={1.5} />}
            >
              <SettingsChoiceField
                value={sandboxMode}
                options={sandboxOptions}
                onChange={setSandboxMode}
                disabled={saving}
              />
            </SettingsRow>
            <SettingsRow
              layout="stacked"
              label="Instructions"
              description="Extra guidance applied to the agent (personalization)"
              icon={<Bot className="h-4 w-4" strokeWidth={1.5} />}
            >
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                disabled={saving}
                rows={5}
                placeholder="Optional instructions for Codex…"
                className="w-full min-h-[120px] px-3 py-2 bg-bg-input border border-border rounded-md text-[12.5px] text-text-primary placeholder:text-text-faint outline-none focus:border-border-focus transition-colors duration-120 resize-y"
              />
            </SettingsRow>
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="text-[11.5px] text-text-tertiary min-w-0">
          {saveHint ?? "Writes to your user config."}
        </div>
        <button
          type="button"
          onClick={() => void persistAgent()}
          disabled={saving || loading}
          className={cn(
            "px-3 py-1.5 rounded-md text-[11.5px] font-medium transition-colors duration-120 cursor-pointer",
            saving || loading
              ? "bg-bg-secondary text-text-faint border border-border-light cursor-default"
              : "bg-text-primary text-bg-card hover:opacity-90",
          )}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

interface McpServerEntry {
  name: string;
  tools?: Record<string, unknown>;
  authStatus?: string;
  enabled?: boolean;
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
      enabled: boolean;
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
      enabled: boolean;
    };

function normalizeServerName(raw: string): string {
  return mcpServerTomlKey(raw);
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
    enabled: true,
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
      enabled: typeof obj.enabled === "boolean" ? obj.enabled : true,
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
  const [lastError, setLastError] = useState<string | null>(null);

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
    setLastError(null);
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
      const valueWithEnabled = {
        ...value,
        enabled: draft.enabled,
      };

      await rpcRequest("config/batchWrite", {
        edits: [{ keyPath, value: valueWithEnabled, mergeStrategy: "replace" }],
        reloadUserConfig: true,
      });
      await rpcRequest("config/mcpServer/reload", {});
      setStatus("saved");
      window.setTimeout(() => setStatus("idle"), 900);
      onSaved();
      onClose();
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e);
      setLastError(msg);
      setStatus("error");
      window.setTimeout(() => setStatus("idle"), 4500);
    }
  };

  const remove = async () => {
    if (isCreate || !name) return;
    setStatus("removing");
    setLastError(null);
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
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e);
      setLastError(msg);
      setStatus("error");
      window.setTimeout(() => setStatus("idle"), 4500);
    }
  };

  return (
    <ModalShell
      title={isCreate ? "Add MCP server" : `Update ${name}`}
      description={
        isCreate
          ? "Add a custom MCP server to your awencode configuration."
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
                placeholder="e.g. linear_mcp (no dots — used as config key)"
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
          <div className="text-[11.5px] text-text-tertiary leading-relaxed min-w-0">
            {status === "saving"
              ? "Saving…"
              : status === "saved"
                ? "Saved."
                : status === "removing"
                  ? "Removing…"
                  : status === "removed"
                    ? "Removed."
                    : status === "error"
                      ? lastError
                        ? `Couldn’t apply: ${lastError}`
                        : "Couldn’t apply. Try again."
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

function draftFromRegistryServer(server: RegistryServer): McpServerDraft {
  const name = mcpServerTomlKey(server.name);
  const httpRemote = server.remotes?.find(
    (r) => r.type === "streamable-http" && typeof r.url === "string" && r.url.length > 0,
  );
  if (httpRemote?.url) {
    return {
      ...buildEmptyDraft("create", name),
      transport: "streamable_http",
      url: httpRemote.url,
    };
  }
  const npmPkg = server.packages?.find(
    (p) => p.transport?.type === "stdio" && typeof p.identifier === "string" && p.identifier,
  );
  if (npmPkg?.identifier) {
    return {
      ...buildEmptyDraft("create", name),
      transport: "stdio",
      command: "npx",
      args: ["-y", npmPkg.identifier],
    };
  }
  return buildEmptyDraft("create", name);
}

function McpSection() {
  const [servers, setServers] = useState<McpServerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalDraft, setModalDraft] = useState<McpServerDraft | null>(null);
  const [oauthStatusByServer, setOauthStatusByServer] = useState<Record<string, string>>({});
  const [busyServer, setBusyServer] = useState<string | null>(null);
  const [registryQuery, setRegistryQuery] = useState("");
  const [registryResults, setRegistryResults] = useState<RegistryServer[]>([]);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [registryErr, setRegistryErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        setRegistryLoading(true);
        setRegistryErr(null);
        try {
          const q = registryQuery.trim();
          // Empty query: fetch a wide page so client-side recency sort isn’t trapped in an A–Z slice.
          const fetchLimit = q ? 18 : 100;
          const data = await searchMcpRegistry(registryQuery, { limit: fetchLimit });
          if (cancelled) return;
          const list = (data.servers ?? [])
            .map((x) => x.server)
            .filter((s): s is RegistryServer => Boolean(s?.name))
            .slice(0, 18);
          setRegistryResults(list);
        } catch (e) {
          if (!cancelled) {
            setRegistryErr(e instanceof Error ? e.message : "Search failed");
            setRegistryResults([]);
          }
        } finally {
          if (!cancelled) setRegistryLoading(false);
        }
      })();
    }, 320);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [registryQuery]);

  const refresh = () => {
    setLoading(true);
    Promise.all([
      rpcRequest<{ data?: McpServerEntry[] }>("mcpServerStatus/list", {}),
      rpcRequest<{ config?: Record<string, unknown> }>("config/read", {}),
    ])
      .then(([statusRes, configRes]) => {
        const listed = Array.isArray(statusRes?.data) ? statusRes.data : [];
        const config = configRes?.config ?? {};
        const mcpServersRaw =
          (config as Record<string, unknown>)["mcp_servers"] &&
          typeof (config as Record<string, unknown>)["mcp_servers"] === "object"
            ? ((config as Record<string, unknown>)["mcp_servers"] as Record<string, unknown>)
            : {};

        const merged = listed.map((server) => {
          const cfg = mcpServersRaw[server.name];
          const enabled =
            cfg && typeof cfg === "object" && typeof (cfg as Record<string, unknown>).enabled === "boolean"
              ? Boolean((cfg as Record<string, unknown>).enabled)
              : true;
          return { ...server, enabled };
        });
        setServers(merged);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    onNotification((payload: string) => {
      try {
        const msg = JSON.parse(payload) as {
          method?: string;
          params?: { name?: string; success?: boolean; error?: string };
        };
        if (msg.method !== "mcpServer/oauthLogin/completed") return;
        const name = msg.params?.name;
        if (!name) return;
        if (msg.params?.success) {
          setOauthStatusByServer((s) => ({ ...s, [name]: "Connected." }));
          refresh();
        } else {
          const err = msg.params?.error?.trim();
          setOauthStatusByServer((s) => ({
            ...s,
            [name]: err ? `Login failed: ${err}` : "Login failed.",
          }));
        }
      } catch {
        // Ignore malformed notifications.
      }
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const setServerEnabled = async (name: string, enabled: boolean) => {
    setBusyServer(name);
    try {
      await rpcRequest("config/batchWrite", {
        edits: [{ keyPath: `mcp_servers.${name}.enabled`, value: enabled, mergeStrategy: "replace" }],
        reloadUserConfig: true,
      });
      await rpcRequest("config/mcpServer/reload", {});
      await refresh();
    } finally {
      setBusyServer(null);
    }
  };

  const connectServer = async (name: string) => {
    setBusyServer(name);
    setOauthStatusByServer((s) => ({ ...s, [name]: "Opening login…" }));
    try {
      const res = await rpcRequest<{ authorizationUrl?: string }>("mcpServer/oauth/login", {
        name,
      });
      const url = res?.authorizationUrl;
      if (!url) {
        setOauthStatusByServer((s) => ({ ...s, [name]: "Could not start login." }));
        return;
      }
      await invoke("open_url", { url });
      setOauthStatusByServer((s) => ({ ...s, [name]: "Complete login in browser…" }));
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : typeof e === "string" ? e : "Could not start login.";
      setOauthStatusByServer((s) => ({ ...s, [name]: msg }));
    } finally {
      setBusyServer(null);
    }
  };

  return (
    <div>
      <SectionHeading
        title="MCP Servers"
        description="Connect external tools and data sources."
      />

      <div className="mb-8">
        <div className="flex items-center justify-between gap-3 mb-3">
          <span className="label-mono">Official registry</span>
          <a
            href="https://registry.modelcontextprotocol.io/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-text-secondary hover:text-text-primary transition-colors duration-120"
          >
            registry.modelcontextprotocol.io
            <ExternalLink className="h-3 w-3 opacity-70" strokeWidth={1.75} />
          </a>
        </div>
        <div className="relative mb-3">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-faint pointer-events-none"
            strokeWidth={1.75}
          />
          <input
            type="search"
            value={registryQuery}
            onChange={(e) => setRegistryQuery(e.target.value)}
            placeholder="Search servers by name or description…"
            className="w-full pl-9 pr-3 py-2.5 rounded-md border border-border-light bg-bg-input text-[12.5px] text-text-primary placeholder:text-text-faint outline-none focus:border-border-focus transition-colors duration-120"
          />
        </div>
        {!registryQuery.trim() && (
          <p className="text-[11px] text-text-tertiary mb-2 leading-relaxed">
            Preview list is ordered by recent registry activity (the API does not expose install counts).
          </p>
        )}
        {registryErr && (
          <div className="text-[11.5px] text-accent-red mb-2">{registryErr}</div>
        )}
        <div className="bg-bg-card border border-border-light rounded-lg overflow-hidden max-h-[320px] overflow-y-auto">
          {registryLoading && registryResults.length === 0 ? (
            <div className="px-4 py-3 text-[12px] text-text-faint">Searching…</div>
          ) : registryResults.length === 0 ? (
            <div className="px-4 py-3 text-[12px] text-text-faint">
              No matches. Try another query or open the registry in your browser.
            </div>
          ) : (
            registryResults.map((s) => (
              <div
                key={s.name}
                className="px-4 py-3 flex items-start justify-between gap-4 border-t border-border-light first:border-t-0"
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-text-primary truncate">
                    {s.title ?? s.name}
                  </div>
                  <div className="text-[11px] text-text-tertiary mt-0.5 line-clamp-2">
                    {s.description ?? "—"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalDraft(draftFromRegistryServer(s))}
                  className="shrink-0 px-2.5 py-1 rounded-md text-[11px] font-medium border border-border-default text-text-secondary hover:text-text-primary hover:border-border-focus transition-all duration-120 cursor-pointer"
                >
                  Add
                </button>
              </div>
            ))
          )}
        </div>
      </div>

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
                <div className="min-w-0">
                  <div className="text-[13px] text-text-primary">{server.name}</div>
                  <div className="text-[11px] text-text-tertiary mt-0.5">
                    {oauthStatusByServer[server.name] ?? " "}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-text-faint">
                    {server.authStatus ?? "—"}
                  </span>
                  {server.authStatus === "notLoggedIn" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        connectServer(server.name);
                      }}
                      disabled={busyServer === server.name}
                      className={cn(
                        "px-2 py-1 rounded border text-[10.5px] font-medium transition-colors duration-120 cursor-pointer",
                        busyServer === server.name
                          ? "border-border-light text-text-faint cursor-default"
                          : "border-border-light text-text-secondary hover:text-text-primary hover:border-border-focus",
                      )}
                    >
                      Connect
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void setServerEnabled(server.name, !(server.enabled ?? true));
                    }}
                    disabled={busyServer === server.name}
                    className={cn(
                      "relative inline-flex h-5 w-9 items-center rounded-full border transition-colors duration-150 shrink-0",
                      server.enabled ?? true
                        ? "bg-[var(--toggle-on)] border-[var(--toggle-on)]"
                        : "bg-bg-secondary border-border",
                      busyServer === server.name && "opacity-60",
                    )}
                    aria-label={`${(server.enabled ?? true) ? "Disable" : "Enable"} ${server.name}`}
                  >
                    <span
                      className={cn(
                        "inline-block h-4 w-4 rounded-full bg-[var(--toggle-knob)] shadow-sm transition-transform duration-150",
                        (server.enabled ?? true) ? "translate-x-[17px]" : "translate-x-[1px]",
                      )}
                    />
                  </button>
                </div>
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

type ArchivedListItem = {
  id: string;
  name: string | null;
  preview: string;
  cwd: string;
  gitInfo: { branch: string | null; originUrl: string | null } | null;
  updatedAt: number;
};

function projectLabelFromPath(cwd: string): string {
  const t = cwd.trim().replace(/[/\\]+$/, "");
  if (!t.length) return "Unknown";
  const segs = t.split(/[/\\]/);
  return segs[segs.length - 1] ?? t;
}

function displayArchivedTitle(t: ArchivedListItem): string {
  const n = t.name?.trim();
  if (n) return n.length > 120 ? `${n.slice(0, 117)}…` : n;
  const p = t.preview.trim().replace(/\s+/g, " ");
  if (p) return p.length > 120 ? `${p.slice(0, 117)}…` : p;
  return "Untitled thread";
}

function ArchivedThreadsSection() {
  const addAgent = useThreadStore((s) => s.addAgent);
  const [rows, setRows] = useState<ArchivedListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await rpcRequest<{ data: ArchivedListItem[]; nextCursor: string | null }>(
        "thread/list",
        {
          archived: true,
          limit: 100,
          /** Empty array = all providers (default would filter to current provider only). */
          modelProviders: [],
          /** All source kinds — safe because CODEX_HOME is ~/.awencode, isolated from ~/.codex. */
          sourceKinds: ["cli", "vscode", "appServer", "exec"],
        },
      );
      setRows(Array.isArray(res?.data) ? res.data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load archived threads");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const restore = async (t: ArchivedListItem) => {
    setRestoringId(t.id);
    setError(null);
    try {
      await rpcRequest("thread/unarchive", { threadId: t.id });
      const resumed = await rpcRequest<{
        thread: {
          id: string;
          name: string | null;
          gitInfo: { branch: string | null; originUrl: string | null } | null;
        };
      }>("thread/resume", {
        threadId: t.id,
        persistExtendedHistory: false,
      });
      const thread = resumed?.thread;
      if (!thread?.id) {
        throw new Error("Resume did not return a thread");
      }
      const merged: ArchivedListItem = {
        ...t,
        name: thread.name ?? t.name,
        gitInfo: thread.gitInfo ?? t.gitInfo,
      };
      const title = displayArchivedTitle(merged);
      const branch = merged.gitInfo?.branch ?? "";
      const originRaw = merged.gitInfo?.originUrl ?? null;
      addAgent(
        {
          id: `agent-${Date.now()}`,
          title,
          branch,
          status: "queued",
          lastAction: "Restored — open chat to continue",
          progress: 0,
          time: "—",
          tokens: "—",
          files: [],
          pr: null,
          messages: [],
          blocked: false,
          codexThreadId: thread.id,
          originUrl: originRaw && originRaw.length > 0 ? originRaw : undefined,
        },
        { select: false },
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div>
      <SectionHeading
        title="Archived threads"
        description="Sessions you archived from the board. Restore adds them to the Drafts column."
      />
      {error && (
        <p className="text-[11.5px] text-accent-red mb-4 leading-relaxed">{error}</p>
      )}
      {loading ? (
        <div className="text-[12.5px] text-text-faint">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-8 rounded-lg border border-dashed border-border-light text-center">
          <div className="text-[12.5px] text-text-faint">No archived threads</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((t) => {
            const project = projectLabelFromPath(t.cwd);
            const busy = restoringId === t.id;
            return (
              <div
                key={t.id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 rounded-lg border border-border-light bg-bg-card"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-text-primary leading-snug">
                    {displayArchivedTitle(t)}
                  </div>
                  <div
                    className="font-mono text-[10px] uppercase tracking-label-wide text-text-faint mt-1 truncate"
                    title={t.cwd}
                  >
                    {project}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy || restoringId !== null}
                  onClick={() => void restore(t)}
                  className={cn(
                    "shrink-0 px-3.5 py-[7px] rounded-md text-[11.5px] font-medium border border-border-default text-text-secondary",
                    "hover:bg-bg-secondary transition-colors duration-120 cursor-pointer",
                    (busy || restoringId !== null) && "opacity-50 pointer-events-none cursor-not-allowed",
                  )}
                >
                  {busy ? "Restoring…" : "Restore"}
                </button>
              </div>
            );
          })}
        </div>
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
