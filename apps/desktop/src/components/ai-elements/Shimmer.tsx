import type { ElementType } from "react";
import { memo } from "react";
import { cn } from "@/lib/utils";

export interface ShimmerProps {
  children: string;
  as?: ElementType;
  className?: string;
  duration?: number;
  spread?: number;
}

/**
 * Text shimmer (gradient clip) — matches ai-elements pattern; uses currentColor.
 */
function ShimmerComponent({
  children,
  className,
  duration = 3,
}: ShimmerProps) {
  return (
    <span
      className={cn(
        "inline-block bg-[length:300%_100%] bg-no-repeat text-transparent animate-shimmer-ai [background-clip:text] [-webkit-background-clip:text] [-webkit-text-fill-color:transparent]",
        className,
      )}
      style={{
        ["--shimmer-ai-duration" as string]: `${duration}s`,
        backgroundImage:
          "linear-gradient(90deg, currentColor 25%, color-mix(in srgb, currentColor 30%, transparent) 50%, currentColor 75%)",
      }}
    >
      {children}
    </span>
  );
}

export const Shimmer = memo(ShimmerComponent);
