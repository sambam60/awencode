import { useState } from "react";

interface CodeBlockProps {
  code: string;
  language?: string;
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded-lg border border-border-light overflow-hidden my-2">
      <div className="flex items-center justify-between px-3 py-1.5 bg-bg-secondary border-b border-border-light">
        <span className="label-mono">{language || "code"}</span>
        <button
          onClick={handleCopy}
          className="font-mono text-[10px] text-text-faint hover:text-text-tertiary cursor-pointer transition-colors duration-120"
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="p-3 bg-bg-card overflow-x-auto">
        <code className="font-mono text-sm text-text-primary leading-relaxed">
          {code}
        </code>
      </pre>
    </div>
  );
}
