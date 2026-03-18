interface ToolCallCardProps {
  tool: string;
  input: string;
  output?: string;
  status: "running" | "success" | "error";
}

export function ToolCallCard({
  tool,
  input,
  output,
  status,
}: ToolCallCardProps) {
  const statusIndicator = {
    running: { color: "var(--accent-blue)", label: "running" },
    success: { color: "var(--accent-green)", label: "completed" },
    error: { color: "var(--accent-red)", label: "failed" },
  }[status];

  return (
    <div className="border border-border-light rounded-lg overflow-hidden my-2">
      <div className="flex items-center gap-2 px-3 py-2 bg-bg-secondary border-b border-border-light">
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: statusIndicator.color }}
        />
        <span className="label-mono">{tool}</span>
        <span
          className="font-mono text-[10px] ml-auto"
          style={{ color: statusIndicator.color }}
        >
          {statusIndicator.label}
        </span>
      </div>
      <div className="p-3 bg-bg-card">
        <pre className="font-mono text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
          {input}
        </pre>
        {output && (
          <div className="mt-2 pt-2 border-t border-border-light">
            <pre className="font-mono text-sm text-text-faint whitespace-pre-wrap leading-relaxed">
              {output}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
