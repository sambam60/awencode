/** Custom data transfer type for workspace file paths from FileTreeView. */
export const AWENCODE_FILE_PATH_MIME = "application/x-awencode-path";

/** Set by FileTreeView: `"file"` or `"folder"` alongside `AWENCODE_FILE_PATH_MIME`. */
export const AWENCODE_FILE_KIND_MIME = "application/x-awencode-kind";

export function isAbsoluteFilePath(p: string): boolean {
  if (!p) return false;
  if (p.startsWith("/")) return true;
  return /^[A-Za-z]:[\\/]/.test(p);
}

/** Paths from `text/uri-list` (e.g. Finder / OS file drops on WebKit). */
export function filePathsFromUriList(raw: string): string[] {
  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    if (!t.startsWith("file://")) continue;
    try {
      const url = new URL(t);
      let p = decodeURIComponent(url.pathname.replace(/\+/g, " "));
      if (/^\/[A-Za-z]:\//.test(p)) {
        p = p.slice(1);
      }
      out.push(p);
    } catch {
      /* ignore malformed */
    }
  }
  return out;
}

/** True if this drag may carry files or workspace paths (WebKit/Tauri vary `types`). */
export function dataTransferMightContainFiles(dt: DataTransfer): boolean {
  const types = dt.types ? Array.from(dt.types) : [];
  for (const t of types) {
    if (t === "Files") return true;
    if (t === AWENCODE_FILE_PATH_MIME) return true;
    if (t === "text/plain") return true;
    if (t === "text/uri-list") return true;
  }
  if (dt.items && dt.items.length > 0) {
    for (let i = 0; i < dt.items.length; i++) {
      if (dt.items[i].kind === "file") return true;
    }
  }
  return false;
}
