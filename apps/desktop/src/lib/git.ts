import { invoke } from "@tauri-apps/api/core";

export interface ProjectGitInfo {
  branch: string | null;
  sha: string | null;
  originUrl: string | null;
  hasUpstream: boolean;
  branchAhead: boolean;
  needsPublish: boolean;
}

type RawProjectGitInfo = {
  branch?: string | null;
  sha?: string | null;
  originUrl?: string | null;
  hasUpstream?: boolean | null;
  branchAhead?: boolean | null;
  needsPublish?: boolean | null;
};

export const DEFAULT_GIT_BRANCHES = new Set(["main", "master", "develop", "dev"]);

export function isDefaultGitBranch(branch: string | null | undefined): boolean {
  return DEFAULT_GIT_BRANCHES.has((branch ?? "").trim().toLowerCase());
}

export async function fetchProjectGitInfo(path: string): Promise<ProjectGitInfo | null> {
  const info = await invoke<RawProjectGitInfo | null>("get_git_info", { path });
  if (!info) return null;

  const branch = info.branch?.trim() ? info.branch.trim() : null;
  const sha = info.sha?.trim() ? info.sha.trim() : null;
  const originUrl = info.originUrl?.trim() ? info.originUrl.trim() : null;
  const hasUpstream = Boolean(info.hasUpstream);
  const branchAhead = Boolean(info.branchAhead);
  const needsPublish = branch ? (info.needsPublish ?? !hasUpstream) : false;

  return {
    branch,
    sha,
    originUrl,
    hasUpstream,
    branchAhead,
    needsPublish,
  };
}
