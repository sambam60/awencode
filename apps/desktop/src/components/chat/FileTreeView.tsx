import { useEffect, useMemo, useState, useCallback, useRef, memo } from "react";
import { RefreshCw, ChevronsDownUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { AWENCODE_FILE_PATH_MIME, AWENCODE_FILE_KIND_MIME } from "@/lib/dnd";
import { resolveSetiKey, SetiIcon } from "@/lib/seti-icons";
import { useIsDarkMode } from "@/lib/use-is-dark-mode";
import { invoke } from "@tauri-apps/api/core";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
  children: DirEntry[] | null;
}

interface FileStatus {
  path: string;
  status: string;
}

interface FileTreeViewProps {
  projectPath: string | null;
  projectName: string;
  branch: string;
  width: number;
  open: boolean;
  onClose: () => void;
}

/** Captured from the real tree row so the overlay matches indent + compressed label (VS Code aligns sticky rows to list geometry). */
interface StickyTreeInfo {
  path: string;
  depth: number;
  label: string;
}

interface VisibleTreeRow extends StickyTreeInfo {
  entry: DirEntry;
  isDir: boolean;
  parentPath: string | null;
  startIndex: number;
  endIndex: number;
}

interface StickyRenderRow extends StickyTreeInfo {
  entry: DirEntry;
  top: number;
}

const STICKY_SCROLL_MAX_ROWS = 6;

// ─── VSCode git decoration colors ────────────────────────────────────────────

const GIT_COLORS_LIGHT: Record<string, string> = {
  M: "#895503",
  A: "#587c0c",
  D: "#ad0707",
  R: "#007100",
  C: "#007100",
  U: "#73C991",
  I: "#8E8E90",
  "!": "#ad0707",
  T: "#895503",
};

const GIT_COLORS_DARK: Record<string, string> = {
  M: "#E2C08D",
  A: "#81b88b",
  D: "#c74e39",
  R: "#73C991",
  C: "#73C991",
  U: "#73C991",
  I: "#8C8C8C",
  "!": "#e4676b",
  T: "#E2C08D",
};


function gitColor(status: string, dark: boolean): string | undefined {
  return dark ? GIT_COLORS_DARK[status] : GIT_COLORS_LIGHT[status];
}

// ─── Status helpers ───────────────────────────────────────────────────────────

function getFileStatus(
  filePath: string,
  statusMap: Map<string, string>,
): string | null {
  return statusMap.get(filePath) ?? null;
}

function getDirStatus(
  dirPath: string,
  statusMap: Map<string, string>,
): string | null {
  const prefix = dirPath.endsWith("/") ? dirPath : `${dirPath}/`;
  for (const [p, s] of statusMap) {
    if (p.startsWith(prefix) && s !== "D") return "M";
  }
  return null;
}


// ─── Path compression ─────────────────────────────────────────────────────────

interface CompressedEntry {
  segments: DirEntry[];
  label: string;
  entry: DirEntry;
}

function compressTree(entries: DirEntry[]): CompressedEntry[] {
  return entries.map((e) => compress(e, [e]));
}

function compress(entry: DirEntry, segments: DirEntry[]): CompressedEntry {
  if (
    entry.isDir &&
    entry.children &&
    entry.children.length === 1 &&
    entry.children[0].isDir
  ) {
    return compress(entry.children[0], [...segments, entry.children[0]]);
  }
  return { segments, label: segments.map((s) => s.name).join(" / "), entry };
}

