export type UiTheme = "light" | "dark";

const THEME_STORAGE_KEY = "cervical-guard-ui-theme";

export function preferredTheme(): UiTheme {
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: UiTheme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.dataset.theme = theme;
}

export function saveTheme(theme: UiTheme): void {
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  applyTheme(theme);
}

export function initializeTheme(): UiTheme {
  const theme = preferredTheme();
  applyTheme(theme);
  return theme;
}
