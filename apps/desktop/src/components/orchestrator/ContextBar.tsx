export function ContextBar() {
  return (
    <div className="px-7 py-2 font-mono text-xs text-text-faint flex gap-4.5 items-center border-b border-border-light shrink-0">
      <span>
        main @{" "}
        <span className="text-text-tertiary">a7f2c1d</span>
      </span>
      <span className="text-border">·</span>
      <span>staging synced</span>
      <span className="text-border">·</span>
      <span>last deploy 11:24</span>
      <span className="text-border">·</span>
      <span>strict ts, prisma, tailwind</span>
    </div>
  );
}
