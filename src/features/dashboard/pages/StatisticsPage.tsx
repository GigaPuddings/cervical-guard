import { Activity, Armchair, Bell, CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Clock3, Coffee, LoaderCircle, PersonStanding, Sparkles, TimerReset } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChartCard } from '../../../components/ChartCard'
import { MetricCard } from '../../../components/MetricCard'
import { SectionHeader } from '../../../components/SectionHeader'
import { languageOf } from '../../../i18n'
import { defineMessages, localizeMessages } from '../../../runtimeI18n'
import type { AppSnapshot, BehaviorHistoryEvent, DailyStatistics } from '../../../types'
import { cn, compactDuration } from '../../../utils'
import { reminderFollowupCount } from '../todayInsights'

const statisticsMessages = defineMessages({
  away: '离开座位',
  headDown: '持续低头',
  breakAfterReminder: '提醒后休息',
  proactiveBreak: '主动休息',
  earlyBreak: '提前休息',
  proactivePause: '主动暂停',
  reminderAction: '提醒操作',
  averageSitting: '每日坐姿时间',
  dailyAverage: '日均值',
  longest: '最长连续坐姿',
  appearedOn: '出现在',
  cumulativeHeadDown: '累计低头时间',
  dailyAveragePrefix: '日均',
  reminders: '次提醒',
  awayActivity: '离座活动时间',
  awayEvents: '次离座',
  completedBreaks: '完成休息次数',
  times: '次',
  conversion: '提醒转化',
  reminderFollowups: '提醒延后/关闭',
  ofReminders: '的提醒',
  noReminders: '暂无提醒',
  localOnly: '习惯趋势',
  title: '你的习惯趋势',
  subtitle: '数据来自本地检测，仅供参考。坚持良好习惯，守护颈椎健康。',
  last7Days: '近 7 天',
  last30Days: '近 30 天',
  dailyBehavior: '每日行为',
  trendTitle: '坐姿与低头变化',
  sitting: '坐姿',
  headDownShort: '低头',
  sittingMinutes: '坐姿（分钟）',
  headDownMinutes: '低头（分钟）',
  chartLabel: '坐姿与低头分钟趋势柱状图',
  observation: '本期观察',
  positiveObservation: '你正在主动打断久坐，继续保持自己的节奏。',
  emptyObservation: '今天可以从一次主动休息开始。',
  recent: '最近记录',
  today: '今日',
  all: '全部',
  records: '条',
  chooseDate: '选择行为记录日期',
  historyDate: '行为记录日期',
  previousYear: '上一年',
  previousMonth: '上个月',
  nextMonth: '下个月',
  nextYear: '下一年',
  todayButton: '今天',
  loadingHistory: '正在读取当日记录…',
  instant: '即时',
  noHistoryToday: '今日还没有行为记录',
  noHistory: '没有行为记录'
})

const historyActionMessages = defineMessages({
  returned: '已返回',
  recovered: '已恢复',
  started: '已开始',
  completed: '已完成',
  timed: '定时暂停',
  manual: '手动恢复',
  pause30: '暂停 30 分钟',
  snoozed: '稍后提醒',
  dismissed: '已关闭'
})

export function localDateKey(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function historyForDate(history: BehaviorHistoryEvent[], selectedDate: string): BehaviorHistoryEvent[] {
  return history.filter(event => {
    const date = new Date(event.startedAt)
    return !Number.isNaN(date.getTime()) && localDateKey(date) === selectedDate
  })
}

export interface CalendarDay {
  date: Date
  dateKey: string
  inCurrentMonth: boolean
}

export function calendarDays(month: Date): CalendarDay[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12)
  const mondayOffset = (first.getDay() + 6) % 7
  const start = new Date(first)
  start.setDate(first.getDate() - mondayOffset)
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return {
      date,
      dateKey: localDateKey(date),
      inCurrentMonth: date.getMonth() === month.getMonth() && date.getFullYear() === month.getFullYear()
    }
  })
}

function monthStart(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), 1, 12)
}

function roundedAxisMaximum(seconds: number, stepMinutes: number): number {
  const minutes = Math.max(1, seconds / 60)
  return Math.max(stepMinutes, Math.ceil(minutes / stepMinutes) * stepMinutes)
}

