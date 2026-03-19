/** Must match `id` on `ThemeClassRoot` in App — portals here inherit `.dark` and design tokens. */
export const THEME_ROOT_ELEMENT_ID = "awencode-theme-root";

export function getThemePortalContainer(): HTMLElement {
  return document.getElementById(THEME_ROOT_ELEMENT_ID) ?? document.body;
}
