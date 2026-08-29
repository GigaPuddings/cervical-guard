const THEME_STORAGE_KEY = 'cervical-guard-ui-theme'

export function applyTheme(): void {
  document.documentElement.classList.add('dark')
  document.documentElement.dataset.theme = 'dark'
  document.documentElement.style.colorScheme = 'dark'
  window.localStorage.removeItem(THEME_STORAGE_KEY)
}

export function initializeTheme(): void {
  applyTheme()
}
