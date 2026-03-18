import { useState } from "react";
import { cn } from "@/lib/utils";
import { statusColor } from "@/lib/status";
import type { Agent } from "@/lib/stores/thread-store";

interface DetailPanelProps {
  agent: Agent;
  onClose: () => void;
  onOpenChat?: () => void;
}

const TABS = ["status", "chat", "files"] as const;
type Tab = (typeof TABS)[number];

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg-card border border-border-light rounded px-3 py-2.5">
      <div className="label-mono mb-1">{label}</div>
      <div className="text-lg font-medium text-text-primary">{value}</div>
    </div>
  );
}

function PrimaryButton({
  label,
  onClick,
}: {
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="bg-text-primary text-bg-card border border-text-primary text-[11.5px] font-medium px-3.5 py-[7px] rounded cursor-pointer hover:opacity-90 transition-opacity duration-120"
    >
      {label}
    </button>
  );
}

function SecondaryButton({
  label,
  onClick,
}: {
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="bg-transparent text-text-secondary border border-border text-[11.5px] font-medium px-3.5 py-[7px] rounded cursor-pointer hover:bg-bg-secondary transition-colors duration-120"
    >
      {label}
    </button>
  );
}

export function DetailPanel({ agent, onClose, onOpenChat }: DetailPanelProps) {
  const [tab, setTab] = useState<Tab>("status");
  const accent = statusColor(agent);

  return (
    <div
      className="w-[360px] h-full flex flex-col shrink-0 overflow-hidden rounded-l-[10px] border-l border-border-light glass-overlay"
    >
      {/* Header */}
      <div className="px-6 pt-6 pb-4.5">
        <div className="flex justify-between items-start mb-2.5">
          <div className="text-lg font-medium text-text-primary leading-tight flex-1 pr-3">
            {agent.title}
          </div>
          <button
            onClick={onClose}
            className="text-text-faint cursor-pointer text-base leading-none hover:text-text-secondary transition-colors duration-120"
          >
            ×
          </button>
        </div>
        <div className="flex gap-2 items-center">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: accent }}
          />
          <span
            className="font-mono text-[10px] font-semibold uppercase tracking-label-wide"
            style={{ color: accent }}
          >
            {agent.blocked ? "Blocked" : agent.status}
          </span>
          <span className="font-mono text-xs text-text-faint">
            {agent.branch}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 px-6 border-b border-border-light">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "bg-transparent border-none cursor-pointer font-mono text-xs font-medium uppercase tracking-label px-3.5 pt-2.5 pb-2",
              "transition-colors duration-120",
              tab === t
                ? "text-text-primary border-b-[1.5px] border-b-text-primary"
                : "text-text-tertiary border-b-[1.5px] border-b-transparent",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-6">
        {tab === "status" && (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-2.5">
              <StatCard label="Time" value={agent.time} />
              <StatCard label="Tokens" value={agent.tokens} />
              <StatCard label="Files" value={`${agent.files.length}`} />
              <StatCard label="Progress" value={`${agent.progress}%`} />
            </div>
            <div className="flex gap-2 flex-wrap">
              {agent.status === "review" && (
                <>
                  <PrimaryButton label="approve & deploy" />
                  <SecondaryButton label="request changes" />
                </>
              )}
              {agent.status === "active" && !agent.blocked && (
                <>
                  <SecondaryButton label="pause" />
                  <SecondaryButton label="redirect" />
                </>
              )}
              {agent.blocked && <PrimaryButton label="unblock & continue" />}
              {agent.status === "queued" && <PrimaryButton label="start now" />}
            </div>
          </div>
        )}

        {tab === "chat" && (
          <div className="flex flex-col h-full">
            <button
              onClick={onOpenChat}
              className="flex items-center justify-between w-full px-3 py-2 mb-3 bg-bg-card border border-border-light rounded cursor-pointer font-mono text-xs text-text-tertiary hover:bg-bg-secondary transition-colors duration-120"
            >
              <span>Open full view</span>
              <span className="text-base">↗</span>
            </button>

            <div className="flex-1 flex flex-col gap-2.5 mb-3">
              {agent.messages.length === 0 ? (
                <div className="text-sm text-text-faint italic">
                  No messages yet.
                </div>
              ) : (
                agent.messages.map((m, i) => (
                  <div
                    key={i}
                    className="px-3 py-2.5 bg-bg-card border border-border-light rounded"
                  >
                    <div
                      className={cn(
                        "font-mono text-2xs font-semibold uppercase tracking-label-wide mb-1.5",
                        m.role === "you"
                          ? "text-text-secondary"
                          : "text-text-faint",
                      )}
                    >
                      {m.role}
                    </div>
                    <div className="text-sm text-text-primary leading-relaxed">
                      {m.content}
                    </div>
                  </div>
                ))
              )}
            </div>

            {agent.status !== "queued" && agent.status !== "deployed" && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-bg-card border border-border rounded">
                <input
                  placeholder="Quick message..."
                  className="flex-1 bg-transparent border-none outline-none text-text-primary text-sm"
                />
                <span className="kbd-badge cursor-pointer">↵</span>
              </div>
            )}
          </div>
        )}

        {tab === "files" && (
          <div className="flex flex-col gap-1">
            {agent.files.length === 0 ? (
              <div className="text-sm text-text-faint italic">
                No files changed.
              </div>
            ) : (
              agent.files.map((f, i) => (
                <div
                  key={i}
                  className="font-mono text-[11.5px] text-text-secondary px-2.5 py-[7px] bg-bg-card border border-border-light rounded-[5px]"
                >
                  {f}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
