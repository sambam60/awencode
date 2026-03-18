import { useAppStore } from "./lib/stores/app-store";
import { useViewStore } from "./lib/stores/view-store";
import { useThreadStore } from "./lib/stores/thread-store";
import { useCodexNotifications } from "./hooks/useCodexNotifications";
import { Orchestrator } from "./components/orchestrator/Board";
import { ChatView } from "./components/chat/ChatView";
import { SettingsView } from "./components/settings/SettingsView";
import { OnboardingFlow } from "./components/onboarding/OnboardingFlow";
import { HomeScreen } from "./components/home/HomeScreen";
import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "./lib/stores/settings-store";

export default function App() {
  useCodexNotifications();
  const theme = useAppStore((s) => s.theme);
  const view = useViewStore((s) => s.view);
  const setView = useViewStore((s) => s.setView);
  const agents = useThreadStore((s) => s.agents);
  const selectedId = useThreadStore((s) => s.selectedAgentId);

  const chatAgent = agents.find((a) => a.id === selectedId) ?? null;

  useEffect(() => {
    // Best-effort: ensure Codex picks up persisted API keys on app launch.
    const { openAiApiKey, openRouterApiKey, azureApiKey } = useSettingsStore.getState();
    invoke("codex_set_api_keys", {
      openai_api_key: openAiApiKey,
      openrouter_api_key: openRouterApiKey,
      azure_api_key: azureApiKey,
    }).catch(() => {});
  }, []);

  return (
    <div className={theme === "dark" ? "dark" : ""}>
      <div className="h-screen flex flex-col overflow-hidden bg-bg-primary text-text-primary">
        {view === "home" && (
          <HomeScreen onOpenProject={() => setView("orchestrator")} />
        )}
        {view === "onboarding" && (
          <OnboardingFlow onComplete={() => setView("orchestrator")} />
        )}
        {view === "orchestrator" && <Orchestrator />}
        {view === "chat" && chatAgent && (
          <ChatView
            agent={chatAgent}
            onBack={() => setView("orchestrator")}
          />
        )}
        {view === "settings" && (
          <SettingsView onBack={() => setView("orchestrator")} />
        )}
      </div>
    </div>
  );
}
