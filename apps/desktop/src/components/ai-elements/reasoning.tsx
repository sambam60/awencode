import type { ComponentProps, ReactNode } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Shimmer } from "./Shimmer";

interface ReasoningContextValue {
  isStreaming: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  duration: number | undefined;
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

export function useReasoning() {
  const context = useContext(ReasoningContext);
  if (!context) {
    throw new Error("Reasoning subcomponents must be used within Reasoning");
  }
  return context;
}

export type ReasoningProps = ComponentProps<typeof Collapsible> & {
  isStreaming?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Elapsed seconds (after stream ends); drives “Thought for Ns”. */
  duration?: number;
};

const MS_IN_S = 1000;

export const Reasoning = memo(
  ({
    className,
    isStreaming = false,
    open,
    defaultOpen = false,
    onOpenChange,
    duration: durationProp,
    children,
    ...props
  }: ReasoningProps) => {
    const [isOpen, setIsOpenState] = useState(open ?? defaultOpen);
    const [duration, setDuration] = useState<number | undefined>(durationProp);
    const startTimeRef = useRef<number | null>(null);

    useEffect(() => {
      if (open !== undefined) setIsOpenState(open);
    }, [open]);

    useEffect(() => {
      if (durationProp !== undefined) setDuration(durationProp);
    }, [durationProp]);

    useEffect(() => {
      if (durationProp !== undefined) {
        if (!isStreaming) startTimeRef.current = null;
        return;
      }
      if (isStreaming) {
        if (startTimeRef.current === null) {
          startTimeRef.current = Date.now();
        }
      } else if (startTimeRef.current !== null) {
        setDuration(Math.ceil((Date.now() - startTimeRef.current) / MS_IN_S));
        startTimeRef.current = null;
      }
    }, [isStreaming, durationProp]);

    const setIsOpen = useCallback(
      (v: boolean) => {
        setIsOpenState(v);
        onOpenChange?.(v);
      },
      [onOpenChange],
    );

    const contextValue = useMemo(
      () => ({ duration, isOpen, isStreaming, setIsOpen }),
      [duration, isOpen, isStreaming, setIsOpen],
    );

    return (
      <ReasoningContext.Provider value={contextValue}>
        <Collapsible
          open={isOpen}
          onOpenChange={setIsOpen}
          className={cn("animate-fade-in-reasoning", className)}
          {...props}
        >
          {children}
        </Collapsible>
      </ReasoningContext.Provider>
    );
  },
);

export type ReasoningTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  getThinkingMessage?: (isStreaming: boolean, duration?: number) => ReactNode;
};

const defaultGetThinkingMessage = (isStreaming: boolean, duration?: number) => {
  if (isStreaming || duration === 0) {
    return "Thinking...";
  }
  if (duration === undefined) {
    return "Thought for a few seconds";
  }
  return `Thought for ${duration}s`;
};

export const ReasoningTrigger = memo(
  ({
    className,
    children,
    getThinkingMessage = defaultGetThinkingMessage,
    ...props
  }: ReasoningTriggerProps) => {
    const { isStreaming, duration } = useReasoning();

    return (
      <CollapsibleTrigger
        className={cn(
          "group inline-flex w-full max-w-full items-center gap-1.5 py-0.5 text-left font-sans text-xs text-text-tertiary transition-colors duration-150 hover:text-text-secondary cursor-pointer select-none",
          className,
        )}
        {...props}
      >
        {children ?? (
          <>
            {isStreaming ? (
              <Shimmer duration={2.8} spread={0.7} className="text-xs text-text-tertiary">
                Thinking...
              </Shimmer>
            ) : (
              <span>{getThinkingMessage(isStreaming, duration)}</span>
            )}
            <ChevronRight
              size={12}
              className="shrink-0 text-text-faint transition-transform duration-200 group-data-[state=open]:rotate-90"
            />
          </>
        )}
      </CollapsibleTrigger>
    );
  },
);

export type ReasoningContentProps = ComponentProps<typeof CollapsibleContent> & {
  children: string;
};

export const ReasoningContent = memo(
  ({ className, children, ...props }: ReasoningContentProps) => {
    const { isStreaming } = useReasoning();

    return (
      <CollapsibleContent
        className={cn(
          "overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down",
          className,
        )}
        {...props}
      >
        <div className="pl-4 pt-1 pb-2 font-sans text-xs leading-relaxed text-text-tertiary whitespace-pre-wrap">
          {isStreaming ? (
            <Shimmer duration={2.8} spread={0.8} className="text-text-tertiary">
              {children}
            </Shimmer>
          ) : (
            children
          )}
        </div>
      </CollapsibleContent>
    );
  },
);

Reasoning.displayName = "Reasoning";
ReasoningTrigger.displayName = "ReasoningTrigger";
ReasoningContent.displayName = "ReasoningContent";
