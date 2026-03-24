import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ModelProviderId = "openai" | "openrouter" | "azure-openai-custom";

export type ReasoningEffort = "low" | "medium" | "high" | "xhigh";
export type LinearSyncStatusKey = "queued" | "active" | "review" | "deployed";

export type LinearStatusMappings = Record<LinearSyncStatusKey, string | null>;

export interface CuratedModelOption {
  id: string;
  provider: ModelProviderId;
  name: string;
  description: string;
}

export function buildAzureDeploymentModels(
  azureDeployments: string[],
): CuratedModelOption[] {
  return Array.from(
    new Set(
      azureDeployments
        .map((deployment) => deployment.trim())
        .filter(Boolean),
    ),
  ).map((deployment) => ({
    id: deployment,
    provider: "azure-openai-custom",
    name: deployment,
    description: "Your Azure deployment",
  }));
}

export function isGptFamilyModelId(modelId: string): boolean {
  return modelId.startsWith("gpt-");
}

export const CURATED_MODELS: CuratedModelOption[] = [
  {
    id: "gpt-5.4",
    provider: "openai",
    name: "GPT-5.4",
    description: "Frontier agentic coding (Max Mode supports very long context)",
  },
  {
    id: "gpt-5.3-codex",
    provider: "openai",
    name: "GPT-5.3 Codex",
    description: "Codex-tuned GPT-5 series for agentic coding",
  },
  {
    id: "gpt-5.2-codex",
    provider: "openai",
    name: "GPT-5.2 Codex",
    description: "Strong default when you want reliability + speed",
  },
  {
    id: "gpt-5.1-codex",
    provider: "openai",
    name: "GPT-5.1 Codex",
    description: "Solid baseline Codex model",
  },
  {
    id: "gpt-5.1-codex-mini",
    provider: "openai",
    name: "GPT-5.1 Codex Mini",
    description: "Fast, cost-effective iteration",
  },
  {
    id: "openrouter/auto",
    provider: "openrouter",
    name: "OpenRouter Auto",
    description: "Lets OpenRouter pick the best routed model for the job",
  },
  {
    id: "anthropic/claude-sonnet-4.6",
    provider: "openrouter",
    name: "Claude Sonnet 4.6",
    description: "Top-tier coding + agents; via OpenRouter",
  },
  {
    id: "anthropic/claude-opus-4.6",
    provider: "openrouter",
    name: "Claude Opus 4.6",
    description: "Best for large, long-running refactors; via OpenRouter",
  },
  {
    id: "google/gemini-3.1-pro-preview",
    provider: "openrouter",
    name: "Gemini 3.1 Pro",
    description: "Strong planning + long context; via OpenRouter",
  },
  {
    id: "google/gemini-3-flash-preview",
    provider: "openrouter",
    name: "Gemini 3 Flash (preview)",
    description: "High-speed agentic workflows; via OpenRouter",
  },
  {
    id: "deepseek/deepseek-v3.2",
    provider: "openrouter",
    name: "DeepSeek V3.2",
    description: "Popular coding + tool-use model; via OpenRouter",
  },
  {
    id: "minimax/minimax-m2.5",
    provider: "openrouter",
    name: "MiniMax M2.5",
    description: "Top OpenRouter coding usage (Mar 2026); via OpenRouter",
  },
  {
    id: "moonshotai/kimi-k2.5",
    provider: "openrouter",
    name: "Kimi K2.5",
    description: "Strong coding + long context; via OpenRouter",
  },
  {
    id: "x-ai/grok-4.1-fast",
    provider: "openrouter",
    name: "Grok 4.1 Fast",
    description: "Fast agentic tool-calling; via OpenRouter",
  },
];

interface SettingsState {
  azureBaseUrl: string;
  azureDeployments: string[];
  linearAutoSyncEnabled: boolean;
  linearStatusMappings: LinearStatusMappings;

  /** Selected model (must be enabled; store enforces this). */
  selectedModelId: string;
  /** Optional per-model provider override (e.g. use azure-openai for GPT models). */
  modelProviderOverrides: Record<string, ModelProviderId>;
  /** Reasoning effort for turn/start (low|medium|high). */
  selectedReasoningEffort: ReasoningEffort;
  /** Enabled models shown as “available” in the UI. */
  enabledModels: Record<string, boolean>;

  setAzureBaseUrl: (value: string) => void;
  addAzureDeployment: (value: string) => boolean;
  removeAzureDeployment: (value: string) => void;
  setLinearAutoSyncEnabled: (enabled: boolean) => void;
  setLinearStatusMapping: (status: LinearSyncStatusKey, linearStateName: string | null) => void;
  setSelectedModelId: (id: string) => void;
  setModelProviderOverride: (modelId: string, provider: ModelProviderId) => void;
  setSelectedReasoningEffort: (effort: ReasoningEffort) => void;
  setModelEnabled: (id: string, enabled: boolean) => void;
  ensureDefaults: () => void;
}

const DEFAULT_SELECTED_MODEL = "gpt-5.3-codex";
const DEFAULT_REASONING_EFFORT: ReasoningEffort = "medium";
const DEFAULT_LINEAR_STATUS_MAPPINGS: LinearStatusMappings = {
  queued: null,
  active: null,
  review: null,
  deployed: null,
};

