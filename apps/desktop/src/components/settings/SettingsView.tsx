import { useState } from "react";
import { ModelSelector } from "./ModelSelector";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/stores/app-store";

const APPROVAL_MODES = [
  { id: "auto", label: "Auto-approve", description: "Agent runs without interruption" },
  { id: "suggest", label: "Suggest", description: "Agent suggests, you approve" },
  { id: "manual", label: "Manual", description: "Full manual control" },
];

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
  const [model, setModel] = useState("o4-mini");
  const [approvalMode, setApprovalMode] = useState("suggest");
  const [apiKey, setApiKey] = useState("");
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      {/* Blank draggable header — reserves space for traffic lights, avoids collision with Back to app */}
      <div
        data-tauri-drag-region
        className="h-11 shrink-0 pl-[92px] pr-5 pt-1.5 border-b border-border-light"
        aria-hidden
      />
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
              <GeneralSection
                apiKey={apiKey}
                setApiKey={setApiKey}
                model={model}
                setModel={setModel}
                approvalMode={approvalMode}
                setApprovalMode={setApprovalMode}
              />
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
    <div className="flex items-start justify-between gap-8 py-4 border-b border-border-light last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-text-primary">{label}</div>
        {description && (
          <div className="text-[11.5px] text-text-tertiary mt-0.5 leading-relaxed">
            {description}
          </div>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function GeneralSection({
  apiKey,
  setApiKey,
  model,
  setModel,
  approvalMode,
  setApprovalMode,
}: {
  apiKey: string;
  setApiKey: (v: string) => void;
  model: string;
  setModel: (v: string) => void;
  approvalMode: string;
  setApprovalMode: (v: string) => void;
}) {
  return (
    <div>
      <SectionHeading title="General" />

      <div className="bg-bg-card border border-border-light rounded-lg overflow-hidden mb-6">
        <SettingsRow label="API Key" description="OpenAI API key for model access">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            className="w-[220px] px-3 py-1.5 bg-bg-input border border-border rounded text-[12.5px] text-text-primary placeholder:text-text-faint outline-none focus:border-border-focus transition-colors duration-120"
          />
        </SettingsRow>

        <SettingsRow label="Approval Mode" description="How the agent requests permission to act">
          <div className="flex gap-1">
            {["auto", "suggest", "manual"].map((mode) => (
              <button
                key={mode}
                onClick={() => setApprovalMode(mode)}
                className={cn(
                  "px-3 py-1.5 rounded text-[11.5px] font-mono uppercase tracking-wide transition-all duration-120 cursor-pointer",
                  approvalMode === mode
                    ? "bg-text-primary text-bg-card"
                    : "bg-bg-secondary border border-border text-text-secondary hover:border-border-focus hover:text-text-primary",
                )}
              >
                {mode}
              </button>
            ))}
          </div>
        </SettingsRow>
      </div>

      <div className="mb-2">
        <div className="label-mono mb-3">Model</div>
        <ModelSelector value={model} onChange={setModel} />
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
                ? "bg-text-primary border-text-primary"
                : "bg-bg-secondary border-border",
            )}
          >
            <span
              className={cn(
                "inline-block h-3.5 w-3.5 rounded-full bg-bg-card shadow-sm transition-transform duration-150",
                theme === "dark" ? "translate-x-4" : "translate-x-0.5",
              )}
            />
          </button>
        </SettingsRow>
      </div>
    </div>
  );
}

function McpSection() {
  return (
    <div>
      <SectionHeading
        title="MCP Servers"
        description="Connect external tools and data sources."
      />

      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="label-mono">Custom servers</span>
          <button className="text-[11.5px] text-text-secondary hover:text-text-primary transition-colors duration-120 cursor-pointer">
            + Add server
          </button>
        </div>
        <div className="bg-bg-card border border-border-light rounded-lg overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between">
            <span className="text-[13px] text-text-primary">unityMCP</span>
            <div className="flex items-center gap-2">
              <button className="text-text-faint hover:text-text-secondary transition-colors duration-120 cursor-pointer">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M5.5 8a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0Z" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
              <div className="relative inline-flex h-5 w-9 items-center rounded-full border border-border bg-bg-secondary cursor-not-allowed opacity-50">
                <span className="inline-block h-3.5 w-3.5 rounded-full bg-bg-card shadow-sm translate-x-0.5" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="label-mono">Recommended servers</span>
          <button className="text-[11.5px] text-text-secondary hover:text-text-primary transition-colors duration-120 cursor-pointer flex items-center gap-1">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M10 6A4 4 0 1 1 6 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <path d="M6 2l2-2M6 2l2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Refresh
          </button>
        </div>
        <div className="bg-bg-card border border-border-light rounded-lg overflow-hidden divide-y divide-border-light">
          {[
            { name: "Linear", author: "Linear", description: "Integrate with Linear's issue tracking and project management", enabled: true },
            { name: "Notion", author: "Notion", description: "Read docs, update pages, manage tasks", enabled: false },
            { name: "Figma", author: "Figma", description: "Generate better code by bringing in full Figma context", enabled: false },
            { name: "Playwright", author: "Microsoft", description: "Integrate browser automation to implement and test UI.", enabled: false },
          ].map((server) => (
            <div key={server.name} className="px-4 py-3 flex items-center gap-3">
              <div className="w-7 h-7 rounded bg-bg-secondary border border-border-light flex items-center justify-center shrink-0">
                <span className="font-mono text-[10px] text-text-tertiary">{server.name[0]}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-text-primary">
                  {server.name}{" "}
                  <span className="text-text-faint font-normal">by {server.author}</span>
                </div>
                <div className="text-[11px] text-text-tertiary mt-0.5 truncate">
                  {server.description}
                </div>
              </div>
              {server.enabled ? (
                <div className="relative inline-flex h-5 w-9 items-center rounded-full border border-accent-blue bg-accent-blue cursor-pointer shrink-0">
                  <span className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm translate-x-4" />
                </div>
              ) : (
                <button className="shrink-0 px-3 py-1 text-[11.5px] font-medium text-text-secondary border border-border rounded hover:border-border-focus hover:text-text-primary transition-all duration-120 cursor-pointer">
                  Install
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
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