function buildVisibleRows(
  entries: CompressedEntry[],
  expandedDirs: Set<string>,
): VisibleTreeRow[] {
  const rows: VisibleTreeRow[] = [];

  const walk = (
    items: CompressedEntry[],
    depth: number,
    parentPath: string | null,
  ) => {
    for (const compressed of items) {
      const { entry, label } = compressed;
      const startIndex = rows.length;
      const row: VisibleTreeRow = {
        entry,
        path: entry.path,
        depth,
        label,
        isDir: entry.isDir,
        parentPath,
        startIndex,
        endIndex: startIndex,
      };
      rows.push(row);

      if (entry.isDir && expandedDirs.has(entry.path) && entry.children?.length) {
        walk(compressTree(entry.children), depth + 1, entry.path);
        row.endIndex = rows.length - 1;
      }
    }
  };

  walk(entries, 0, null);
  return rows;
}

function getAncestorUnderPrevious(
  rowMap: Map<string, VisibleTreeRow>,
  node: VisibleTreeRow,
  previousAncestorPath?: string,
): VisibleTreeRow | undefined {
  let current = node;
  let parent = current.parentPath ? rowMap.get(current.parentPath) : undefined;

  while (parent) {
    if (parent.path === previousAncestorPath) {
      return current;
    }
    current = parent;
    parent = current.parentPath ? rowMap.get(current.parentPath) : undefined;
  }

  if (previousAncestorPath === undefined) {
    return current;
  }

  return undefined;
}

function rowTop(index: number, scrollTop: number): number {
  return index * ROW_HEIGHT - scrollTop;
}

function calculateStickyRowTop(
  row: VisibleTreeRow,
  stickyRowPositionTop: number,
  scrollTop: number,
): number {
  const bottomOfLastChild = rowTop(row.endIndex, scrollTop) + ROW_HEIGHT;

  if (
    stickyRowPositionTop + ROW_HEIGHT > bottomOfLastChild &&
    stickyRowPositionTop <= bottomOfLastChild
  ) {
    return bottomOfLastChild - ROW_HEIGHT;
  }

  return stickyRowPositionTop;
}

