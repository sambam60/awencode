const SHORTCUTS = [
  { key: "⌘K", action: "command" },
  { key: "Esc", action: "deselect" },
  { key: "D", action: "deploy" },
  { key: "N", action: "new agent" },
];

export function Footer() {
  return (
    <div className="px-7 py-2 border-t border-border-light flex gap-4.5 font-mono text-[10.5px] text-text-faint shrink-0">
      {SHORTCUTS.map(({ key, action }) => (
        <span key={key}>
          <kbd className="kbd-badge">{key}</kbd>{" "}
          {action}
        </span>
      ))}
    </div>
  );
}
