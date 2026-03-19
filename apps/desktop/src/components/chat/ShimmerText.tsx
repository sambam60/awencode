import { cn } from "@/lib/utils";

interface ShimmerTextProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Shimmer sweep animation for "thinking" / loading states.
 * Renders text with a moving highlight that sweeps left-to-right.
 */
export function ShimmerText({ children, className }: ShimmerTextProps) {
  return (
    <span
      className={cn(
        "inline-block bg-clip-text text-transparent animate-shimmer",
        className,
      )}
      style={{
        backgroundImage:
          "linear-gradient(90deg, var(--text-faint) 0%, var(--text-faint) 30%, var(--text-secondary) 50%, var(--text-faint) 70%, var(--text-faint) 100%)",
        backgroundSize: "200% 100%",
      }}
    >
      {children}
    </span>
  );
}
