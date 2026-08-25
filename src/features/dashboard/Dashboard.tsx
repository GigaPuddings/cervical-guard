import { FileHeart, Menu } from 'lucide-react'
import { useState } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { Sidebar } from '../../components/Sidebar'
import { languageOf } from '../../i18n'
import { defineMessages, localizeMessages } from '../../runtimeI18n'
import { cn } from '../../utils'
import { WeatherPage } from '../weather/WeatherPage'
import type { DashboardProps } from './dashboardTypes'
import { PrivacyPage } from './pages/PrivacyPage'
import { SettingsPage } from './pages/SettingsPage'
import { StatisticsPage } from './pages/StatisticsPage'
import { TodayPage } from './pages/TodayPage'

export type { DashboardProps } from './dashboardTypes'

const dashboardMessages = defineMessages({
  closeNavigation: '关闭导航',
  openNavigation: '打开导航',
  reportTitle: '健康报告正在汇总',
  reportDescription: '完成更多检测与休息记录后，这里会生成一份仅保存在本机的健康习惯报告。'
})

export function Dashboard(props: DashboardProps) {
  const { snapshot, page, onPage } = props
  const language = languageOf(snapshot.settings.language)
  const messages = localizeMessages(dashboardMessages, language)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <main className="dashboard-shell grid h-full min-h-0 overflow-hidden bg-canvas text-foreground md:grid-cols-[240px_minmax(0,1fr)]">
      <Sidebar snapshot={snapshot} page={page} language={language} open={sidebarOpen} onClose={() => setSidebarOpen(false)} onPage={onPage} onPause={props.onPause} onResume={props.onResume} onEndBreak={props.onEndBreak} onLanguage={props.onLanguage} onHelp={props.onHelp} updater={props.updater} />

      {sidebarOpen ? <button className="fixed inset-0 z-30 bg-panel-strong/20 md:hidden" aria-label={messages.closeNavigation} onClick={() => setSidebarOpen(false)} /> : null}

      <section className="relative min-h-0 min-w-0 overflow-hidden">
        <button className="absolute left-3 top-3 z-20 grid size-9 place-items-center rounded-[12px] border border-edge bg-panel shadow-control md:hidden" aria-label={messages.openNavigation} onClick={() => setSidebarOpen(true)}>
          <Menu size={18} />
        </button>
        <div className={cn('h-full min-h-0', page === 'privacy' ? 'overflow-y-auto' : 'overflow-hidden')}>
          {page === 'today' ? <TodayPage {...props} /> : null}
          {page === 'statistics' ? <StatisticsPage statistics={props.statistics} history={props.behaviorHistory} snapshot={snapshot} onHistoryDate={props.onBehaviorHistoryDate} /> : null}
          {page === 'weather' ? <WeatherPage language={language} /> : null}
          {page === 'report' ? <EmptyState icon={FileHeart} title={messages.reportTitle} description={messages.reportDescription} /> : null}
          {page === 'settings' ? <SettingsPage snapshot={snapshot} error={props.error} onSave={props.onSaveSettings} onExport={props.onExport} onDeleteData={props.onDeleteData} onEnableCamera={props.onEnableCamera} onRecalibrate={props.onRecalibrate} /> : null}
          {page === 'privacy' ? <PrivacyPage snapshot={snapshot} onExport={props.onExport} onDeleteData={props.onDeleteData} /> : null}
        </div>
      </section>
    </main>
  )
}
