import { useState, useMemo, useCallback, memo } from "react";
import { ChevronRight, ChevronsDownUp, Undo2 } from "lucide-react";
import { parsePatchFiles, registerCustomTheme } from "@pierre/diffs";
import { FileDiff, type FileDiffMetadata } from "@pierre/diffs/react";
import { resolveSetiKey, SetiIcon } from "@/lib/seti-icons";
import { useIsDarkMode } from "@/lib/use-is-dark-mode";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";

registerCustomTheme("cursor-dark-midnight", async () => {
  const m = await import("@/lib/cursor-midnight-theme");
  return { ...(m.default ?? m), name: "cursor-dark-midnight" };
});

const UNSAFE_CSS_DARK = `
  [data-type="diff"] pre { background: #1e2127 !important; }
  [data-diff-type="addition"] [data-code-column] { background: rgba(163,190,140,0.07); }
  [data-diff-type="deletion"] [data-code-column] { background: rgba(191,97,106,0.07); }
  [data-diff-type="addition"] [data-gutter] { background: rgba(163,190,140,0.12); }
  [data-diff-type="deletion"] [data-gutter] { background: rgba(191,97,106,0.12); }
  [data-diff-type="addition"] [data-gutter] [data-line-number] { color: #a3be8c; }
  [data-diff-type="deletion"] [data-gutter] [data-line-number] { color: #bf616a; }
  [data-line-number] { color: #4c566a; }
`;

const UNSAFE_CSS_LIGHT = `
  [data-type="diff"] pre { background: #ffffff !important; }
  [data-diff-type="addition"] [data-code-column] { background: rgba(58,157,99,0.06); }
  [data-diff-type="deletion"] [data-code-column] { background: rgba(192,57,43,0.06); }
  [data-diff-type="addition"] [data-gutter] { background: rgba(58,157,99,0.10); }
  [data-diff-type="deletion"] [data-gutter] { background: rgba(192,57,43,0.10); }
`;

export interface DiffFileInfo {
  path: string;
  additions: number;
  deletions: number;
  staged: boolean;
}

export interface DiffPanelProps {
  diff: string;
  files: DiffFileInfo[];
  projectPath: string | null;
  width: number;
  open: boolean;
  onRefresh: () => void;
}

function fileBasename(path: string) {
  const idx = path.lastIndexOf("/");
  return idx >= 0 ? path.slice(idx + 1) : path;
}

function fileDir(path: string) {
  const idx = path.lastIndexOf("/");
  return idx >= 0 ? path.slice(0, idx) : "";
}

const ROW_HEIGHT = 26;

