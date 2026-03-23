import { useState, useMemo, useCallback, memo } from "react";
import { ChevronRight, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Diff parser ─────────────────────────────────────────────────────────────

interface DiffLine {
  type: "context" | "addition" | "deletion";
  content: string;
  oldLineNo: number | null;
  newLineNo: number | null;
}

interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

interface DiffFile {
  path: string;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

function parseUnifiedDiffToFiles(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  const rawLines = diff.split("\n");
  let i = 0;

  while (i < rawLines.length) {
    if (!rawLines[i].startsWith("diff --git ")) {
      i++;
      continue;
    }

    const diffHeader = rawLines[i];
    const pathMatch = diffHeader.match(/^diff --git a\/(.+?) b\/(.+)$/);
    const filePath = pathMatch
      ? pathMatch[2] === "/dev/null"
        ? pathMatch[1]
        : pathMatch[2]
      : "unknown";
    i++;

    while (
      i < rawLines.length &&
      !rawLines[i].startsWith("@@") &&
      !rawLines[i].startsWith("diff --git ")
    ) {
      i++;
    }

    const hunks: DiffHunk[] = [];
    let fileAdditions = 0;
    let fileDeletions = 0;

    while (i < rawLines.length && !rawLines[i].startsWith("diff --git ")) {
      if (rawLines[i].startsWith("@@")) {
        const hunkHeader = rawLines[i];
        const hunkMatch = hunkHeader.match(
          /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/,
        );
        let oldLine = hunkMatch ? parseInt(hunkMatch[1], 10) : 1;
        let newLine = hunkMatch ? parseInt(hunkMatch[2], 10) : 1;
        i++;

        const lines: DiffLine[] = [];

        while (
          i < rawLines.length &&
          !rawLines[i].startsWith("@@") &&
          !rawLines[i].startsWith("diff --git ")
        ) {
          const line = rawLines[i];

          if (line.startsWith("+")) {
            lines.push({
              type: "addition",
              content: line.slice(1),
              oldLineNo: null,
              newLineNo: newLine,
            });
            newLine++;
            fileAdditions++;
          } else if (line.startsWith("-")) {
            lines.push({
              type: "deletion",
              content: line.slice(1),
              oldLineNo: oldLine,
              newLineNo: null,
            });
            oldLine++;
            fileDeletions++;
          } else if (line.startsWith("\\")) {
            // "\ No newline at end of file" — skip
          } else {
            const content = line.startsWith(" ") ? line.slice(1) : line;
            lines.push({
              type: "context",
              content,
              oldLineNo: oldLine,
              newLineNo: newLine,
            });
            oldLine++;
            newLine++;
          }
          i++;
        }

        hunks.push({ header: hunkHeader, lines });
      } else {
        i++;
      }
    }

    files.push({
      path: filePath,
      additions: fileAdditions,
      deletions: fileDeletions,
      hunks,
    });
  }

  return files;
}

// ─── Hidden-lines collapse ───────────────────────────────────────────────────

function HiddenLinesToggle({
  count,
  expanded,
  onToggle,
}: {
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-1.5 w-full px-3 py-1 text-left hover:bg-white/[0.03] transition-colors duration-100 cursor-pointer"
    >
      <ChevronRight
        size={10}
        strokeWidth={2}
        className={cn(
          "shrink-0 text-[#6b6f76] transition-transform duration-150",
          expanded && "rotate-90",
        )}
      />
      <span className="font-sans text-[11px] text-[#6b6f76] italic">
        {count} hidden line{count !== 1 ? "s" : ""}
      </span>
    </button>
  );
}

// ─── File diff section ───────────────────────────────────────────────────────

const CONTEXT_LINES_THRESHOLD = 4;

interface ContextGroup {
  kind: "visible";
  lines: DiffLine[];
}
interface HiddenGroup {
  kind: "hidden";
  lines: DiffLine[];
}
type LineGroup = ContextGroup | HiddenGroup;

function groupHunkLines(lines: DiffLine[]): LineGroup[] {
  if (lines.length === 0) return [];

  const groups: LineGroup[] = [];
  let contextRun: DiffLine[] = [];

  const flushContext = () => {
    if (contextRun.length === 0) return;
    if (contextRun.length > CONTEXT_LINES_THRESHOLD) {
      const top = contextRun.slice(0, 2);
      const middle = contextRun.slice(2, -2);
      const bottom = contextRun.slice(-2);
      if (top.length > 0) groups.push({ kind: "visible", lines: top });
      if (middle.length > 0) groups.push({ kind: "hidden", lines: middle });
      if (bottom.length > 0) groups.push({ kind: "visible", lines: bottom });
    } else {
      groups.push({ kind: "visible", lines: [...contextRun] });
    }
    contextRun = [];
  };

  for (const line of lines) {
    if (line.type === "context") {
      contextRun.push(line);
    } else {
      flushContext();
      const last = groups[groups.length - 1];
      if (last?.kind === "visible") {
        last.lines.push(line);
      } else {
        groups.push({ kind: "visible", lines: [line] });
      }
    }
  }
  flushContext();

  return groups;
}

function DiffLineRow({ line }: { line: DiffLine }) {
  const prefix =
    line.type === "addition" ? "+" : line.type === "deletion" ? "-" : " ";
  const lineNo =
    line.type === "deletion" ? line.oldLineNo : line.newLineNo;

  return (
    <tr
      className={cn(
        "diff-line",
        line.type === "addition" && "diff-line-add",
        line.type === "deletion" && "diff-line-del",
      )}
    >
      <td className="diff-gutter select-none text-right pr-2 pl-2.5 py-0 font-mono text-[11px] w-[3.5rem] align-top leading-[22px] border-r border-[#2a2a2e]/60">
        {lineNo ?? ""}
      </td>
      <td className="diff-prefix select-none text-center w-4 py-0 font-mono text-[11.5px] leading-[22px] align-top">
        {prefix}
      </td>
      <td className="py-0 font-mono text-[11.5px] leading-[22px] whitespace-pre pr-3">
        {line.content || "\u00a0"}
      </td>
    </tr>
  );
}

function HunkBlock({ hunk }: { hunk: DiffHunk }) {
  const groups = useMemo(() => groupHunkLines(hunk.lines), [hunk.lines]);
  const [expandedHidden, setExpandedHidden] = useState<Set<number>>(new Set());

  const toggleHidden = useCallback((idx: number) => {
    setExpandedHidden((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  return (
    <div>
      {groups.map((group, gi) => {
        if (group.kind === "hidden") {
          const isExpanded = expandedHidden.has(gi);
          return (
            <div key={gi}>
              <HiddenLinesToggle
                count={group.lines.length}
                expanded={isExpanded}
                onToggle={() => toggleHidden(gi)}
              />
              {isExpanded && (
                <table className="w-full border-collapse">
                  <tbody>
                    {group.lines.map((line, li) => (
                      <DiffLineRow key={li} line={line} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        }
        return (
          <table key={gi} className="w-full border-collapse">
            <tbody>
              {group.lines.map((line, li) => (
                <DiffLineRow key={li} line={line} />
              ))}
            </tbody>
          </table>
        );
      })}
    </div>
  );
}

const FileDiffSection = memo(function FileDiffSection({
  file,
  defaultExpanded,
}: {
  file: DiffFile;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const fileName = file.path.split("/").pop() ?? file.path;

  return (
    <div className="border-b border-[#2a2a2e] last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="group/diff-file flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-white/[0.03] transition-colors duration-100 cursor-pointer"
      >
        <ChevronRight
          size={12}
          strokeWidth={2}
          className={cn(
            "shrink-0 text-[#7a7d84] transition-transform duration-150",
            expanded && "rotate-90",
          )}
        />
        <Settings2 size={12} strokeWidth={1.75} className="shrink-0 text-[#6b6f76]" />
        <span
          className="flex-1 min-w-0 font-sans text-[12.5px] text-[#ececee] truncate"
          title={file.path}
        >
          {fileName}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {file.additions > 0 && (
            <span className="font-mono text-[11px] text-[#4aad6e]">
              +{file.additions}
            </span>
          )}
          {file.deletions > 0 && (
            <span className="font-mono text-[11px] text-[#d4524a]">
              -{file.deletions}
            </span>
          )}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-[#2a2a2e]">
          {file.hunks.map((hunk, hi) => (
            <HunkBlock key={hi} hunk={hunk} />
          ))}
        </div>
      )}
    </div>
  );
});

// ─── Main component ──────────────────────────────────────────────────────────

interface DiffActivityViewProps {
  diff: string;
  className?: string;
}

export const DiffActivityView = memo(function DiffActivityView({
  diff,
  className,
}: DiffActivityViewProps) {
  const files = useMemo(() => parseUnifiedDiffToFiles(diff), [diff]);

  if (files.length === 0) return null;

  const totalAdditions = files.reduce((s, f) => s + f.additions, 0);
  const totalDeletions = files.reduce((s, f) => s + f.deletions, 0);

  return (
    <div
      className={cn(
        "mb-3 rounded-lg border border-[#2a2a2e] overflow-hidden bg-[#141418] shadow-[0_1px_3px_rgba(0,0,0,0.1)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.35)]",
        className,
      )}
    >
      <div className="flex items-center gap-2.5 px-3 py-2 border-b border-[#2a2a2e]">
        <span className="font-sans text-[11px] text-[#9b9ea4]">
          {files.length} file{files.length !== 1 ? "s" : ""} changed
        </span>
        {totalAdditions > 0 && (
          <span className="font-mono text-[11px] text-[#4aad6e]">
            +{totalAdditions}
          </span>
        )}
        {totalDeletions > 0 && (
          <span className="font-mono text-[11px] text-[#d4524a]">
            -{totalDeletions}
          </span>
        )}
      </div>
      {files.map((file, fi) => (
        <FileDiffSection
          key={file.path}
          file={file}
          defaultExpanded={fi === 0}
        />
      ))}
    </div>
  );
});
