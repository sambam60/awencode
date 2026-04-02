import { memo, useMemo } from "react";
import { parsePatchFiles } from "@pierre/diffs";
import { FileDiff, type FileDiffMetadata } from "@pierre/diffs/react";
import { cn } from "@/lib/utils";

interface DiffActivityViewProps {
  diff: string;
  className?: string;
}

function computeStats(files: FileDiffMetadata[]) {
  let additions = 0;
  let deletions = 0;
  for (const file of files) {
    for (const hunk of file.hunks) {
      additions += hunk.additionLines;
      deletions += hunk.deletionLines;
    }
  }
  return { fileCount: files.length, additions, deletions };
}

export const DiffActivityView = memo(function DiffActivityView({
  diff,
  className,
}: DiffActivityViewProps) {
  const fileDiffs = useMemo(() => {
    try {
      return parsePatchFiles(diff).flatMap((patch) => patch.files);
    } catch {
      return [];
    }
  }, [diff]);

  const stats = useMemo(() => computeStats(fileDiffs), [fileDiffs]);

  if (fileDiffs.length === 0) return null;

  return (
    <div
      className={cn(
        "mb-3 rounded-lg border border-[var(--border-default)] overflow-hidden bg-[var(--bg-card)]",
        className,
      )}
    >
      <div className="flex items-center gap-2.5 px-3 py-2 border-b border-[var(--border-default)]">
        <span className="font-sans text-[11px] text-[var(--text-tertiary)]">
          {stats.fileCount} file{stats.fileCount !== 1 ? "s" : ""} changed
        </span>
        {stats.additions > 0 && (
          <span className="font-mono text-[11px] text-[var(--accent-green)]">
            +{stats.additions}
          </span>
        )}
        {stats.deletions > 0 && (
          <span className="font-mono text-[11px] text-[var(--accent-red)]">
            -{stats.deletions}
          </span>
        )}
      </div>
      {fileDiffs.map((fileDiff, i) => (
        <FileDiff
          key={fileDiff.name ?? i}
          fileDiff={fileDiff}
          options={{
            theme: "pierre-dark",
            diffStyle: "unified",
            hunkSeparators: "line-info-basic",
            collapsed: i !== 0,
            overflow: "scroll",
          }}
        />
      ))}
    </div>
  );
});
