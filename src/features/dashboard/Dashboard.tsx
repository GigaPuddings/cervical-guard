import { BarChart3, ChevronDown, CircleHelp, CloudSun, Coffee, Languages, LayoutDashboard, LockKeyhole, Menu, Pause, Play, RefreshCw, Settings, X } from 'lucide-react'
import { useState } from 'react'
import { Brand } from '../../components/Brand'
import { StatusPill } from '../../components/StatusPill'
import { copy, languageOf } from '../../i18n'
import type { AppPage } from '../../types'
import { cn } from '../../utils'
import { WeatherPage } from '../weather/WeatherPage'
import packageJson from '../../../package.json'
import type { DashboardProps } from './dashboardTypes'
import { PrivacyPage } from './pages/PrivacyPage'
import { SettingsPage } from './pages/SettingsPage'
import { StatisticsPage } from './pages/StatisticsPage'
import { TodayPage } from './pages/TodayPage'

export type { DashboardProps } from './dashboardTypes'

const navItems: Array<{ page: AppPage; label: string; icon: typeof LayoutDashboard }> = [
  { page: 'today', label: '今日概览', icon: LayoutDashboard },
  { page: 'statistics', label: '习惯趋势', icon: BarChart3 },
  { page: 'weather', label: '天气与活动', icon: CloudSun },
  { page: 'settings', label: '偏好设置', icon: Settings }
]

