import { useAppStore } from "./lib/stores/app-store";
import { useViewStore } from "./lib/stores/view-store";
import { useThreadStore } from "./lib/stores/thread-store";
import { Orchestrator } from "./components/orchestrator/Board";
import { ChatView } from "./components/chat/ChatView";
import { SettingsView } from "./components/settings/SettingsView";
import { OnboardingFlow } from "./components/onboarding/OnboardingFlow";
import { HomeScreen } from "./components/home/HomeScreen";

export default function App() {
  const theme = useAppStore((s) => s.theme);
  const view = useViewStore((s) => s.view);
  const setView = useViewStore((s) => s.setView);
  const agents = useThreadStore((s) => s.agents);
  const selectedId = useThreadStore((s) => s.selectedAgentId);

  const chatAgent = agents.find((a) => a.id === selectedId) ?? null;

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
