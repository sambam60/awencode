import type { Agent } from "@/lib/stores/thread-store";

export function formatCompactCount(value: number): string {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: value >= 100_000 ? 0 : 1,
  }).format(value);
}

export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1_000) return `${Math.round(ms)}ms`;

  const totalSeconds = Math.round(ms / 1_000);
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;

  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes === 0 ? `${hours}h` : `${hours}h ${remMinutes}m`;
}

export function getAgentTimeLabel(agent: Agent): string {
  if (agent.turnInProgress && agent.lastTurnStartedAt != null) {
    return formatDurationMs(Date.now() - agent.lastTurnStartedAt);
  }
  if (agent.lastTurnDurationMs != null) {
    return formatDurationMs(agent.lastTurnDurationMs);
  }
  return agent.time?.trim() || "—";
}

export function getAgentContextPercent(agent: Agent): number | null {
  const raw = agent.contextUsagePercent;
  if (raw != null && Number.isFinite(raw)) {
    return Math.min(100, Math.max(0, raw));
  }

  const totalTokens = agent.totalTokens;
  const modelContextWindow = agent.modelContextWindow;
  if (
    totalTokens != null &&
    modelContextWindow != null &&
    Number.isFinite(totalTokens) &&
    Number.isFinite(modelContextWindow) &&
    modelContextWindow > 0
  ) {
    return Math.min(100, Math.max(0, (totalTokens / modelContextWindow) * 100));
  }

  const tokenText = agent.tokens.trim();
  if (tokenText === "" || tokenText === "—") return null;
  const match = tokenText.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : null;
}

export function getAgentTokenLabel(agent: Agent): string {
  const percent = getAgentContextPercent(agent);
  if (percent != null) {
    if (percent >= 99.95) return "100%";
    const rounded = Math.round(percent * 10) / 10;
    return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
  }
  if (agent.totalTokens != null && Number.isFinite(agent.totalTokens)) {
    return formatCompactCount(agent.totalTokens);
  }
  return agent.tokens?.trim() || "—";
}

export type DiffStats = {
  files: string[];
  additions: number;
  deletions: number;
};

export function parseUnifiedDiff(diff: string | null | undefined): DiffStats {
  if (!diff) {
    return { files: [], additions: 0, deletions: 0 };
  }

  const fileSet = new Set<string>();
  let additions = 0;
  let deletions = 0;

  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      if (match) {
        const nextPath = match[2] === "/dev/null" ? match[1] : match[2];
        fileSet.add(nextPath);
      }
      continue;
    }
    if (
      line.startsWith("+++") ||
      line.startsWith("---") ||
      line.startsWith("@@") ||
      line.startsWith("\\ No newline")
    ) {
      continue;
    }
    if (line.startsWith("+")) additions += 1;
    else if (line.startsWith("-")) deletions += 1;
  }

  return {
    files: [...fileSet],
    additions,
    deletions,
  };
}

export function getAgentDiffStats(agent: Agent): DiffStats | null {
  const parsed = parseUnifiedDiff(agent.diff);
  if (parsed.files.length > 0) return parsed;
  if (agent.files.length === 0) return null;
  return {
    files: agent.files,
    additions: 0,
    deletions: 0,
  };
}