function StagingCheckbox({
  checked,
  indeterminate,
  onChange,
  className,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (e: React.MouseEvent) => void;
  className?: string;
}) {
  const mixed = Boolean(indeterminate);
  return (
    <span
      role="checkbox"
      aria-checked={mixed ? "mixed" : checked}
      tabIndex={-1}
      onClick={onChange}
      className={cn(
        "w-[14px] h-[14px] shrink-0 rounded-[3px] border flex items-center justify-center cursor-pointer transition-colors duration-75 mr-1.5",
        checked || mixed
          ? "bg-accent-green/20 border-accent-green/60"
          : "border-border-default hover:border-text-tertiary",
        className,
      )}
    >
      {mixed && (
        <span className="w-[6px] h-[1.5px] rounded-full bg-accent-green" aria-hidden />
      )}
      {!mixed && checked && (
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
          <path d="M1.5 4L3.25 5.75L6.5 2.25" stroke="var(--accent-green)" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

const DiffFileRow = memo(function DiffFileRow({
  file,
  fileDiff,
  expanded,
  onToggle,
  isDark,
  projectPath,
  onRefresh,
  onRequestDiscard,
}: {
  file: DiffFileInfo;
  fileDiff: FileDiffMetadata | null;
  expanded: boolean;
  onToggle: () => void;
  isDark: boolean;
  projectPath: string | null;
  onRefresh: () => void;
  onRequestDiscard: (paths: string[]) => void;
}) {
  const basename = fileBasename(file.path);
  const dir = fileDir(file.path);
  const iconKey = resolveSetiKey(basename);

  const handleStageToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!projectPath) return;
      const cmd = file.staged ? "git_unstage_files" : "git_stage_files";
      invoke(cmd, { path: projectPath, files: [file.path] })
        .then(onRefresh)
        .catch(console.error);
    },
    [projectPath, file.path, file.staged, onRefresh],
  );

  const handleDiscard = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRequestDiscard([file.path]);
    },
    [file.path, onRequestDiscard],
  );

  return (
    <div className="border-b border-border-light last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center w-full text-left group/row cursor-pointer hover:bg-[rgba(255,255,255,0.025)]"
        style={{ height: ROW_HEIGHT, paddingLeft: 8, paddingRight: 6 }}
      >
        <ChevronRight
          size={12}
          strokeWidth={2}
          className={cn(
            "shrink-0 text-text-faint transition-transform duration-100 mr-1",
            expanded && "rotate-90",
          )}
        />

        <StagingCheckbox checked={file.staged} onChange={handleStageToggle} />

        <span className="flex items-center justify-center shrink-0 mr-1.5" style={{ width: 16 }}>
          <SetiIcon iconKey={iconKey} isDark={isDark} size={15} />
        </span>

        <span className="min-w-0 truncate flex items-baseline gap-1 flex-1">
          <span className="text-[12px] text-text-primary truncate">{basename}</span>
          {dir && <span className="text-[10.5px] text-text-faint truncate">{dir}</span>}
        </span>

        <span className="flex items-center gap-1 shrink-0 mr-1">
          {file.additions > 0 && (
            <span className="font-mono text-[10.5px] text-[#a3be8c]">+{file.additions}</span>
          )}
          {file.deletions > 0 && (
            <span className="font-mono text-[10.5px] text-[#bf616a]">-{file.deletions}</span>
          )}
        </span>

        <span className="flex items-center shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity duration-75">
          <span
            role="button"
            tabIndex={-1}
            onClick={handleDiscard}
            className="w-[20px] h-[20px] flex items-center justify-center rounded hover:bg-bg-primary/60 transition-colors duration-75"
            title="Discard changes"
          >
            <Undo2 size={11} className="text-text-secondary" />
          </span>
        </span>
      </button>

      {expanded && fileDiff && (
        <FileDiff
          fileDiff={fileDiff}
          options={{
            theme: isDark ? "cursor-dark-midnight" : "pierre-light",
            diffStyle: "unified",
            hunkSeparators: "line-info-basic",
            disableFileHeader: true,
            overflow: "scroll",
            unsafeCSS: isDark ? UNSAFE_CSS_DARK : UNSAFE_CSS_LIGHT,
          }}
        />
      )}
    </div>
  );
});