function buildStickyRows(
  visibleRows: VisibleTreeRow[],
  rowMap: Map<string, VisibleTreeRow>,
  scrollTop: number,
): StickyRenderRow[] {
  if (scrollTop <= 0 || visibleRows.length === 0) {
    return [];
  }

  const firstVisibleIndex = Math.min(
    visibleRows.length - 1,
    Math.max(0, Math.floor(scrollTop / ROW_HEIGHT)),
  );

  const stickyRows: StickyRenderRow[] = [];
  let firstVisibleUnderWidgetIndex = firstVisibleIndex;
  let stickyRowsHeight = 0;
  let previousStickyPath: string | undefined;

  while (
    stickyRows.length < STICKY_SCROLL_MAX_ROWS &&
    firstVisibleUnderWidgetIndex < visibleRows.length
  ) {
    const firstVisibleNode = visibleRows[firstVisibleUnderWidgetIndex];
    const nextStickyNode = getAncestorUnderPrevious(
      rowMap,
      firstVisibleNode,
      previousStickyPath,
    );
    if (!nextStickyNode) {
      break;
    }

    if (nextStickyNode.path === firstVisibleNode.path) {
      const isUncollapsedParent =
        nextStickyNode.isDir && nextStickyNode.endIndex > nextStickyNode.startIndex;
      const nodeTopAlignsWithStickyBottom =
        Math.abs(
          scrollTop - (nextStickyNode.startIndex * ROW_HEIGHT - stickyRowsHeight),
        ) < 0.5;

      if (!isUncollapsedParent || nodeTopAlignsWithStickyBottom) {
        break;
      }
    }

    const top = calculateStickyRowTop(nextStickyNode, stickyRowsHeight, scrollTop);
    stickyRows.push({
      entry: nextStickyNode.entry,
      path: nextStickyNode.path,
      depth: nextStickyNode.depth,
      label: nextStickyNode.label,
      top,
    });

    stickyRowsHeight += ROW_HEIGHT;
    previousStickyPath = nextStickyNode.path;

    const nextHeight = scrollTop + top + ROW_HEIGHT;
    const nextIndex = Math.min(
      visibleRows.length - 1,
      Math.max(0, Math.floor(nextHeight / ROW_HEIGHT)),
    );

    if (nextIndex <= firstVisibleUnderWidgetIndex) {
      break;
    }

    firstVisibleUnderWidgetIndex = nextIndex;
  }

  return stickyRows;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ROW_HEIGHT = 22;
const INDENT_PX = 8;
const TWISTIE_WIDTH = 16;
const ICON_WIDTH = 16;
const ICON_GAP = 4;

// ─── Tree row ────────────────────────────────────────────────────────────────

const TreeRow = memo(function TreeRow({
  compressed,
  depth,
  statusMap,
  expandedDirs,
  onToggleDir,
  onLoadChildren,
  projectPath,
  searchQuery,
  isDark,
  selectedPath,
  onSelect,
  isLastChild,
}: {
  compressed: CompressedEntry;
  depth: number;
  statusMap: Map<string, string>;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
  onLoadChildren: (path: string) => Promise<DirEntry[]>;
  projectPath: string;
  searchQuery: string;
  isDark: boolean;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  isLastChild?: boolean;
}) {
  const { entry, label } = compressed;
  const isExpanded = expandedDirs.has(entry.path);

  const status = entry.isDir
    ? getDirStatus(entry.path, statusMap)
    : getFileStatus(entry.path, statusMap);
  const color = status ? gitColor(status, isDark) : undefined;
  const isDeleted = status === "D";
  const isSelected = selectedPath === entry.path;

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    const nameMatch = label.toLowerCase().includes(q);
    if (entry.isDir) {
      const childMatch = entry.children?.some((c) =>
        c.name.toLowerCase().includes(q),
      );
      if (!nameMatch && !childMatch) return null;
    } else if (!nameMatch) {
      return null;
    }
  }

  const handleClick = async () => {
    onSelect(entry.path);
    if (entry.isDir) {
      if (!isExpanded && (!entry.children || entry.children.length === 0)) {
        await onLoadChildren(entry.path);
      }
      onToggleDir(entry.path);
    }
  };

  const paddingLeft = INDENT_PX + depth * TWISTIE_WIDTH;
  const guides = Array.from({ length: depth }, (_, i) => {
    return INDENT_PX + i * TWISTIE_WIDTH + TWISTIE_WIDTH / 2;
  });

  const iconKey = entry.isDir ? null : resolveSetiKey(entry.name);
  const children =
    entry.isDir && isExpanded && entry.children
      ? compressTree(entry.children)
      : null;

  return (
    <>
      <div
        role="treeitem"
        aria-expanded={entry.isDir ? isExpanded : undefined}
        tabIndex={0}
        data-tree-node="1"
        data-tree-is-dir={entry.isDir ? "1" : "0"}
        data-tree-depth={depth}
        data-tree-path={entry.path}
        data-tree-label={entry.isDir ? label : ""}
        data-tree-last={isLastChild ? "1" : "0"}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "copy";
          e.dataTransfer.setData(AWENCODE_FILE_PATH_MIME, entry.path);
          e.dataTransfer.setData(AWENCODE_FILE_KIND_MIME, entry.isDir ? "folder" : "file");
          e.dataTransfer.setData("text/plain", entry.path);
        }}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
          if (e.key === "ArrowRight" && entry.isDir && !isExpanded) {
            e.preventDefault();
            handleClick();
          }
          if (e.key === "ArrowLeft" && entry.isDir && isExpanded) {
            e.preventDefault();
            onToggleDir(entry.path);
          }
        }}
        className={cn(
          "relative flex items-center min-w-0 cursor-pointer select-none outline-none",
          "hover:bg-[rgba(0,0,0,0.04)] dark:hover:bg-[rgba(255,255,255,0.04)]",
          "focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-blue)] focus-visible:-outline-offset-1",
          isSelected && "bg-[rgba(0,0,0,0.06)] dark:bg-[rgba(255,255,255,0.06)]",
        )}
        style={{
          minHeight: ROW_HEIGHT,
          paddingLeft,
          paddingRight: 14,
          overflow: "visible",
        }}
      >
        {/* Vertical guide lines only */}
        {guides.map((left) => (
          <span
            key={left}
            aria-hidden
            style={{
              position: "absolute",
              left,
              top: 0,
              bottom: 0,
              width: 1,
              background: "var(--border-light)",
              pointerEvents: "none",
            }}
          />
        ))}

        {/* Twistie */}
        <span
          className="flex items-center justify-center shrink-0 text-text-tertiary"
          style={{ width: TWISTIE_WIDTH, height: ROW_HEIGHT }}
        >
          {entry.isDir && (
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="currentColor"
              style={{
                transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.1s ease",
              }}
            >
              <path d="M3 2l4 3-4 3V2z" />
            </svg>
          )}
        </span>

        {/* Icon */}
        {!entry.isDir && (
          <span
            className="flex items-center justify-center shrink-0"
            style={{ width: ICON_WIDTH, marginRight: ICON_GAP, overflow: "visible" }}
          >
            <SetiIcon iconKey={iconKey!} isDark={isDark} size={15} />
          </span>
        )}

        {/* Label */}
        <span
          className={cn(
            "text-[13px] truncate flex-1",
            isDeleted && "line-through opacity-70",
            !color && "text-text-primary",
          )}
          style={color ? { color, lineHeight: `${ROW_HEIGHT}px` } : { lineHeight: `${ROW_HEIGHT}px` }}
        >
          {label}
        </span>

        {/* Git status badge */}
        {status && (
          <span
            className="font-mono text-[11px] shrink-0 ml-2"
            style={{ color, minWidth: 14, textAlign: "right" }}
          >
            {status}
          </span>
        )}
      </div>

      {/* Children */}
      {children && (
        <div role="group">
          {children.map((child, idx) => (
            <TreeRow
              key={child.entry.path}
              compressed={child}
              depth={depth + 1}
              statusMap={statusMap}
              expandedDirs={expandedDirs}
              onToggleDir={onToggleDir}
              onLoadChildren={onLoadChildren}
              projectPath={projectPath}
              searchQuery={searchQuery}
              isDark={isDark}
              selectedPath={selectedPath}
              onSelect={onSelect}
              isLastChild={idx === children.length - 1}
            />
          ))}
        </div>
      )}
    </>
  );
});