const HISTORY_ROW_HEIGHT = 68
const HISTORY_OVERSCAN = 2

export function virtualHistoryRange(itemCount: number, scrollTop: number, viewportHeight: number, rowHeight = HISTORY_ROW_HEIGHT, overscan = HISTORY_OVERSCAN): { start: number; end: number } {
  const count = Math.max(0, Math.floor(itemCount))
  if (!count) return { start: 0, end: 0 }

  const safeRowHeight = Math.max(1, rowHeight)
  const safeOverscan = Math.max(0, Math.floor(overscan))
  const firstVisible = Math.min(count - 1, Math.floor(Math.max(0, scrollTop) / safeRowHeight))
  const visibleCount = Math.max(1, Math.ceil(Math.max(0, viewportHeight) / safeRowHeight))
  return {
    start: Math.max(0, firstVisible - safeOverscan),
    end: Math.min(count, firstVisible + visibleCount + safeOverscan)
  }
}

export function StatisticsPage({ statistics, history, snapshot, onHistoryDate }: { statistics: DailyStatistics[]; history: BehaviorHistoryEvent[]; snapshot: AppSnapshot; onHistoryDate: (localDate: string) => Promise<void> }) {
  const language = languageOf(snapshot.settings.language)
  const messages = localizeMessages(statisticsMessages, language)
  const actionMessages = localizeMessages(historyActionMessages, language)
  const today = localDateKey(new Date())
  const [range, setRange] = useState<7 | 30>(7)
  const [selectedDate, setSelectedDate] = useState(today)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(() => monthStart(new Date()))
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyScrollTop, setHistoryScrollTop] = useState(0)
  const [historyViewportHeight, setHistoryViewportHeight] = useState(0)
  const calendarRef = useRef<HTMLDivElement>(null)
  const historyListRef = useRef<HTMLDivElement>(null)
  const historyRequest = useRef(0)
  const rows = statistics.slice(-range)
  const maxSeated = Math.max(1, ...rows.map(item => item.seatedSeconds))
  const maxHeadDown = Math.max(1, ...rows.map(item => item.headDownSeconds))
  const seatedAxis = roundedAxisMaximum(maxSeated, 20)
  const headAxis = roundedAxisMaximum(maxHeadDown, 5)
  const totalSeated = rows.reduce((sum, item) => sum + item.seatedSeconds, 0)
  const totalHeadDown = rows.reduce((sum, item) => sum + item.headDownSeconds, 0)
  const totalAway = rows.reduce((sum, item) => sum + item.awaySeconds, 0)
  const totalBreaks = rows.reduce((sum, item) => sum + item.breakCount, 0)
  const totalReminderFollowups = rows.reduce((sum, item) => sum + reminderFollowupCount(item), 0)
  const dayHistory = useMemo(() => historyForDate(history, selectedDate), [history, selectedDate])
  const historyRange = virtualHistoryRange(dayHistory.length, historyScrollTop, historyViewportHeight)
  const visibleHistory = dayHistory.slice(historyRange.start, historyRange.end)
  const visibleCalendarDays = useMemo(() => calendarDays(calendarMonth), [calendarMonth])
  const weekdayLabels = Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(language, { weekday: 'short' }).format(new Date(2026, 7, 17 + index, 12)))
  const calendarMonthLabel = new Intl.DateTimeFormat(language, { year: 'numeric', month: 'long' }).format(calendarMonth)
  const selectedDateLabel = new Intl.DateTimeFormat(language, {
    month: 'short',
    day: 'numeric',
    ...(selectedDate.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' as const } : {})
  }).format(new Date(`${selectedDate}T00:00:00`))

  const moveCalendar = (months: number) => {
    setCalendarMonth(current => new Date(current.getFullYear(), current.getMonth() + months, 1, 12))
  }

  const toggleCalendar = () => {
    if (!calendarOpen) setCalendarMonth(monthStart(new Date(`${selectedDate}T12:00:00`)))
    setCalendarOpen(value => !value)
  }

  const selectCalendarDate = (dateKey: string) => {
    setSelectedDate(dateKey)
    setCalendarOpen(false)
    setHistoryLoading(true)
    const request = ++historyRequest.current
    void onHistoryDate(dateKey).finally(() => {
      if (request === historyRequest.current) setHistoryLoading(false)
    })
  }

  useEffect(() => {
    if (!calendarOpen) return
    const close = (event: PointerEvent) => {
      if (!calendarRef.current?.contains(event.target as Node)) setCalendarOpen(false)
    }
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setCalendarOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', closeWithEscape)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', closeWithEscape)
    }
  }, [calendarOpen])

  useEffect(() => {
    const list = historyListRef.current
    if (!list) return
    const updateViewportHeight = () => setHistoryViewportHeight(list.clientHeight)
    updateViewportHeight()
    const observer = new ResizeObserver(updateViewportHeight)
    observer.observe(list)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (historyListRef.current) historyListRef.current.scrollTop = 0
    setHistoryScrollTop(0)
  }, [selectedDate])

  const eventCopy: Record<BehaviorHistoryEvent['eventType'], { label: string; tone: string; dot: string }> = {
    away: { label: messages.away, tone: 'bg-info-soft text-info', dot: 'bg-info' },
    head_down: { label: messages.headDown, tone: 'bg-warning-soft text-warning', dot: 'bg-accent' },
    break: { label: messages.breakAfterReminder, tone: 'bg-accent-soft text-accent', dot: 'bg-accent' },
    proactive_break: { label: messages.proactiveBreak, tone: 'bg-accent-soft text-accent', dot: 'bg-accent' },
    early_break: { label: messages.earlyBreak, tone: 'bg-accent-soft text-accent', dot: 'bg-accent' },
    proactive_pause: { label: messages.proactivePause, tone: 'bg-neutral-soft text-muted', dot: 'bg-muted' },
    reminder: { label: messages.reminderAction, tone: 'bg-danger-soft text-danger', dot: 'bg-danger' }
  }
  const dayCount = Math.max(1, rows.length)
  const longestRow = rows.reduce<DailyStatistics | undefined>((current, item) => (!current || item.longestSeatedSeconds > current.longestSeatedSeconds ? item : current), undefined)
  const averageCount = (value: number) => {
    const average = value / dayCount
    return Number.isInteger(average) ? String(average) : average.toFixed(1)
  }
  const metrics = [
    { label: messages.averageSitting, value: compactDuration(totalSeated / dayCount, language), note: messages.dailyAverage, icon: Armchair },
    { label: messages.longest, value: compactDuration(longestRow?.longestSeatedSeconds ?? 0, language), note: longestRow ? `${messages.appearedOn} ${Number(longestRow.localDate.slice(5, 7))}/${Number(longestRow.localDate.slice(8, 10))}` : messages.noHistory, icon: Clock3 },
    { label: messages.cumulativeHeadDown, value: compactDuration(totalHeadDown, language), note: `${messages.dailyAveragePrefix} ${compactDuration(totalHeadDown / dayCount, language)}`, icon: TimerReset },
    { label: messages.awayActivity, value: compactDuration(totalAway, language), note: `${messages.dailyAveragePrefix} ${Math.round((totalAway / Math.max(1, totalAway + totalSeated)) * 100)}%`, icon: PersonStanding },
    { label: messages.completedBreaks, value: `${totalBreaks} ${messages.times}`, note: `${messages.dailyAveragePrefix} ${averageCount(totalBreaks)} ${messages.times}`, icon: Coffee },
    { label: messages.reminderFollowups, value: `${totalReminderFollowups} ${messages.times}`, note: `${messages.dailyAveragePrefix} ${averageCount(totalReminderFollowups)} ${messages.times}`, icon: Bell }
  ]

  return (
    <div className="statistics-page-layout themed-scrollbar mx-auto grid h-full min-h-0 w-full max-w-337 grid-rows-[108px_300px_minmax(0,1fr)] gap-y-6 overflow-hidden px-7 pb-10 pt-6 min-[1180px]:grid-rows-[108px_144px_minmax(0,1fr)]">
      <SectionHeader
        className="statistics-page-header [&_h1]:mt-3 [&_h1]:text-[34px] [&_p]:mt-2.5 [&_p]:text-[13px]"
        eyebrow={messages.localOnly}
        title={messages.title}
        subtitle={messages.subtitle}
        actions={
          <div className="mt-9 flex h-11 w-59 rounded-[15px] border border-edge bg-panel p-0.75 text-[13px] font-bold shadow-control">
            <button className={cn('h-full flex-1 rounded-[11px] transition', range === 7 ? 'bg-accent text-inverse shadow-control' : 'text-muted')} aria-pressed={range === 7} onClick={() => setRange(7)}>
              {messages.last7Days}
            </button>
            <button className={cn('h-full flex-1 rounded-[11px] transition', range === 30 ? 'bg-accent text-inverse shadow-control' : 'text-muted')} aria-pressed={range === 30} onClick={() => setRange(30)}>
              {messages.last30Days}
            </button>
          </div>
        }
      />

      <div className="statistics-metrics-grid grid shrink-0 grid-cols-3 gap-3 min-[1180px]:grid-cols-6">
        {metrics.map(({ label, value, note, icon }, index) => (
          <MetricCard compact icon={icon} label={label} value={value} note={note} tone={index === 5 ? 'amber' : 'green'} language={language} key={label} />
        ))}
      </div>

      <div className="grid min-h-0 gap-4 min-[1080px]:grid-cols-[minmax(0,1.7fr)_minmax(310px,.78fr)]">
        <ChartCard
          className="px-5 pb-4"
          eyebrow={messages.dailyBehavior}
          title={messages.trendTitle}
          legend={
            <span className="flex items-center gap-3 text-[10px] text-muted">
              <i className="size-2.5 rounded-full bg-accent" /> {messages.sitting} <i className="ml-2 size-2.5 rounded-full bg-warning" /> {messages.headDownShort}
            </span>
          }
        >
          <div className="mt-3 flex min-h-53 flex-1 flex-col">
            <div className="flex items-center justify-between text-[10px] text-muted">
              <span>{messages.sittingMinutes}</span>
              <span>{messages.headDownMinutes}</span>
            </div>
            <div className="mt-2 grid min-h-0 flex-1 grid-cols-[34px_minmax(0,1fr)_34px] gap-2">
              <div className="flex flex-col justify-between pb-7 text-right text-[9px] text-muted">
                {[seatedAxis, seatedAxis * 0.75, seatedAxis * 0.5, seatedAxis * 0.25, 0].map(value => (
                  <span key={value}>{Math.round(value)}</span>
                ))}
              </div>
              <div className={cn('flex min-h-0 items-end border-b border-l border-r border-edge bg-[linear-gradient(to_bottom,var(--theme-edge-soft)_1px,transparent_1px)] bg-size-[100%_25%] px-2 pt-6', range === 7 ? 'gap-3' : 'gap-1')} role="img" aria-label={messages.chartLabel}>
                {rows.map((item, index) => {
                  const date = new Date(`${item.localDate}T00:00:00`)
                  const seatedMinutes = Math.round(item.seatedSeconds / 60)
                  const headMinutes = Math.round(item.headDownSeconds / 60)
                  return (
                    <div className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end" key={item.localDate}>
                      <div className="pointer-events-none absolute left-1/2 top-1 z-20 w-max max-w-44 -translate-x-1/2 rounded-lg bg-panel-strong px-3 py-2 text-[9px] leading-4 text-inverse opacity-0 shadow-panel transition group-hover:opacity-100">
                        <b className="block">
                          {date.getMonth() + 1}/{date.getDate()}
                        </b>
                        <span className="block">
                          {messages.sitting} {compactDuration(item.seatedSeconds, language)}
                        </span>
                        <span className="block">
                          {messages.headDownShort} {compactDuration(item.headDownSeconds, language)}
                        </span>
                      </div>
                      <div className="flex h-[calc(100%-28px)] w-full items-end justify-center gap-1">
                        <i className="relative w-[min(28px,45%)] min-w-0 rounded-t-md bg-accent" style={{ height: `${Math.max(2, (item.seatedSeconds / (seatedAxis * 60)) * 100)}%` }}>
                          {range === 7 && <b className="absolute -top-4 left-1/2 -translate-x-1/2 text-[8px] font-bold not-italic text-accent">{seatedMinutes}</b>}
                        </i>
                        <i className="relative w-[min(18px,32%)] min-w-0 rounded-t-md bg-warning" style={{ height: `${Math.max(2, (item.headDownSeconds / (headAxis * 60)) * 100)}%` }}>
                          {range === 7 && <b className="absolute -top-4 left-1/2 -translate-x-1/2 text-[8px] font-bold not-italic text-warning">{headMinutes}</b>}
                        </i>
                      </div>
                      <span className="h-7 pt-2 text-[9px] text-muted">{range === 7 || index % 5 === 0 ? `${date.getMonth() + 1}/${date.getDate()}` : ''}</span>
                    </div>
                  )
                })}
              </div>
              <div className="flex flex-col justify-between pb-7 text-[9px] text-muted">
                {[headAxis, headAxis * 0.75, headAxis * 0.5, headAxis * 0.25, 0].map(value => (
                  <span key={value}>{Math.round(value)}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 flex shrink-0 items-center gap-3 rounded-xl border border-edge-soft bg-panel-muted px-4 py-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
              <Sparkles size={17} />
            </span>
            <p className="min-w-0 truncate text-[10px] text-muted">
              <b className="mr-3 text-foreground">{messages.observation}</b>
              {snapshot.today.breakCount > 0 ? messages.positiveObservation : messages.emptyObservation}
            </p>
          </div>
        </ChartCard>

        <section className="flex min-h-0 flex-col overflow-visible rounded-2xl border border-edge bg-panel px-5 pb-4 pt-2.5 shadow-panel">
          <div className="relative z-20 flex h-12 shrink-0 items-center justify-between border-b border-edge-soft" ref={calendarRef}>
            <div>
              <h2 className="m-0 text-[15px] font-black">{messages.recent}</h2>
              <span className="mt-0.5 block text-[9px] text-muted">
                {selectedDate === today ? messages.today : selectedDateLabel} · {messages.all} {dayHistory.length} {messages.records}
              </span>
            </div>
            <button className={cn('grid size-9 place-items-center rounded-[10px] border border-edge bg-panel text-accent shadow-control transition hover:border-accent/45 hover:bg-accent-soft', calendarOpen && 'border-accent bg-accent-soft')} aria-label={messages.chooseDate} aria-expanded={calendarOpen} aria-haspopup="dialog" onClick={toggleCalendar}>
              <CalendarDays size={17} />
            </button>
            {calendarOpen && (
              <div className="absolute right-0 top-13 z-30 w-[min(320px,calc(100vw-32px))] overflow-hidden rounded-[20px] border border-edge bg-panel shadow-[0_22px_60px_rgba(25,48,33,.2)]" role="dialog" aria-label={messages.historyDate}>
                <div className="grid grid-cols-[32px_32px_minmax(0,1fr)_32px_32px] items-center border-b border-edge-soft px-3 py-3">
                  <button className="grid size-8 place-items-center rounded-lg text-subtle transition hover:bg-panel-muted hover:text-foreground" aria-label={messages.previousYear} onClick={() => moveCalendar(-12)}>
                    <ChevronsLeft size={17} />
                  </button>
                  <button className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-panel-muted hover:text-foreground" aria-label={messages.previousMonth} onClick={() => moveCalendar(-1)}>
                    <ChevronLeft size={17} />
                  </button>
                  <strong className="text-center text-[13px] font-black tracking-[.04em]">{calendarMonthLabel}</strong>
                  <button className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-panel-muted hover:text-foreground" aria-label={messages.nextMonth} onClick={() => moveCalendar(1)}>
                    <ChevronRight size={17} />
                  </button>
                  <button className="grid size-8 place-items-center rounded-lg text-subtle transition hover:bg-panel-muted hover:text-foreground" aria-label={messages.nextYear} onClick={() => moveCalendar(12)}>
                    <ChevronsRight size={17} />
                  </button>
                </div>

                <div className="px-4 pb-3 pt-4">
                  <div className="grid grid-cols-7 text-center text-[10px] font-bold text-muted">
                    {weekdayLabels.map(label => (
                      <span className="py-1" key={label}>
                        {label}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 grid grid-cols-7 gap-y-1">
                    {visibleCalendarDays.map(day => {
                      const selected = day.dateKey === selectedDate
                      const isToday = day.dateKey === today
                      return (
                        <button
                          className={cn(
                            'mx-auto grid size-8 place-items-center rounded-[10px] text-[11px] font-semibold transition',
                            day.inCurrentMonth ? 'text-foreground hover:bg-accent-soft hover:text-accent' : 'text-subtle/45 hover:bg-panel-muted hover:text-muted',
                            isToday && !selected && 'border border-accent/35 font-black text-accent',
                            selected && 'border-transparent bg-accent text-inverse shadow-control hover:bg-accent-strong hover:text-inverse'
                          )}
                          aria-label={new Intl.DateTimeFormat(language, { dateStyle: 'full' }).format(day.date)}
                          aria-pressed={selected}
                          onClick={() => selectCalendarDate(day.dateKey)}
                          key={day.dateKey}
                        >
                          {day.date.getDate()}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <button className="flex min-h-11 w-full items-center justify-center border-t border-edge-soft bg-panel-muted text-[11px] font-bold text-accent transition hover:bg-accent-soft" onClick={() => selectCalendarDate(today)}>
                  {messages.todayButton}
                </button>
              </div>
            )}
          </div>

          <div className="themed-scrollbar min-h-0 flex-1 overflow-y-auto pr-1" onScroll={event => setHistoryScrollTop(event.currentTarget.scrollTop)} ref={historyListRef}>
            {historyLoading ? (
              <div className="grid h-full min-h-40 place-content-center justify-items-center gap-3 text-center text-muted" role="status">
                <LoaderCircle className="animate-spin text-accent" size={22} />
                <span className="text-[11px]">{messages.loadingHistory}</span>
              </div>
            ) : dayHistory.length ? (
              <div className="relative" role="list" style={{ height: dayHistory.length * HISTORY_ROW_HEIGHT }}>
                {visibleHistory.map((event, visibleIndex) => {
                  const absoluteIndex = historyRange.start + visibleIndex
                  const copy = eventCopy[event.eventType]
                  const when = new Date(event.startedAt)
                  return (
                    <div aria-posinset={absoluteIndex + 1} aria-setsize={dayHistory.length} className={cn('absolute inset-x-0 top-0 grid h-17 grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3', absoluteIndex < dayHistory.length - 1 && 'border-b border-edge-soft')} key={event.id} role="listitem" style={{ transform: `translateY(${absoluteIndex * HISTORY_ROW_HEIGHT}px)` }}>
                      <span className={cn('grid size-9 place-items-center rounded-xl', copy.tone)}>
                        <Activity size={16} />
                      </span>
                      <div className="min-w-0">
                        <strong className="block truncate text-[11px]">{copy.label}</strong>
                        <small className="mt-1 flex items-center gap-1.5 truncate text-[9px] text-muted">
                          <i className={cn('size-1.5 shrink-0 rounded-full', copy.dot)} />
                          {Number.isNaN(when.getTime()) ? event.startedAt : when.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' })}
                          {event.action ? ` · ${historyActionLabel(event.action, actionMessages)}` : ''}
                        </small>
                      </div>
                      <b className="max-w-24 text-right text-[9px] leading-4 text-muted">{event.durationSeconds ? compactDuration(event.durationSeconds, language) : messages.instant}</b>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="grid place-content-center justify-items-center gap-3 text-center text-muted">
                <span className="grid size-12 place-items-center rounded-2xl bg-panel-muted">
                  <CalendarDays size={24} />
                </span>
                <span className="text-[11px]">{selectedDate === today ? messages.noHistoryToday : `${selectedDateLabel} ${messages.noHistory}`}</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function historyActionLabel(action: string, messages: Record<string, string>): string {
  return (
    (
      {
        returned: messages.returned,
        recovered: messages.recovered,
        started: messages.started,
        completed: messages.completed,
        timed: messages.timed,
        manual: messages.manual,
        '30_minutes': messages.pause30,
        snoozed: messages.snoozed,
        dismissed: messages.dismissed
      } as Record<string, string>
    )[action] ?? action
  )
}
