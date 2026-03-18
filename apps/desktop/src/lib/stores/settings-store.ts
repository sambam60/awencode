import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ModelProviderId = "openai" | "openrouter" | "azure-openai";

export type ReasoningEffort = "low" | "medium" | "high" | "xhigh";

export interface CuratedModelOption {
  id: string;
  provider: ModelProviderId;
  name: string;
  description: string;
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
  openAiApiKey: string;
  openRouterApiKey: string;
  azureApiKey: string;
  azureBaseUrl: string;
  azureDeploymentName: string;

  /** Selected model (must be enabled; store enforces this). */
  selectedModelId: string;
  /** Optional per-model provider override (e.g. use azure-openai for GPT models). */
  modelProviderOverrides: Record<string, ModelProviderId>;
  /** Reasoning effort for turn/start (low|medium|high). */
  selectedReasoningEffort: ReasoningEffort;
  /** Enabled models shown as “available” in the UI. */
  enabledModels: Record<string, boolean>;

  setOpenAiApiKey: (value: string) => void;
  setOpenRouterApiKey: (value: string) => void;
  setAzureApiKey: (value: string) => void;
  setAzureBaseUrl: (value: string) => void;
  setAzureDeploymentName: (value: string) => void;
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

function pickFirstEnabled(enabled: Record<string, boolean>): string {
  const found = CURATED_MODELS.find((m) => enabled[m.id]);
  return found?.id ?? DEFAULT_SELECTED_MODEL;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      openRouterApiKey: "",
      openAiApiKey: "",
      azureApiKey: "",
      azureBaseUrl: "",
      azureDeploymentName: "",

      selectedModelId: DEFAULT_SELECTED_MODEL,
      modelProviderOverrides: {},
      selectedReasoningEffort: DEFAULT_REASONING_EFFORT,
      enabledModels: defaultEnabledModels(),

      setOpenAiApiKey: (value) => set({ openAiApiKey: value }),
      setOpenRouterApiKey: (value) => set({ openRouterApiKey: value }),
      setAzureApiKey: (value) => set({ azureApiKey: value }),
      setAzureBaseUrl: (value) => set({ azureBaseUrl: value }),
      setAzureDeploymentName: (value) => set({ azureDeploymentName: value }),

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
          modelProviderOverrides: { ...s.modelProviderOverrides, [modelId]: provider },
        })),

      setModelEnabled: (id, enabled) => {
        const nextEnabled = { ...get().enabledModels, [id]: enabled };
        let nextSelected = get().selectedModelId;
        if (!nextEnabled[nextSelected]) {
          nextSelected = pickFirstEnabled(nextEnabled);
          nextEnabled[nextSelected] = true;
        }
        set({ enabledModels: nextEnabled, selectedModelId: nextSelected });
      },

      ensureDefaults: () => {
        const enabled = get().enabledModels;
        const merged = { ...defaultEnabledModels(), ...enabled };
        let selected = get().selectedModelId;
        if (!merged[selected]) selected = pickFirstEnabled(merged);
        set({ enabledModels: merged, selectedModelId: selected });
      },
    }),
    {
      name: "awencode-settings",
      version: 1,
      partialize: (s) => ({
        openAiApiKey: s.openAiApiKey,
        openRouterApiKey: s.openRouterApiKey,
        azureApiKey: s.azureApiKey,
        azureBaseUrl: s.azureBaseUrl,
        azureDeploymentName: s.azureDeploymentName,
        selectedModelId: s.selectedModelId,
        modelProviderOverrides: s.modelProviderOverrides,
        selectedReasoningEffort: s.selectedReasoningEffort,
        enabledModels: s.enabledModels,
      }),
    },
  ),
);

export function getSelectedModel(): CuratedModelOption {
  const { selectedModelId, modelProviderOverrides, azureDeploymentName } =
    useSettingsStore.getState();
  const base =
    CURATED_MODELS.find((m) => m.id === selectedModelId) ?? CURATED_MODELS[0];

  const override = modelProviderOverrides[selectedModelId];
  const provider = override ?? base.provider;

  // Translate model id for provider-specific routing
  if (provider === "openrouter" && isGptFamilyModelId(base.id)) {
    return { ...base, provider, id: `openai/${base.id}` };
  }
  if (provider === "azure-openai" && isGptFamilyModelId(base.id)) {
    const deployment = azureDeploymentName.trim();
    return { ...base, provider, id: deployment || base.id };
  }

  return { ...base, provider };
}

export function getSelectedReasoningEffort(): ReasoningEffort {
  const { selectedReasoningEffort } = useSettingsStore.getState();
  return selectedReasoningEffort ?? DEFAULT_REASONING_EFFORT;
}

