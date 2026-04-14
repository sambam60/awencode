import { useAppStore } from "./lib/stores/app-store";
import { useViewStore } from "./lib/stores/view-store";
import { useThreadStore } from "./lib/stores/thread-store";
import { useCodexNotifications } from "./hooks/useCodexNotifications";
import { useLinearIssueStatusSync } from "./hooks/useLinearIssueStatusSync";
import { Orchestrator } from "./components/orchestrator/Board";
import { ChatView } from "./components/chat/ChatView";
import { SettingsView } from "./components/settings/SettingsView";
import { OnboardingFlow } from "./components/onboarding/OnboardingFlow";
import { HomeScreen } from "./components/home/HomeScreen";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useProjectWorkspaceBridge } from "./hooks/useProjectWorkspaceBridge";
import { useProjectGitBridge } from "./hooks/useProjectGitBridge";
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

  /* Tailwind `darkMode: "class"` and design tokens in global.css expect `html.dark`, not only a nested wrapper. */
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  useEffect(() => {
    getCurrentWindow()
      .setTheme(theme === "system" ? null : theme)
      .catch(() => {});
    invoke("sync_window_theme", { theme }).catch(() => {});
  }, [theme]);

  return (
    <div id={THEME_ROOT_ELEMENT_ID} className="h-screen" style={{ background: "transparent" }}>
      {children}
    </div>
  );
}

export default function App() {
  useProjectWorkspaceBridge();
  useProjectGitBridge();
  useCodexNotifications();
  useLinearIssueStatusSync();
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

  return (
    <ThemeClassRoot>
      <div className="h-screen flex flex-col overflow-hidden text-text-primary">
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
