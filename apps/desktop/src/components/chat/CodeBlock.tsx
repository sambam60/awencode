import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  className?: string;
}

export function CodeBlock({
  code,
  language,
  showLineNumbers = false,
  className,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const lines = code.split("\n");
  // Trim trailing empty line that often appears from template literals
  const trimmedLines =
    lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;

  return (
    <div
      className={cn(
        "rounded-lg border border-border-light overflow-hidden my-3 group",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-bg-secondary border-b border-border-light">
        <span className="label-mono">{language || "code"}</span>
        <button
          onClick={handleCopy}
          className={cn(
            "flex items-center gap-1.5 font-mono text-[10px] transition-all duration-150 cursor-pointer",
            copied
              ? "text-accent-green"
              : "text-text-faint hover:text-text-tertiary",
          )}
          title="Copy code"
        >
          {copied ? (
            <>
              <Check size={10} strokeWidth={2.5} />
              <span>copied</span>
            </>
          ) : (
            <>
              <Copy size={10} strokeWidth={2} />
              <span>copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code body */}
      <div className="overflow-x-auto bg-bg-card">
        <table className="w-full border-collapse">
          <tbody>
            {trimmedLines.map((line, i) => (
              <tr key={i} className="group/line hover:bg-bg-secondary/60">
                {showLineNumbers && (
                  <td className="select-none text-right pr-4 pl-3.5 py-0 font-mono text-[11px] text-text-faint w-8 align-top leading-6 border-r border-border-light/50">
                    {i + 1}
                  </td>
                )}
                <td
                  className={cn(
                    "py-0 font-mono text-[12px] text-text-primary leading-6 whitespace-pre",
                    showLineNumbers ? "pl-4 pr-4" : "px-4",
                  )}
                >
                  {line || " "}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* Padding row at bottom */}
        <div className="h-3" />
      </div>
    </div>
  );
}
