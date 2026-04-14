import { useEffect } from "react";
import { useAppStore } from "@/lib/stores/app-store";
import { useProjectGitStore } from "@/lib/stores/project-git-store";

const PROJECT_GIT_POLL_MS = 3000;

export function useProjectGitBridge() {
  const projectPath = useAppStore((s) => s.projectPath);
  const refreshProjectGitInfo = useProjectGitStore((s) => s.refreshProjectGitInfo);

  useEffect(() => {
    if (!projectPath) return;

    const refresh = () => {
      void refreshProjectGitInfo(projectPath).catch(() => {});
    };

    refresh();
    const timer = window.setInterval(refresh, PROJECT_GIT_POLL_MS);
    return () => window.clearInterval(timer);
  }, [projectPath, refreshProjectGitInfo]);
}