// ─── Main FileTreeView ────────────────────────────────────────────────────────

export function FileTreeView({
  projectPath,
  branch,
  width,
  open,
  onClose: _onClose,
}: FileTreeViewProps) {
  const [tree, setTree] = useState<DirEntry[]>([]);
  const [statusMap, setStatusMap] = useState<Map<string, string>>(new Map());
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const searchQuery = "";
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const treeScrollRef = useRef<HTMLDivElement>(null);
  const isDark = useIsDarkMode();
  const [scrollTop, setScrollTop] = useState(0);

  const loadTree = useCallback(async () => {
    if (!projectPath) return;
    setLoading(true);
    try {
      const [entries, statuses] = await Promise.all([
        invoke<DirEntry[]>("list_directory_tree", {
          path: projectPath,
          depth: 3,
        }),
        invoke<FileStatus[]>("get_git_file_status", { path: projectPath }),
      ]);
      setTree(entries);
      const map = new Map<string, string>();
      for (const s of statuses) map.set(s.path, s.status);
      setStatusMap(map);
    } catch (err) {
      console.error("Failed to load file tree:", err);
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    if (open && projectPath) loadTree();
  }, [open, projectPath, loadTree]);

  const handleToggleDir = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedDirs(new Set());
    const treeScroll = treeScrollRef.current;
    if (treeScroll) {
      treeScroll.scrollTop = 0;
    }
    setScrollTop(0);
  }, []);

  const handleLoadChildren = useCallback(
    async (dirPath: string): Promise<DirEntry[]> => {
      if (!projectPath) return [];
      try {
        const fullPath = `${projectPath}/${dirPath}`;
        const children = await invoke<DirEntry[]>("list_directory_tree", {
          path: fullPath,
          depth: 2,
        });
        const prefixed = children.map((c) => ({
          ...c,
          path: `${dirPath}/${c.name}`,
          children:
            c.children?.map((gc) => ({
              ...gc,
              path: `${dirPath}/${c.name}/${gc.name}`,
              children:
                gc.children?.map((ggc) => ({
                  ...ggc,
                  path: `${dirPath}/${c.name}/${gc.name}/${ggc.name}`,
                })) ?? null,
            })) ?? null,
        }));
        setTree((prev) => updateTreeChildren(prev, dirPath, prefixed));
        return prefixed;
      } catch {
        return [];
      }
    },
    [projectPath],
  );

  const compressed = useMemo(() => compressTree(tree), [tree]);
  const visibleRows = useMemo(
    () => buildVisibleRows(compressed, expandedDirs),
    [compressed, expandedDirs],
  );
  const visibleRowMap = useMemo(
    () => new Map(visibleRows.map((row) => [row.path, row])),
    [visibleRows],
  );
  const stickyRows = useMemo(
    () => buildStickyRows(visibleRows, visibleRowMap, scrollTop),
    [visibleRows, visibleRowMap, scrollTop],
  );
  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="h-full flex flex-col border-r border-border-light select-none"
      style={{ width, background: "var(--bg-secondary)" }}
    >
      {/* Header */}
      <div className="h-[22px] shrink-0 flex items-center pl-[16px] pr-[6px] group/header">
        <div className="flex items-center min-w-0 gap-[8px] flex-1">
          {branch ? (
            <>
              <span
                aria-hidden
                className="w-[5px] h-[5px] shrink-0 rounded-full"
                style={{ background: "var(--text-tertiary)", opacity: 0.55 }}
              />
              <span
                className="min-w-0 font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-tertiary truncate"
                title={branch}
              >
                {branch}
              </span>
            </>
          ) : (
            <span className="min-w-0 font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-tertiary truncate">
              Explorer
            </span>
          )}
        </div>
        <div className="flex items-center gap-0 opacity-0 group-hover/header:opacity-100 transition-opacity duration-100">
          <button
            onClick={collapseAll}
            className="w-[22px] h-[22px] flex items-center justify-center rounded hover:bg-bg-primary/60 transition-colors duration-100 cursor-pointer"
            title="Collapse Folders in Explorer"
            aria-label="Collapse Folders in Explorer"
          >
            <ChevronsDownUp size={14} className="text-text-secondary" />
          </button>
          <button
            onClick={loadTree}
            className="w-[22px] h-[22px] flex items-center justify-center rounded hover:bg-bg-primary/60 transition-colors duration-100 cursor-pointer"
            title="Refresh Explorer"
            aria-label="Refresh Explorer"
          >
            <RefreshCw
              size={14}
              className={cn("text-text-secondary", loading && "animate-spin")}
            />
          </button>
        </div>
      </div>

      {/* Tree: sticky overlay + overflow clip so negative topPx can slide the strip (VS Code StickyScrollWidget). */}
      <div className="flex-1 min-h-0 flex flex-col relative overflow-hidden">
        <div
          ref={treeScrollRef}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
          role="tree"
          aria-label="File Explorer"
        >
          {loading && tree.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw size={16} className="text-text-faint animate-spin" />
            </div>
          ) : tree.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 gap-2">
              <span className="text-[12px] text-text-faint text-center">
                No files found.
              </span>
            </div>
          ) : (
            compressed.map((child, idx) => (
              <TreeRow
                key={child.entry.path}
                compressed={child}
                depth={0}
                statusMap={statusMap}
                expandedDirs={expandedDirs}
                onToggleDir={handleToggleDir}
                onLoadChildren={handleLoadChildren}
                projectPath={projectPath!}
                searchQuery={searchQuery}
                isDark={isDark}
                selectedPath={selectedPath}
                onSelect={setSelectedPath}
                isLastChild={idx === compressed.length - 1}
              />
            ))
          )}
        </div>

        {stickyRows.length > 0 && (
          <div
            className="pointer-events-none absolute left-0 right-0 top-0 z-20"
            style={{ height: stickyRows.length * ROW_HEIGHT }}
          >
            {stickyRows.map((row, index) => {
              return (
                <div
                  key={row.path}
                  data-sticky-row
                  className="absolute left-0 right-0"
                  style={{
                    top: row.top,
                    height: ROW_HEIGHT,
                    zIndex: stickyRows.length - index,
                  }}
                >
                  <StickyFolderRow
                    entry={row.entry}
                    label={row.label}
                    depth={row.depth}
                    isDark={isDark}
                    statusMap={statusMap}
                    expandedDirs={expandedDirs}
                    onToggleDir={handleToggleDir}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sticky folder row ────────────────────────────────────────────────────────

function StickyFolderRow({
  entry,
  label,
  depth,
  isDark,
  statusMap,
  expandedDirs,
  onToggleDir,
}: {
  entry: DirEntry;
  label: string;
  depth: number;
  isDark: boolean;
  statusMap: Map<string, string>;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
}) {
  const isExpanded = expandedDirs.has(entry.path);
  const status = getDirStatus(entry.path, statusMap);
  const color = status ? gitColor(status, isDark) : undefined;
  const paddingLeft = INDENT_PX + depth * TWISTIE_WIDTH;
  const guides = Array.from({ length: depth }, (_, i) => {
    return INDENT_PX + i * TWISTIE_WIDTH + TWISTIE_WIDTH / 2;
  });

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData(AWENCODE_FILE_PATH_MIME, entry.path);
        e.dataTransfer.setData(AWENCODE_FILE_KIND_MIME, "folder");
        e.dataTransfer.setData("text/plain", entry.path);
      }}
      className="pointer-events-auto relative flex min-w-0 cursor-pointer select-none border-b border-border-light"
      style={{
        minHeight: ROW_HEIGHT,
        paddingLeft,
        paddingRight: 14,
        background: "var(--bg-secondary)",
      }}
      onClick={() => onToggleDir(entry.path)}
    >
      {guides.map((left) => (
        <span
          key={left}
          aria-hidden
          style={{
            position: "absolute",
            left,
            top: 0,
            bottom: 0,
            width: 1,
            background: "var(--border-light)",
            pointerEvents: "none",
          }}
        />
      ))}
      <span
        className="flex items-center justify-center shrink-0 text-text-tertiary"
        style={{ width: TWISTIE_WIDTH, height: ROW_HEIGHT }}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="currentColor"
          style={{
            transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.1s ease",
          }}
        >
          <path d="M3 2l4 3-4 3V2z" />
        </svg>
      </span>
      <span
        className="text-[13px] truncate flex-1 min-w-0"
        style={color ? { color, lineHeight: `${ROW_HEIGHT}px` } : { lineHeight: `${ROW_HEIGHT}px` }}
      >
        {label}
      </span>
      {status && (
        <span
          className="font-mono text-[11px] shrink-0 ml-2"
          style={{ color, minWidth: 14, textAlign: "right" }}
        >
          {status}
        </span>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function updateTreeChildren(
  tree: DirEntry[],
  targetPath: string,
  children: DirEntry[],
): DirEntry[] {
  return tree.map((entry) => {
    if (entry.path === targetPath) return { ...entry, children };
    if (entry.isDir && entry.children && targetPath.startsWith(`${entry.path}/`)) {
      return { ...entry, children: updateTreeChildren(entry.children, targetPath, children) };
    }
    return entry;
  });
}
