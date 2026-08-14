import { isTauri } from '@tauri-apps/api/core'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { WindowChrome } from './components/WindowChrome'
import { coreClient } from './infra/client'
import { useAppStore } from './store'
import { initializeTheme } from './theme'
import './styles.css'
import { languageOf } from './i18n'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')
initializeTheme()
const startupBeganAt = performance.now()
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const mount = async () => {
  // 让启动反馈至少稳定显示一小段时间，避免高性能设备上变成一闪而过；
  // 数据加载较慢时不额外延长等待。
  const minimumVisibleMs = reducedMotion ? 120 : 650
  const remaining = Math.max(0, minimumVisibleMs - (performance.now() - startupBeganAt))
  if (remaining > 0) await new Promise(resolve => window.setTimeout(resolve, remaining))
  const startup = root.querySelector<HTMLElement>('.boot-shell')
  if (startup && !reducedMotion) {
    startup.classList.add('boot-exit')
    await new Promise(resolve => window.setTimeout(resolve, 180))
  }
  createRoot(root).render(
    <StrictMode>
      <div className={isTauri() ? 'h-full overflow-hidden pt-9' : 'h-full overflow-hidden'}>
        {isTauri() && <WindowChrome />}
        <App />
      </div>
    </StrictMode>
  )
}

if (useAppStore.getState().snapshot) {
  document.documentElement.lang = languageOf(useAppStore.getState().snapshot?.settings.language)
  void mount()
} else {
  void coreClient
    .getSnapshot()
    .then(snapshot => {
      document.documentElement.lang = languageOf(snapshot.settings.language)
      useAppStore.getState().setSnapshot(snapshot)
    })
    .catch((reason: unknown) => useAppStore.getState().setError(reason instanceof Error ? reason.message : String(reason)))
    .finally(() => void mount())
}
