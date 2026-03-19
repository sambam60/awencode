import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { statusColor } from "@/lib/status";
import type { Agent, PrStatus } from "@/lib/stores/thread-store";

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

function PrStatusRow({
  icon,
  label,
  action,
  iconColor,
}: {
  icon: React.ReactNode;
  label: string;
  action?: React.ReactNode;
  iconColor?: string;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border-light last:border-b-0">
      <span className={cn("shrink-0", iconColor)}>{icon}</span>
      <span className="flex-1 text-[12.5px] text-text-primary">{label}</span>
      {action && <span className="shrink-0">{action}</span>}
    </div>
  );
}

function PrStatusCard({ prStatus, prUrl }: { prStatus: PrStatus; prUrl: string | null }) {
  const checksIcon =
    prStatus.checksState === "success" ? (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6.5" stroke="#3a9d63" />
        <path d="M4 7l2 2 4-4" stroke="#3a9d63" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ) : prStatus.checksState === "failure" ? (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6.5" stroke="#c0392b" />
        <path d="M4.5 4.5l5 5M9.5 4.5l-5 5" stroke="#c0392b" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ) : prStatus.checksState === "pending" ? (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6.5" stroke="#9b9ea4" />
        <circle cx="7" cy="7" r="2" fill="#9b9ea4" />
      </svg>
    ) : (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6.5" stroke="#9b9ea4" strokeDasharray="2 2" />
      </svg>
    );

  const checksLabel =
    prStatus.checksState === "success"
      ? "Checks successful"
      : prStatus.checksState === "failure"
        ? "Checks failing"
        : prStatus.checksState === "pending"
          ? "Checks running"
          : "No checks";

  const approvalsIcon = (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="6.5" stroke="#9b9ea4" />
      <path d="M4.5 7.5a2 2 0 1 1 4 0" stroke="#9b9ea4" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="7" cy="5" r="1.2" fill="#9b9ea4" />
    </svg>
  );

  const commentsIcon = (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1.5" y="2.5" width="11" height="8" rx="1.5" stroke="#9b9ea4" strokeWidth="1.2" />
      <path d="M4 9.5l1.5 2" stroke="#9b9ea4" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M4 6h6M4 8h4" stroke="#9b9ea4" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );

  const mergeIcon = (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M3 3v8M11 5v6M3 11a2 2 0 0 0 4 0M3 3a2 2 0 0 1 4 0v2a2 2 0 0 0 4 0" stroke="#9b9ea4" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  return (
    <div className="border border-border-light rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-light bg-bg-secondary">
        <img src="/octicon.svg" alt="" className="w-3 h-3 opacity-40 dark:invert shrink-0" />
        <span className="font-mono text-[9.5px] text-text-faint uppercase tracking-widest">PR status</span>
        {prUrl && (
          <a
            href={prUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-auto font-mono text-[9.5px] text-text-faint hover:text-text-secondary transition-colors duration-120"
            onClick={(e) => { e.stopPropagation(); }}
          >
            {prStatus.prNumber ? `#${prStatus.prNumber}` : "view ↗"}
          </a>
        )}
      </div>
      <div className="px-3 divide-y divide-border-light">
        <PrStatusRow icon={checksIcon} label={checksLabel} />
        <PrStatusRow
          icon={approvalsIcon}
          label={prStatus.approvals === 0 ? "No approvals yet" : `${prStatus.approvals} approval${prStatus.approvals === 1 ? "" : "s"}`}
        />
        {prStatus.comments > 0 && (
          <PrStatusRow
            icon={commentsIcon}
            label={`${prStatus.comments} comment${prStatus.comments === 1 ? "" : "s"}`}
            action={
              prUrl ? (
                <a
                  href={prUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2 py-0.5 text-[10.5px] text-text-secondary border border-border-default rounded hover:bg-bg-secondary transition-colors duration-120 font-sans"
                >
                  Address all
                </a>
              ) : undefined
            }
          />
        )}
        <PrStatusRow
          icon={mergeIcon}
          label={prStatus.mergeable ? "Ready to merge" : "Not ready to merge"}
          action={
            prStatus.mergeable && prUrl ? (
              <a
                href={prUrl}
                target="_blank"
                rel="noreferrer"
                className="px-2 py-0.5 text-[10.5px] text-text-secondary border border-border-default rounded hover:bg-bg-secondary transition-colors duration-120 font-sans"
              >
                Merge
              </a>
            ) : undefined
          }
        />
      </div>
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
        <div className="flex gap-2 items-center flex-wrap">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: accent }}
          />
          <span
            className="font-mono text-[10px] font-semibold uppercase tracking-label-wide"
            style={{ color: accent }}
          >
            {agent.blocked ? "Blocked" : agent.status}
          </span>
          <span className="font-mono text-[10px] text-text-faint flex items-center gap-1">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="opacity-50 shrink-0">
              <path fillRule="evenodd" d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM4.25 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5z" />
            </svg>
            {agent.branch}
          </span>
          {agent.originUrl && (() => {
            const m = agent.originUrl.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
            if (!m) return null;
            const repoUrl = `https://github.com/${m[1]}`;
            return (
              <a
                href={repoUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 font-mono text-[10px] text-text-faint hover:text-text-secondary transition-colors duration-120"
                onClick={(e) => e.stopPropagation()}
              >
                <img src="/octicon.svg" alt="" className="w-2.5 h-2.5 opacity-35 dark:invert shrink-0" />
                <span>{m[1]}</span>
              </a>
            );
          })()}
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

            {/* PR status from GitHub */}
            {agent.prStatus && (
              <PrStatusCard
                prStatus={agent.prStatus}
                prUrl={agent.prStatus.prUrl}
              />
            )}

            {/* Placeholder when there's a PR number but no fetched status yet */}
            {!agent.prStatus && agent.pr && agent.originUrl && (() => {
              const m = agent.originUrl.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
              if (!m) return null;
              const prNum = agent.pr.replace("#", "");
              const prUrl = `https://github.com/${m[1]}/pull/${prNum}`;
              return (
                <div className="border border-border-light rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-border-light bg-bg-secondary">
                    <img src="/octicon.svg" alt="" className="w-3 h-3 opacity-40 dark:invert shrink-0" />
                    <span className="font-mono text-[9.5px] text-text-faint uppercase tracking-widest">PR status</span>
                    <a
                      href={prUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto font-mono text-[9.5px] text-text-faint hover:text-text-secondary transition-colors duration-120"
                    >
                      {agent.pr} ↗
                    </a>
                  </div>
                  <div className="px-3 py-3 text-center">
                    <span className="font-mono text-[10.5px] text-text-faint">connect GitHub token to see status</span>
                  </div>
                </div>
              );
            })()}

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
