import { useState } from "react";
import { cn } from "@/lib/utils";
import { ModelSelector } from "../settings/ModelSelector";

interface OnboardingFlowProps {
  onComplete: () => void;
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState(0);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("o4-mini");

  const next = () => setStep((s) => s + 1);

  if (step === 0) {
    return <WelcomeStep onNext={next} />;
  }
  if (step === 1) {
    return (
      <ApiKeyStep apiKey={apiKey} setApiKey={setApiKey} onNext={next} />
    );
  }
  if (step === 2) {
    return (
      <ModelStep model={model} setModel={setModel} onNext={next} />
    );
  }
  if (step === 3) {
    return <WorkspaceStep onNext={next} />;
  }
  return <ReadyStep onComplete={onComplete} />;
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="h-screen flex">
      {/* Left panel */}
      <div className="flex-1 flex items-center justify-center relative bg-bg-secondary">
        {/* Subtle radial glow */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background:
              "radial-gradient(ellipse at 40% 50%, rgba(255,255,255,0.8), transparent 70%)",
          }}
        />
        <div className="relative flex items-center gap-4">
          <img
            src="/awencode_logo.svg"
            alt="awencode"
            className="h-10"
          />
          <div className="w-px h-8 bg-border" />
          <button
            onClick={onNext}
            className="text-sm text-text-tertiary hover:text-text-primary cursor-pointer transition-colors duration-150"
          >
            Begin onboarding
          </button>
        </div>
      </div>

      {/* Right panel -- 3D wireframe visual */}
      <div className="flex-1 bg-bg-primary relative overflow-hidden">
        <svg
          className="absolute inset-0 w-full h-full opacity-20"
          viewBox="0 0 400 400"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Wireframe metaball shapes */}
          <g stroke="var(--border-default)" strokeWidth="0.5">
            {Array.from({ length: 20 }, (_, i) => (
              <ellipse
                key={`h-${i}`}
                cx="200"
                cy="200"
                rx={60 + i * 8}
                ry={40 + i * 6}
                transform={`rotate(${i * 9} 200 200)`}
              />
            ))}
            {Array.from({ length: 15 }, (_, i) => (
              <ellipse
                key={`v-${i}`}
                cx="300"
                cy="300"
                rx={30 + i * 6}
                ry={20 + i * 4}
                transform={`rotate(${i * 12} 300 300)`}
              />
            ))}
            {Array.from({ length: 12 }, (_, i) => (
              <ellipse
                key={`s-${i}`}
                cx="120"
                cy="100"
                rx={20 + i * 5}
                ry={15 + i * 3}
                transform={`rotate(${i * 15} 120 100)`}
              />
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}

function StepLayout({
  step,
  title,
  children,
  onNext,
  nextLabel = "Continue",
  nextDisabled = false,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="h-screen flex items-center justify-center bg-bg-primary">
      <div className="w-full max-w-md px-6">
        <div className="label-mono mb-2">Step {step} of 4</div>
        <div className="text-xl font-semibold text-text-primary tracking-tight mb-6">
          {title}
        </div>
        {children}
        <button
          onClick={onNext}
          disabled={nextDisabled}
          className={cn(
            "mt-6 w-full py-2.5 rounded text-[11.5px] font-medium transition-all duration-120 cursor-pointer",
            nextDisabled
              ? "bg-bg-secondary text-text-faint border border-border-light"
              : "bg-text-primary text-bg-card border border-text-primary hover:opacity-90",
          )}
        >
          {nextLabel}
        </button>
      </div>
    </div>
  );
}

function ApiKeyStep({
  apiKey,
  setApiKey,
  onNext,
}: {
  apiKey: string;
  setApiKey: (v: string) => void;
  onNext: () => void;
}) {
  return (
    <StepLayout
      step={1}
      title="API key"
      onNext={onNext}
      nextDisabled={!apiKey.trim()}
    >
      <input
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="sk-..."
        autoFocus
        className="w-full px-3 py-2.5 bg-bg-input border border-border rounded text-sm text-text-primary placeholder:text-text-faint outline-none focus:border-border-focus transition-colors duration-120"
      />
      <div className="text-[11px] text-text-faint mt-2">
        Your OpenAI API key. Stored locally, never sent to our servers.
      </div>
    </StepLayout>
  );
}

function ModelStep({
  model,
  setModel,
  onNext,
}: {
  model: string;
  setModel: (v: string) => void;
  onNext: () => void;
}) {
  return (
    <StepLayout step={2} title="Default model" onNext={onNext}>
      <ModelSelector value={model} onChange={setModel} />
    </StepLayout>
  );
}

function WorkspaceStep({ onNext }: { onNext: () => void }) {
  const [dir, setDir] = useState("");

  const handleSelect = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false });
      if (selected) {
        setDir(selected as string);
      }
    } catch {
      setDir("/Users/you/projects/my-app");
    }
  };

  return (
    <StepLayout
      step={3}
      title="Workspace"
      onNext={onNext}
      nextDisabled={!dir}
    >
      <button
        onClick={handleSelect}
        className="w-full px-3 py-2.5 bg-bg-input border border-border rounded text-sm text-left cursor-pointer hover:border-border-focus transition-colors duration-120"
      >
        {dir ? (
          <span className="text-text-primary font-mono text-sm">{dir}</span>
        ) : (
          <span className="text-text-faint">Select a directory...</span>
        )}
      </button>
      <div className="text-[11px] text-text-faint mt-2">
        The root directory agents will work in.
      </div>
    </StepLayout>
  );
}

function ReadyStep({ onComplete }: { onComplete: () => void }) {
  return (
    <StepLayout
      step={4}
      title="Ready"
      onNext={onComplete}
      nextLabel="Launch orchestrator"
    >
      <div className="flex flex-col gap-3">
        <div className="px-4 py-3 bg-bg-card border border-border-light rounded-lg">
          <div className="text-sm text-text-primary mb-1">
            The orchestrator is your command center
          </div>
          <div className="text-[11px] text-text-tertiary leading-relaxed">
            Agents appear as cards on a board. You see their status at a glance,
            expand into conversations when needed, and control everything with
            keyboard shortcuts or the command bar (⌘K).
          </div>
        </div>
        <div className="px-4 py-3 bg-bg-card border border-border-light rounded-lg">
          <div className="text-sm text-text-primary mb-1">
            Dashboard first, chat second
          </div>
          <div className="text-[11px] text-text-tertiary leading-relaxed">
            Unlike other tools, the primary view is the state of your work — not
            a chat thread. Conversations are the detail, not the overview.
          </div>
        </div>
      </div>
    </StepLayout>
  );
}
