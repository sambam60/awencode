import { cn } from "@/lib/utils";

const MODELS = [
  { id: "o3", name: "o3", description: "Most capable reasoning model" },
  { id: "o4-mini", name: "o4-mini", description: "Fast and cost-effective" },
  { id: "gpt-4.1", name: "gpt-4.1", description: "Balanced performance" },
];

interface ModelSelectorProps {
  value: string;
  onChange: (model: string) => void;
}

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="label-mono mb-1">Model</div>
      {MODELS.map((model) => (
        <button
          key={model.id}
          onClick={() => onChange(model.id)}
          className={cn(
            "flex items-center justify-between px-4 py-3 rounded-lg border cursor-pointer transition-all duration-120 text-left",
            value === model.id
              ? "border-border-focus bg-bg-card"
              : "border-border-light bg-bg-secondary hover:border-border",
          )}
        >
          <div>
            <div className="text-sm font-medium text-text-primary">
              {model.name}
            </div>
            <div className="text-[11px] text-text-tertiary mt-0.5">
              {model.description}
            </div>
          </div>
          {value === model.id && (
            <span className="text-accent-blue font-mono text-xs">●</span>
          )}
        </button>
      ))}
    </div>
  );
}
