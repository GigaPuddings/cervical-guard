import { BarChart3, CircleHelp, CloudSun, Languages, LayoutDashboard, LockKeyhole, RefreshCw, Settings, X } from 'lucide-react'
import packageJson from '../../package.json'
import type { AppUpdater } from '../features/updates/updateTypes'
import { copy, type Language } from '../i18n'
import { defineMessages, localizeMessages } from '../runtimeI18n'
import type { AppPage, AppSnapshot } from '../types'
import { cn } from '../utils'
import { Brand } from './Brand'
import { StatusCard } from './StatusCard'

const sidebarMessages = defineMessages({
  today: '今日概览',
  statistics: '习惯趋势',
  weather: '天气与活动',
  settings: '偏好设置',
  closeNavigation: '关闭导航',
  mainNavigation: '主导航',
  privacy: '本地隐私模式',
  privacyNote: '画面不保存，不上传',
  interfaceLanguage: '界面语言',
  help: '使用帮助',
  behaviorTool: '行为提醒工具'
})

export function Sidebar({
  snapshot,
  page,
  language,
  open,
  onClose,
  onPage,
  onPause,
  onResume,
  onEndBreak,
  onLanguage,
  onHelp,
  updater
}: {
  snapshot: AppSnapshot
  page: AppPage
  language: Language
  open: boolean
  onClose: () => void
  onPage: (page: AppPage) => void
  onPause: (minutes: number | null) => void
  onResume: () => void
  onEndBreak: () => void
  onLanguage: (language: Language) => void
  onHelp: () => void
  updater: AppUpdater
}) {
  const messages = localizeMessages(sidebarMessages, language)
  const updaterCopy = copy[language].updater
  const items = [
    { page: 'today' as const, label: messages.today, icon: LayoutDashboard },
    { page: 'statistics' as const, label: messages.statistics, icon: BarChart3 },
    { page: 'weather' as const, label: messages.weather, icon: CloudSun },
    { page: 'settings' as const, label: messages.settings, icon: Settings }
  ]

  return (
    <aside className={cn('app-sidebar fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-edge bg-sidebar px-5 pb-5 pt-6 transition-transform md:static md:w-full md:translate-x-0', open ? 'translate-x-0' : '-translate-x-full')}>
      <div className="flex items-center justify-between px-2">
        <Brand language={language} />
        <button className="grid size-8 place-items-center rounded-[10px] text-muted hover:bg-panel-muted md:hidden" aria-label={messages.closeNavigation} onClick={onClose}>
          <X size={17} />
        </button>
      </div>

      <div className="mt-5">
        <StatusCard snapshot={snapshot} onPause={onPause} onResume={onResume} onEndBreak={onEndBreak} />
      </div>

      <nav className="mt-4 grid gap-1" aria-label={messages.mainNavigation}>
        {items.map(({ page: target, label, icon: Icon }) => (
          <button
            className={cn('sidebar-nav-button flex h-11 items-center gap-3 rounded-[12px] border border-transparent px-3 text-[13px] font-semibold text-muted transition hover:bg-accent-soft hover:text-accent focus-visible:bg-accent-soft focus-visible:text-accent focus-visible:outline-none', page === target && 'sidebar-nav-button-active bg-accent-soft text-accent')}
            key={target}
            onClick={() => {
              onPage(target)
              onClose()
            }}
          >
            <Icon size={18} strokeWidth={1.8} />
            {label}
          </button>
        ))}
      </nav>

      <div className="mt-auto">
        <button className="flex w-full items-center gap-3 rounded-[14px] border border-edge bg-panel px-3 py-3 text-left transition hover:border-accent/25 hover:bg-panel-muted" onClick={() => onPage('privacy')}>
          <span className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-accent-soft text-accent">
            <LockKeyhole size={17} />
          </span>
          <span className="min-w-0 flex-1">
            <strong className="block text-[12px]">{messages.privacy}</strong>
            <small className="mt-1 block truncate text-[10px] text-muted">{messages.privacyNote}</small>
          </span>
        </button>

        <div className="mt-3 grid gap-0.5 px-2">
          <div className="flex h-9 items-center justify-between gap-2 text-[11px] font-semibold text-muted">
            <span className="flex items-center gap-2">
              <Languages size={15} />
              {messages.interfaceLanguage}
            </span>
            <span className="flex rounded-[8px] border border-edge bg-panel-muted p-0.5" role="group" aria-label={messages.interfaceLanguage}>
              <button className={cn('rounded-[6px] px-2 py-1 text-[9px] font-bold', language === 'zh-CN' ? 'bg-panel text-accent shadow-control' : 'text-subtle')} aria-pressed={language === 'zh-CN'} onClick={() => onLanguage('zh-CN')}>
                {copy['zh-CN'].settings.chineseShort}
              </button>
              <button className={cn('rounded-[6px] px-2 py-1 text-[9px] font-bold', language === 'en-US' ? 'bg-panel text-accent shadow-control' : 'text-subtle')} aria-pressed={language === 'en-US'} onClick={() => onLanguage('en-US')}>
                EN
              </button>
            </span>
          </div>
          <button className="relative flex h-8 items-center gap-2 text-[11px] font-semibold text-muted hover:text-accent" onClick={updater.open}>
            <RefreshCw size={15} /> {updaterCopy.check}
            {updater.updateAvailable ? <i className="ml-auto size-1.5 rounded-full bg-warning" /> : null}
          </button>
          <button className="flex h-8 items-center gap-2 text-[11px] font-semibold text-muted hover:text-accent" onClick={onHelp}>
            <CircleHelp size={15} /> {messages.help}
          </button>
          <p className="mt-1 text-[9px] text-subtle">
            {copy[language].appName} v{packageJson.version} · {messages.behaviorTool}
          </p>
        </div>
      </div>
    </aside>
  )
}