function defaultEnabledModels(): Record<string, boolean> {
  return CURATED_MODELS.reduce((acc, m) => {
    acc[m.id] = true;
    return acc;
  }, {} as Record<string, boolean>);
}

function pickFirstEnabled(
  enabled: Record<string, boolean>,
  azureDeployments: string[],
): string {
  const found = [...CURATED_MODELS, ...buildAzureDeploymentModels(azureDeployments)].find(
    (m) => enabled[m.id],
  );
  return found?.id ?? DEFAULT_SELECTED_MODEL;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      azureBaseUrl: "",
      azureDeployments: [],
      linearAutoSyncEnabled: true,
      linearStatusMappings: DEFAULT_LINEAR_STATUS_MAPPINGS,

      selectedModelId: DEFAULT_SELECTED_MODEL,
      modelProviderOverrides: {},
      selectedReasoningEffort: DEFAULT_REASONING_EFFORT,
      enabledModels: defaultEnabledModels(),

      setAzureBaseUrl: (value) => set({ azureBaseUrl: value }),
      addAzureDeployment: (value) => {
        const nextDeployment = value.trim();
        if (!nextDeployment) return false;
        const existing = get().azureDeployments;
        if (existing.includes(nextDeployment)) return false;
        set((s) => ({
          azureDeployments: [...s.azureDeployments, nextDeployment],
          enabledModels: { ...s.enabledModels, [nextDeployment]: true },
        }));
        return true;
      },

      removeAzureDeployment: (value) => {
        const target = value.trim();
        if (!target) return;
        set((s) => {
          const azureDeployments = s.azureDeployments.filter(
            (deployment) => deployment !== target,
          );
          const enabledModels = { ...s.enabledModels };
          delete enabledModels[target];
          const modelProviderOverrides = { ...s.modelProviderOverrides };
          delete modelProviderOverrides[target];
          let selectedModelId = s.selectedModelId;
          if (selectedModelId === target || !enabledModels[selectedModelId]) {
            selectedModelId = pickFirstEnabled(enabledModels, azureDeployments);
            enabledModels[selectedModelId] = true;
          }
          return {
            azureDeployments,
            enabledModels,
            modelProviderOverrides,
            selectedModelId,
          };
        });
      },

      setLinearAutoSyncEnabled: (enabled) => set({ linearAutoSyncEnabled: enabled }),

      setLinearStatusMapping: (status, linearStateName) =>
        set((s) => ({
          linearStatusMappings: {
            ...s.linearStatusMappings,
            [status]: linearStateName?.trim() || null,
          },
        })),

      setSelectedModelId: (id) => {
        const enabled = get().enabledModels;
        if (!enabled[id]) {
          set({ enabledModels: { ...enabled, [id]: true } });
        }
        set({ selectedModelId: id });
      },

      setSelectedReasoningEffort: (effort) => set({ selectedReasoningEffort: effort }),

      setModelProviderOverride: (modelId, provider) =>
        set((s) => ({
          modelProviderOverrides: {
            ...s.modelProviderOverrides,
            [modelId]:
              CURATED_MODELS.some((model) => model.id === modelId) &&
              provider === "azure-openai-custom"
                ? "openai"
                : provider,
          },
        })),

      setModelEnabled: (id, enabled) => {
        const nextEnabled = { ...get().enabledModels, [id]: enabled };
        let nextSelected = get().selectedModelId;
        if (!nextEnabled[nextSelected]) {
          nextSelected = pickFirstEnabled(nextEnabled, get().azureDeployments);
          nextEnabled[nextSelected] = true;
        }
        set({ enabledModels: nextEnabled, selectedModelId: nextSelected });
      },

      ensureDefaults: () => {
        const enabled = get().enabledModels;
        const merged = { ...defaultEnabledModels(), ...enabled };
        for (const deployment of get().azureDeployments) {
          merged[deployment] = true;
        }
        let selected = get().selectedModelId;
        if (!merged[selected]) selected = pickFirstEnabled(merged, get().azureDeployments);
        set({ enabledModels: merged, selectedModelId: selected });
      },
    }),
    {
      name: "awencode-settings",
      version: 5,
      migrate: (persistedState) => {
        if (!persistedState || typeof persistedState !== "object") {
          return persistedState;
        }

        const nextState = { ...(persistedState as Record<string, unknown>) };
        const LEGACY_MODEL_IDS: Record<string, string> = {
          "google/gemini-3.1-pro": "google/gemini-3.1-pro-preview",
        };
        delete nextState.openAiApiKey;
        delete nextState.openRouterApiKey;
        delete nextState.azureApiKey;
        const legacyDeployment =
          typeof nextState.azureDeploymentName === "string"
            ? nextState.azureDeploymentName.trim()
            : "";
        const rawDeployments = Array.isArray(nextState.azureDeployments)
          ? nextState.azureDeployments
          : legacyDeployment
            ? [legacyDeployment]
            : [];
        nextState.azureDeployments = Array.from(
          new Set(
            rawDeployments
              .filter((value): value is string => typeof value === "string")
              .map((value) => value.trim())
              .filter(Boolean),
          ),
        );
        delete nextState.azureDeploymentName;
        if (
          nextState.modelProviderOverrides &&
          typeof nextState.modelProviderOverrides === "object"
        ) {
          nextState.modelProviderOverrides = Object.fromEntries(
            Object.entries(nextState.modelProviderOverrides as Record<string, unknown>)
              .filter(([, provider]) => provider !== "azure-openai-custom")
              .map(([modelId, provider]) => [LEGACY_MODEL_IDS[modelId] ?? modelId, provider]),
          );
        }
        if (nextState.enabledModels && typeof nextState.enabledModels === "object") {
          nextState.enabledModels = Object.fromEntries(
            Object.entries(nextState.enabledModels as Record<string, unknown>).map(
              ([modelId, enabled]) => [LEGACY_MODEL_IDS[modelId] ?? modelId, enabled],
            ),
          );
        }
        if (typeof nextState.selectedModelId === "string") {
          nextState.selectedModelId =
            LEGACY_MODEL_IDS[nextState.selectedModelId] ?? nextState.selectedModelId;
        }
        if (
          typeof nextState.selectedModelId === "string" &&
          !CURATED_MODELS.some((model) => model.id === nextState.selectedModelId) &&
          !(nextState.azureDeployments as string[]).includes(nextState.selectedModelId)
        ) {
          nextState.selectedModelId = DEFAULT_SELECTED_MODEL;
        }
        nextState.linearAutoSyncEnabled =
          typeof nextState.linearAutoSyncEnabled === "boolean"
            ? nextState.linearAutoSyncEnabled
            : true;
        const rawLinearMappings =
          nextState.linearStatusMappings && typeof nextState.linearStatusMappings === "object"
            ? (nextState.linearStatusMappings as Record<string, unknown>)
            : {};
        nextState.linearStatusMappings = {
          queued:
            typeof rawLinearMappings.queued === "string" && rawLinearMappings.queued.trim()
              ? rawLinearMappings.queued.trim()
              : null,
          active:
            typeof rawLinearMappings.active === "string" && rawLinearMappings.active.trim()
              ? rawLinearMappings.active.trim()
              : null,
          review:
            typeof rawLinearMappings.review === "string" && rawLinearMappings.review.trim()
              ? rawLinearMappings.review.trim()
              : null,
          deployed:
            typeof rawLinearMappings.deployed === "string" && rawLinearMappings.deployed.trim()
              ? rawLinearMappings.deployed.trim()
              : null,
        };
        return nextState;
      },
      partialize: (s) => ({
        azureBaseUrl: s.azureBaseUrl,
        azureDeployments: s.azureDeployments,
        linearAutoSyncEnabled: s.linearAutoSyncEnabled,
        linearStatusMappings: s.linearStatusMappings,
        selectedModelId: s.selectedModelId,
        modelProviderOverrides: s.modelProviderOverrides,
        selectedReasoningEffort: s.selectedReasoningEffort,
        enabledModels: s.enabledModels,
      }),
    },
  ),
);

