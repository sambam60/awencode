/** Must match `id` on `ThemeClassRoot` in App. Theme uses `document.documentElement.classList.toggle("dark")`; portals mount here so they stay inside the app subtree. */
export const THEME_ROOT_ELEMENT_ID = "awencode-theme-root";

export function getThemePortalContainer(): HTMLElement {
  return document.getElementById(THEME_ROOT_ELEMENT_ID) ?? document.body;
}
