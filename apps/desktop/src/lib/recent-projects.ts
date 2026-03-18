const STORAGE_KEY = "awencode_recent_projects";
const MAX_RECENT = 20;

export interface RecentProject {
  name: string;
  path: string;
  lastOpened: number;
}

function load(): RecentProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (p): p is RecentProject =>
          p != null &&
          typeof p === "object" &&
          typeof (p as RecentProject).name === "string" &&
          typeof (p as RecentProject).path === "string" &&
          typeof (p as RecentProject).lastOpened === "number",
      )
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function save(projects: RecentProject[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects.slice(0, MAX_RECENT)));
  } catch {
    // ignore
  }
}

export function getRecentProjects(): RecentProject[] {
  return load();
}

export function addRecentProject(path: string, name: string): void {
  const projects = load();
  const updated = projects.filter((p) => p.path !== path);
  updated.unshift({ name, path, lastOpened: Date.now() });
  save(updated);
}
