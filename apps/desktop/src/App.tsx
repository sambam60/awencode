import { useAppStore } from "./lib/stores/app-store";
import { useViewStore } from "./lib/stores/view-store";
import { useThreadStore } from "./lib/stores/thread-store";
import { useCodexNotifications } from "./hooks/useCodexNotifications";
import { Orchestrator } from "./components/orchestrator/Board";
import { ChatView } from "./components/chat/ChatView";
import { SettingsView } from "./components/settings/SettingsView";
import { OnboardingFlow } from "./components/onboarding/OnboardingFlow";
import { HomeScreen } from "./components/home/HomeScreen";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "./lib/stores/settings-store";
import { useProjectWorkspaceBridge } from "./hooks/useProjectWorkspaceBridge";
import { THEME_ROOT_ELEMENT_ID } from "./lib/theme-root";

function ThemeClassRoot({ children }: { children: React.ReactNode }) {
  const theme = useAppStore((s) => s.theme);
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false,
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener("change", onChange);
    onChange();
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const isDark = theme === "dark" || (theme === "system" && systemDark);

  return (
    <div id={THEME_ROOT_ELEMENT_ID} className={isDark ? "dark" : ""}>
      {children}
    </div>
  );
}

export default function App() {
  useProjectWorkspaceBridge();
  useCodexNotifications();
  const view = useViewStore((s) => s.view);
  const setView = useViewStore((s) => s.setView);
  const agents = useThreadStore((s) => s.agents);
  const selectedId = useThreadStore((s) => s.selectedAgentId);

  const chatAgent = agents.find((a) => a.id === selectedId) ?? null;

  useEffect(() => {
    if (view === "chat" && !chatAgent) {
      setView("orchestrator");
    }
  }, [view, chatAgent, setView]);

  useEffect(() => {
    // Best-effort: ensure Codex picks up persisted API keys on app launch.
    const { openAiApiKey, openRouterApiKey, azureApiKey } = useSettingsStore.getState();
    invoke("codex_set_api_keys", {
      openaiApiKey: openAiApiKey,
      openrouterApiKey: openRouterApiKey,
      azureApiKey: azureApiKey,
    }).catch(() => {});
  }, []);

  return (
    <ThemeClassRoot>
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
            key={chatAgent.id}
            agent={chatAgent}
            onBack={() => setView("orchestrator")}
          />
        )}
        {view === "settings" && (
          <SettingsView onBack={() => setView("orchestrator")} />
        )}
      </div>
    </ThemeClassRoot>
  );
}