export function Dashboard(props: DashboardProps) {
  const { snapshot, page, onPage } = props
  const language = languageOf(snapshot.settings.language)
  const updaterCopy = copy[language].updater
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [pauseOpen, setPauseOpen] = useState(false)
  return (
    <main className="grid h-full min-h-0 overflow-hidden bg-canvas text-foreground md:grid-cols-[232px_minmax(0,1fr)] 2xl:grid-cols-[260px_minmax(0,1fr)]">
      <aside className={cn('fixed inset-y-0 left-0 z-30 flex w-58 flex-col border-r border-edge bg-sidebar/90 px-5 py-6 backdrop-blur-xl transition-transform md:static md:translate-x-0 2xl:w-65 2xl:px-6 2xl:py-8', sidebarOpen ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex items-center justify-between px-2">
          <Brand />
          <button className="grid size-9 place-items-center rounded-xl hover:bg-accent-soft md:hidden" aria-label="关闭导航" onClick={() => setSidebarOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <div className="relative mt-7 rounded-2xl border border-edge bg-panel p-3 shadow-control">
          <StatusPill snapshot={snapshot} />
          <div className="mt-3">
            {snapshot.lifecycle === 'break' ? (
              <button className="flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-info-soft text-xs font-bold text-info hover:bg-accent-soft-strong" onClick={props.onEndBreak}>
                <Coffee size={15} /> 结束休息
              </button>
            ) : snapshot.lifecycle === 'monitoring' || snapshot.lifecycle === 'degraded' ? (
              <>
                <button className="flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-accent-soft text-xs font-bold text-accent-strong hover:bg-accent-soft-strong" onClick={() => setPauseOpen(value => !value)}>
                  <Pause size={15} /> 暂停检测 <ChevronDown size={14} />
                </button>
                {pauseOpen && (
                  <div className="absolute left-3 right-3 top-20.5 z-20 grid overflow-hidden rounded-xl border border-edge bg-panel p-1 text-xs shadow-panel">
                    <button
                      className="rounded-lg px-3 py-2 text-left hover:bg-panel-muted"
                      onClick={() => {
                        props.onPause(30)
                        setPauseOpen(false)
                      }}
                    >
                      暂停 30 分钟
                    </button>
                    <button
                      className="rounded-lg px-3 py-2 text-left hover:bg-panel-muted"
                      onClick={() => {
                        props.onPause(60)
                        setPauseOpen(false)
                      }}
                    >
                      暂停 1 小时
                    </button>
                    <button
                      className="rounded-lg px-3 py-2 text-left hover:bg-panel-muted"
                      onClick={() => {
                        props.onPause(null)
                        setPauseOpen(false)
                      }}
                    >
                      暂停到手动恢复
                    </button>
                  </div>
                )}
              </>
            ) : (
              <button className="flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-accent text-xs font-bold text-inverse hover:bg-accent-strong" onClick={props.onResume}>
                <Play size={15} /> 恢复检测
              </button>
            )}
          </div>
        </div>

        <nav className="mt-7 grid gap-1" aria-label="主导航">
          <span className="px-3 pb-2 text-xs font-bold tracking-[.16em] text-muted">空间</span>
          {navItems.map(({ page: target, label, icon: Icon }) => (
            <button
              key={target}
              className={cn('relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-muted transition-colors hover:bg-accent-soft hover:text-accent-strong 2xl:h-12 2xl:text-base', page === target && 'bg-accent-soft text-accent-strong')}
              onClick={() => {
                onPage(target)
                setSidebarOpen(false)
              }}
            >
              <Icon size={18} /> {label}
              {target === 'today' && snapshot.currentReminder ? <i className="ml-auto size-2 rounded-full bg-warning" /> : null}
            </button>
          ))}
        </nav>

        <div className="mt-auto rounded-2xl border border-edge bg-panel-muted p-3">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-panel text-accent">
              <LockKeyhole size={17} />
            </span>
            <div className="min-w-0">
              <strong className="block text-sm">本地隐私模式</strong>
              <small className="mt-0.5 block truncate text-[11px] text-muted">画面不保存、不上传</small>
            </div>
          </div>
        </div>
        <div className="mt-3 grid gap-0.5 px-2">
          <div className="mb-1 flex h-9 items-center justify-between gap-2 text-xs font-semibold text-muted">
            <span className="flex items-center gap-2">
              <Languages size={16} />
              {language === 'en-US' ? 'Language' : '界面语言'}
            </span>
            <span className="flex rounded-lg border border-edge bg-panel-muted p-0.5" role="group" aria-label={language === 'en-US' ? 'Interface language' : '界面语言'}>
              <button className={cn('rounded-md px-2 py-1 text-[10px] font-bold transition', language === 'zh-CN' ? 'bg-panel text-accent shadow-control' : 'text-subtle hover:text-foreground')} aria-pressed={language === 'zh-CN'} onClick={() => props.onLanguage('zh-CN')}>
                中
              </button>
              <button className={cn('rounded-md px-2 py-1 text-[10px] font-bold transition', language === 'en-US' ? 'bg-panel text-accent shadow-control' : 'text-subtle hover:text-foreground')} aria-pressed={language === 'en-US'} onClick={() => props.onLanguage('en-US')}>
                EN
              </button>
            </span>
          </div>
          <button className="relative flex h-9 items-center gap-2 text-xs font-semibold text-muted hover:text-accent" onClick={props.updater.open}>
            <RefreshCw size={16} /> {updaterCopy.check}
            {props.updater.updateAvailable && (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-1 text-[8px] font-extrabold text-warning">
                <i className="size-1.5 rounded-full bg-warning" />
                {updaterCopy.badge}
              </span>
            )}
          </button>
          <button className="flex h-9 items-center gap-2 text-xs font-semibold text-muted hover:text-accent" onClick={props.onHelp}>
            <CircleHelp size={16} /> {language === 'en-US' ? 'Help' : '使用帮助'}
          </button>
          <p className="mt-1 text-[10px] text-subtle">{language === 'en-US' ? `Health Reminder v${packageJson.version} · Behavior reminder` : `健康提醒 v${packageJson.version} · 行为提醒工具`}</p>
        </div>
      </aside>

      {sidebarOpen && <button className="fixed inset-0 z-20 bg-panel-strong/25 md:hidden" aria-label="关闭导航" onClick={() => setSidebarOpen(false)} />}

      <section className="relative min-h-0 min-w-0 overflow-hidden">
        <button className="absolute left-3 top-3 z-10 grid size-9 place-items-center rounded-xl border border-edge bg-panel shadow-control md:hidden" aria-label="打开导航" onClick={() => setSidebarOpen(true)}>
          <Menu size={18} />
        </button>
        <div className={cn('h-full min-h-0', page === 'privacy' ? 'overflow-y-auto' : 'overflow-hidden')}>
          {page === 'today' && <TodayPage {...props} />}
          {page === 'statistics' && <StatisticsPage statistics={props.statistics} history={props.behaviorHistory} snapshot={snapshot} />}
          {page === 'weather' && <WeatherPage language={language} />}
          {page === 'settings' && <SettingsPage snapshot={snapshot} error={props.error} onSave={props.onSaveSettings} onExport={props.onExport} onDeleteData={props.onDeleteData} onEnableCamera={props.onEnableCamera} onRecalibrate={props.onRecalibrate} />}
          {page === 'privacy' && <PrivacyPage snapshot={snapshot} onExport={props.onExport} onDeleteData={props.onDeleteData} />}
        </div>
      </section>
    </main>
  )
}
