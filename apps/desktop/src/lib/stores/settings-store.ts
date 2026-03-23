import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ModelProviderId = "openai" | "openrouter" | "azure-openai-custom";

export type ReasoningEffort = "low" | "medium" | "high" | "xhigh";

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
    id: "google/gemini-3.1-pro",
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
  setSelectedModelId: (id: string) => void;
  setModelProviderOverride: (modelId: string, provider: ModelProviderId) => void;
  setSelectedReasoningEffort: (effort: ReasoningEffort) => void;
  setModelEnabled: (id: string, enabled: boolean) => void;
  ensureDefaults: () => void;
}

const DEFAULT_SELECTED_MODEL = "gpt-5.3-codex";
const DEFAULT_REASONING_EFFORT: ReasoningEffort = "medium";

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
      version: 3,
      migrate: (persistedState) => {
        if (!persistedState || typeof persistedState !== "object") {
          return persistedState;
        }

        const nextState = { ...(persistedState as Record<string, unknown>) };
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
            Object.entries(nextState.modelProviderOverrides as Record<string, unknown>).filter(
              ([, provider]) => provider !== "azure-openai-custom",
            ),
          );
        }
        if (
          typeof nextState.selectedModelId === "string" &&
          !CURATED_MODELS.some((model) => model.id === nextState.selectedModelId) &&
          !(nextState.azureDeployments as string[]).includes(nextState.selectedModelId)
        ) {
          nextState.selectedModelId = DEFAULT_SELECTED_MODEL;
        }
        return nextState;
      },
      partialize: (s) => ({
        azureBaseUrl: s.azureBaseUrl,
        azureDeployments: s.azureDeployments,
        selectedModelId: s.selectedModelId,
        modelProviderOverrides: s.modelProviderOverrides,
        selectedReasoningEffort: s.selectedReasoningEffort,
        enabledModels: s.enabledModels,
      }),
    },
  ),
);

export function getSelectedModel(): CuratedModelOption {
  const { selectedModelId, modelProviderOverrides, azureDeployments } =
    useSettingsStore.getState();
  const azureModels = buildAzureDeploymentModels(azureDeployments);
  const deploymentMatch = azureModels.find((model) => model.id === selectedModelId);
  if (deploymentMatch) {
    return deploymentMatch;
  }

  const curatedBase =
    CURATED_MODELS.find((m) => m.id === selectedModelId) ?? CURATED_MODELS[0];

  const override = modelProviderOverrides[selectedModelId];
  const provider =
    override && override !== "azure-openai-custom" ? override : curatedBase.provider;

  return { ...curatedBase, provider };
}

export function getSelectedReasoningEffort(): ReasoningEffort {
  const { selectedReasoningEffort } = useSettingsStore.getState();
  return selectedReasoningEffort ?? DEFAULT_REASONING_EFFORT;
}