function DiscardConfirmDialog({
  paths,
  onConfirm,
  onCancel,
}: {
  paths: string[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const label = paths.length === 1 ? fileBasename(paths[0]) : `${paths.length} files`;
  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/20 dark:bg-black/40" onClick={onCancel} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed left-1/2 top-1/2 z-[90] w-[min(360px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[10px] border border-border-default bg-bg-card p-5 shadow-[0_12px_40px_rgba(0,0,0,0.06)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.25)]"
      >
        <h2 className="font-sans text-[14px] font-semibold text-text-primary tracking-[-0.02em] mb-2">
          Discard changes?
        </h2>
        <p className="font-sans text-[12.5px] text-text-secondary leading-relaxed mb-5">
          This will permanently discard all uncommitted changes to <span className="font-medium text-text-primary">{label}</span>. This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-[11.5px] text-text-secondary border border-border-default rounded-md hover:bg-bg-secondary transition-colors duration-120 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-1.5 text-[11.5px] font-medium bg-accent-red text-white rounded-md hover:opacity-90 transition-opacity duration-120 cursor-pointer"
          >
            Discard
          </button>
        </div>
      </div>
    </>
  );
}

export const DiffPanel = memo(function DiffPanel({
  diff,
  files,
  projectPath,
  width,
  open,
  onRefresh,
}: DiffPanelProps) {
  const isDark = useIsDarkMode();
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [discardTarget, setDiscardTarget] = useState<string[] | null>(null);

  const fileDiffs = useMemo(() => {
    if (!diff) return new Map<string, FileDiffMetadata>();
    try {
      const parsed = parsePatchFiles(diff).flatMap((p) => p.files);
      const map = new Map<string, FileDiffMetadata>();
      for (const fd of parsed) map.set(fd.name, fd);
      return map;
    } catch {
      return new Map<string, FileDiffMetadata>();
    }
  }, [diff]);

  const totalAdditions = useMemo(() => files.reduce((s, f) => s + f.additions, 0), [files]);
  const totalDeletions = useMemo(() => files.reduce((s, f) => s + f.deletions, 0), [files]);

  const toggleFile = useCallback((path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => setExpandedFiles(new Set()), []);

  const allFilesStaged = files.length > 0 && files.every((f) => f.staged);
  const someFilesStaged = files.some((f) => f.staged);
  const stageAllIndeterminate = someFilesStaged && !allFilesStaged;

  const handleStageAllToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!projectPath || files.length === 0) return;
      if (allFilesStaged) {
        invoke("git_unstage_files", { path: projectPath, files: files.map((f) => f.path) })
          .then(onRefresh)
          .catch(console.error);
      } else {
        const unstaged = files.filter((f) => !f.staged).map((f) => f.path);
        if (unstaged.length === 0) return;
        invoke("git_stage_files", { path: projectPath, files: unstaged })
          .then(onRefresh)
          .catch(console.error);
      }
    },
    [projectPath, files, allFilesStaged, onRefresh],
  );

  const requestDiscardAll = useCallback(() => {
    if (files.length === 0) return;
    setDiscardTarget(files.map((f) => f.path));
  }, [files]);

  const confirmDiscard = useCallback(() => {
    if (!projectPath || !discardTarget) return;
    invoke("git_discard_files", { path: projectPath, files: discardTarget })
      .then(onRefresh)
      .catch(console.error)
      .finally(() => setDiscardTarget(null));
  }, [projectPath, discardTarget, onRefresh]);

  const requestDiscard = useCallback((paths: string[]) => {
    setDiscardTarget(paths);
  }, []);

  if (!open) return null;

  return (
    <div
      className="h-full flex flex-col select-none border-l border-border-default"
      style={{ width, background: "var(--bg-secondary)" }}
    >
      {/* Header */}
      <div className="h-[26px] shrink-0 flex items-center px-2 group/header border-b border-border-light">
        <div className="flex items-center min-w-0 gap-1.5 flex-1">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-tertiary whitespace-nowrap">
            {files.length} file{files.length !== 1 ? "s" : ""} changed
          </span>
          {totalAdditions > 0 && (
            <span className="font-mono text-[10.5px] text-[#a3be8c]">+{totalAdditions}</span>
          )}
          {totalDeletions > 0 && (
            <span className="font-mono text-[10.5px] text-[#bf616a]">-{totalDeletions}</span>
          )}
        </div>
        <div className="flex items-center gap-0 opacity-0 group-hover/header:opacity-100 transition-opacity duration-100">
          <button
            onClick={collapseAll}
            className="w-[22px] h-[22px] flex items-center justify-center rounded hover:bg-bg-primary/60 transition-colors duration-100 cursor-pointer"
            title="Collapse all"
          >
            <ChevronsDownUp size={13} className="text-text-secondary" />
          </button>
          <span
            className="w-[22px] h-[22px] flex items-center justify-center"
            title={
              allFilesStaged
                ? "Unstage all"
                : stageAllIndeterminate
                  ? "Stage all changes"
                  : "Stage all"
            }
          >
            <StagingCheckbox
              checked={allFilesStaged}
              indeterminate={stageAllIndeterminate}
              onChange={handleStageAllToggle}
              className="mr-0"
            />
          </span>
          <button
            onClick={requestDiscardAll}
            className="w-[22px] h-[22px] flex items-center justify-center rounded hover:bg-bg-primary/60 transition-colors duration-100 cursor-pointer"
            title="Discard all"
          >
            <Undo2 size={12} className="text-text-secondary" />
          </button>
        </div>
      </div>

      {/* File list + diffs */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        {files.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <span className="text-[12px] text-text-faint">No changes</span>
          </div>
        ) : (
          files.map((file) => (
            <DiffFileRow
              key={file.path}
              file={file}
              fileDiff={fileDiffs.get(file.path) ?? null}
              expanded={expandedFiles.has(file.path)}
              onToggle={() => toggleFile(file.path)}
              isDark={isDark}
              projectPath={projectPath}
              onRefresh={onRefresh}
              onRequestDiscard={requestDiscard}
            />
          ))
        )}
      </div>

      {discardTarget && (
        <DiscardConfirmDialog
          paths={discardTarget}
          onConfirm={confirmDiscard}
          onCancel={() => setDiscardTarget(null)}
        />
      )}
    </div>
  );
});