function resolveModelById(
  modelId: string | null | undefined,
  state: Pick<SettingsState, "selectedModelId" | "modelProviderOverrides" | "azureDeployments">,
): CuratedModelOption {
  const normalizedModelId = modelId?.trim() || state.selectedModelId;
  const { modelProviderOverrides, azureDeployments } = state;
  const azureModels = buildAzureDeploymentModels(azureDeployments);
  const deploymentMatch = azureModels.find((model) => model.id === normalizedModelId);
  if (deploymentMatch) {
    return deploymentMatch;
  }

  const curatedBase =
    CURATED_MODELS.find((m) => m.id === normalizedModelId) ??
    CURATED_MODELS.find((m) => m.id === state.selectedModelId) ??
    CURATED_MODELS[0];

  const override = modelProviderOverrides[normalizedModelId];
  const provider =
    override && override !== "azure-openai-custom" ? override : curatedBase.provider;

  return { ...curatedBase, provider };
}

export function getModelById(modelId: string | null | undefined): CuratedModelOption {
  return resolveModelById(modelId, useSettingsStore.getState());
}

export function getSelectedModel(): CuratedModelOption {
  const state = useSettingsStore.getState();
  return resolveModelById(state.selectedModelId, state);
}

export function getModelDisplayName(modelId: string | null | undefined): string {
  const normalizedModelId = modelId?.trim();
  if (!normalizedModelId) return "";
  const { azureDeployments } = useSettingsStore.getState();
  const exactMatch = [...CURATED_MODELS, ...buildAzureDeploymentModels(azureDeployments)].find(
    (model) => model.id === normalizedModelId,
  );
  return exactMatch?.name ?? normalizedModelId;
}

export function getReasoningEffortOrDefault(
  effort: ReasoningEffort | null | undefined,
): ReasoningEffort {
  return effort ?? DEFAULT_REASONING_EFFORT;
}

export function getSelectedReasoningEffort(): ReasoningEffort {
  return getReasoningEffortOrDefault(useSettingsStore.getState().selectedReasoningEffort);
}

