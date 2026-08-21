import {
  Activity,
  Armchair,
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock3,
  Coffee,
  LoaderCircle,
  PersonStanding,
  Sparkles,
  TimerReset
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { languageOf } from '../../../i18n'
import type { AppSnapshot, BehaviorHistoryEvent, DailyStatistics } from '../../../types'
import { cn, compactDuration } from '../../../utils'

export function localDateKey(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function historyForDate(history: BehaviorHistoryEvent[], selectedDate: string): BehaviorHistoryEvent[] {
  return history
    .filter(event => {
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

export function virtualHistoryRange(
  itemCount: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight = HISTORY_ROW_HEIGHT,
  overscan = HISTORY_OVERSCAN
): { start: number; end: number } {
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
  const totalReminders = rows.reduce((sum, item) => sum + item.reminderCount, 0)
  const totalDismissed = rows.reduce((sum, item) => sum + item.dismissedCount, 0)
  const completion = totalReminders ? Math.round((totalBreaks / totalReminders) * 100) : 0
  const dayHistory = useMemo(() => historyForDate(history, selectedDate), [history, selectedDate])
  const historyRange = virtualHistoryRange(dayHistory.length, historyScrollTop, historyViewportHeight)
  const visibleHistory = dayHistory.slice(historyRange.start, historyRange.end)
  const visibleCalendarDays = useMemo(() => calendarDays(calendarMonth), [calendarMonth])
  const weekdayLabels = language === 'en-US' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['一', '二', '三', '四', '五', '六', '日']
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
    away: { label: '离开座位', tone: 'bg-info-soft text-info', dot: 'bg-info' },
    head_down: { label: '持续低头', tone: 'bg-warning-soft text-warning', dot: 'bg-accent' },
    break: { label: '提醒后休息', tone: 'bg-accent-soft text-accent', dot: 'bg-accent' },
    proactive_break: { label: '主动休息', tone: 'bg-accent-soft text-accent', dot: 'bg-accent' },
    early_break: { label: '提前休息', tone: 'bg-accent-soft text-accent', dot: 'bg-accent' },
    proactive_pause: { label: '主动暂停', tone: 'bg-neutral-soft text-muted', dot: 'bg-muted' },
    reminder: { label: '提醒操作', tone: 'bg-danger-soft text-danger', dot: 'bg-danger' }
  }
  const metrics = [
    { label: '日均坐姿', value: compactDuration(totalSeated / Math.max(1, rows.length), language), note: '稳定坐姿累计', icon: Armchair },
    { label: '最长连续', value: compactDuration(Math.max(0, ...rows.map(item => item.longestSeatedSeconds)), language), note: '逐步缩短即可', icon: Clock3 },
    { label: '累计低头', value: compactDuration(totalHeadDown, language), note: `${totalReminders} 次提醒`, icon: TimerReset },
    { label: '离座活动', value: compactDuration(totalAway, language), note: `${rows.reduce((sum, item) => sum + item.awayCount, 0)} 次离座`, icon: PersonStanding },
    { label: '完成休息', value: `${totalBreaks} 次`, note: `${Math.min(100, completion)}% 提醒转化`, icon: Coffee },
    { label: '忽略提醒', value: `${totalDismissed} 次`, note: totalReminders ? `${Math.round((totalDismissed / totalReminders) * 100)}% 的提醒` : '暂无提醒', icon: Bell }
  ]

  return (
    <div className="mx-auto grid h-full min-h-0 w-full max-w-[1680px] grid-rows-[auto_auto_minmax(0,1fr)] gap-5 overflow-hidden px-[clamp(24px,3.2vw,52px)] py-[clamp(22px,3vh,38px)]">
      <header className="flex shrink-0 items-end justify-between gap-5">
        <div>
          <span className="text-xs font-extrabold tracking-[.14em] text-accent">仅保存在本机</span>
          <h1 className="mb-0 mt-1.5 text-[clamp(28px,2.2vw,36px)] font-black leading-none tracking-[-.04em]">你的习惯趋势</h1>
          <p className="mb-0 mt-2.5 text-[13px] text-muted">看变化即可，不给身体表现打分。</p>
        </div>
        <div className="flex rounded-xl bg-edge-soft p-0.5 text-[11px] font-bold">
          <button className={cn('min-h-9 rounded-[10px] px-4 text-muted transition hover:text-foreground', range === 7 && 'border border-accent/55 bg-panel text-accent shadow-control')} aria-pressed={range === 7} onClick={() => setRange(7)}>近 7 天</button>
          <button className={cn('min-h-9 rounded-[10px] px-4 text-muted transition hover:text-foreground', range === 30 && 'border border-accent/55 bg-panel text-accent shadow-control')} aria-pressed={range === 30} onClick={() => setRange(30)}>近 30 天</button>
        </div>
      </header>

      <div className="grid shrink-0 grid-cols-3 gap-3 min-[1180px]:grid-cols-6">
        {metrics.map(({ label, value, note, icon: Icon }) => (
          <section className="min-w-0 rounded-[18px] border border-edge bg-panel px-3 py-3 shadow-panel" key={label}>
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-[11px] bg-accent-soft text-accent"><Icon size={17} strokeWidth={1.8} /></span>
              <span className="block truncate text-[10px] font-semibold text-muted">{label}</span>
            </div>
            <strong
              className={cn('mt-2 block whitespace-nowrap leading-none tracking-[-.025em]', language === 'en-US' ? 'text-[11px] min-[1360px]:text-[13px]' : 'text-[14px] min-[1360px]:text-[16px]')}
              title={value}
            >{value}</strong>
            <small className="mt-1.5 block truncate text-[9px] text-subtle">{note}</small>
          </section>
        ))}
      </div>

      <div className="grid min-h-0 gap-4 min-[1080px]:grid-cols-[minmax(0,1.7fr)_minmax(310px,.78fr)]">
        <section className="flex min-h-0 flex-col rounded-[22px] border border-edge bg-panel px-5 pb-4 pt-2.5 shadow-panel 2xl:px-6">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-edge-soft">
            <div className="flex items-baseline gap-3"><span className="text-[10px] font-extrabold tracking-[.12em] text-accent">每日行为</span><h2 className="m-0 text-[15px] font-black">坐姿与低头变化</h2></div>
            <span className="flex items-center gap-3 text-[10px] text-muted"><i className="size-2.5 rounded-full bg-accent" /> 坐姿 <i className="ml-2 size-2.5 rounded-full bg-warning" /> 低头</span>
          </div>

          <div className="mt-3 flex min-h-53 flex-1 flex-col">
            <div className="flex items-center justify-between text-[10px] text-muted"><span>坐姿（分钟）</span><span>低头（分钟）</span></div>
            <div className="mt-2 grid min-h-0 flex-1 grid-cols-[34px_minmax(0,1fr)_34px] gap-2">
              <div className="flex flex-col justify-between pb-7 text-right text-[9px] text-muted">
                {[seatedAxis, seatedAxis * 0.75, seatedAxis * 0.5, seatedAxis * 0.25, 0].map(value => <span key={value}>{Math.round(value)}</span>)}
              </div>
              <div className={cn('flex min-h-0 items-end border-b border-l border-r border-edge bg-[linear-gradient(to_bottom,var(--theme-edge-soft)_1px,transparent_1px)] bg-size-[100%_25%] px-2 pt-6', range === 7 ? 'gap-3' : 'gap-1')} role="img" aria-label={language === 'en-US' ? 'Sitting and head-down duration bar chart' : '坐姿与低头分钟趋势柱状图'}>
                {rows.map((item, index) => {
                  const date = new Date(`${item.localDate}T00:00:00`)
                  const seatedMinutes = Math.round(item.seatedSeconds / 60)
                  const headMinutes = Math.round(item.headDownSeconds / 60)
                  return (
                    <div className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end" key={item.localDate}>
                      <div className="pointer-events-none absolute left-1/2 top-1 z-20 w-max max-w-44 -translate-x-1/2 rounded-lg bg-panel-strong px-3 py-2 text-[9px] leading-4 text-inverse opacity-0 shadow-panel transition group-hover:opacity-100">
                        <b className="block">{date.getMonth() + 1}/{date.getDate()}</b>
                        <span className="block">坐姿 {compactDuration(item.seatedSeconds, language)}</span>
                        <span className="block">低头 {compactDuration(item.headDownSeconds, language)}</span>
                      </div>
                      <div className="flex h-[calc(100%-28px)] w-full items-end justify-center gap-1">
                        <i className="relative w-[min(28px,45%)] min-w-0 rounded-t-md bg-accent" style={{ height: `${Math.max(2, (item.seatedSeconds / (seatedAxis * 60)) * 100)}%` }}>{range === 7 && <b className="absolute -top-4 left-1/2 -translate-x-1/2 text-[8px] font-bold not-italic text-accent">{seatedMinutes}</b>}</i>
                        <i className="relative w-[min(18px,32%)] min-w-0 rounded-t-md bg-warning" style={{ height: `${Math.max(2, (item.headDownSeconds / (headAxis * 60)) * 100)}%` }}>{range === 7 && <b className="absolute -top-4 left-1/2 -translate-x-1/2 text-[8px] font-bold not-italic text-warning">{headMinutes}</b>}</i>
                      </div>
                      <span className="h-7 pt-2 text-[9px] text-muted">{range === 7 || index % 5 === 0 ? `${date.getMonth() + 1}/${date.getDate()}` : ''}</span>
                    </div>
                  )
                })}
              </div>
              <div className="flex flex-col justify-between pb-7 text-[9px] text-muted">
                {[headAxis, headAxis * 0.75, headAxis * 0.5, headAxis * 0.25, 0].map(value => <span key={value}>{Math.round(value)}</span>)}
              </div>
            </div>
          </div>

          <div className="mt-4 flex shrink-0 items-center gap-3 rounded-xl border border-edge-soft bg-panel-muted px-4 py-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent"><Sparkles size={17} /></span>
            <p className="min-w-0 truncate text-[10px] text-muted"><b className="mr-3 text-foreground">本期观察</b>{snapshot.today.breakCount > 0 ? '你正在主动打断久坐，继续保持自己的节奏。' : '今天可以从一次主动休息开始。'}</p>
          </div>
        </section>

        <section className="flex min-h-0 flex-col overflow-visible rounded-[22px] border border-edge bg-panel px-5 pb-4 pt-2.5 shadow-panel">
          <div className="relative z-20 flex h-12 shrink-0 items-center justify-between border-b border-edge-soft" ref={calendarRef}>
            <div><h2 className="m-0 text-[15px] font-black">最近记录</h2><span className="mt-0.5 block text-[9px] text-muted">{selectedDate === today ? '今日' : selectedDateLabel} · 全部 {dayHistory.length} 条</span></div>
            <button className={cn('grid size-9 place-items-center rounded-[10px] border border-edge bg-panel text-accent shadow-control transition hover:border-accent/45 hover:bg-accent-soft', calendarOpen && 'border-accent bg-accent-soft')} aria-label="选择行为记录日期" aria-expanded={calendarOpen} aria-haspopup="dialog" onClick={toggleCalendar}><CalendarDays size={17} /></button>
            {calendarOpen && (
              <div className="absolute right-0 top-[52px] z-30 w-[min(320px,calc(100vw-32px))] overflow-hidden rounded-[20px] border border-edge bg-panel shadow-[0_22px_60px_rgba(25,48,33,.2)]" role="dialog" aria-label="行为记录日期">
                <div className="grid grid-cols-[32px_32px_minmax(0,1fr)_32px_32px] items-center border-b border-edge-soft px-3 py-3">
                  <button className="grid size-8 place-items-center rounded-lg text-subtle transition hover:bg-panel-muted hover:text-foreground" aria-label="上一年" onClick={() => moveCalendar(-12)}><ChevronsLeft size={17} /></button>
                  <button className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-panel-muted hover:text-foreground" aria-label="上个月" onClick={() => moveCalendar(-1)}><ChevronLeft size={17} /></button>
                  <strong className="text-center text-[13px] font-black tracking-[.04em]">{calendarMonthLabel}</strong>
                  <button className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-panel-muted hover:text-foreground" aria-label="下个月" onClick={() => moveCalendar(1)}><ChevronRight size={17} /></button>
                  <button className="grid size-8 place-items-center rounded-lg text-subtle transition hover:bg-panel-muted hover:text-foreground" aria-label="下一年" onClick={() => moveCalendar(12)}><ChevronsRight size={17} /></button>
                </div>

                <div className="px-4 pb-3 pt-4">
                  <div className="grid grid-cols-7 text-center text-[10px] font-bold text-muted">
                    {weekdayLabels.map(label => <span className="py-1" key={label}>{label}</span>)}
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
                        >{day.date.getDate()}</button>
                      )
                    })}
                  </div>
                </div>

                <button className="flex min-h-11 w-full items-center justify-center border-t border-edge-soft bg-panel-muted text-[11px] font-bold text-accent transition hover:bg-accent-soft" onClick={() => selectCalendarDate(today)}>今天</button>
              </div>
            )}
          </div>

          <div
            className="themed-scrollbar min-h-0 flex-1 overflow-y-auto pr-1"
            onScroll={event => setHistoryScrollTop(event.currentTarget.scrollTop)}
            ref={historyListRef}
          >
            {historyLoading ? (
              <div className="grid h-full min-h-40 place-content-center justify-items-center gap-3 text-center text-muted" role="status"><LoaderCircle className="animate-spin text-accent" size={22} /><span className="text-[11px]">正在读取当日记录…</span></div>
            ) : dayHistory.length ? (
              <div
                className="relative"
                role="list"
                style={{ height: dayHistory.length * HISTORY_ROW_HEIGHT }}
              >
                {visibleHistory.map((event, visibleIndex) => {
                  const absoluteIndex = historyRange.start + visibleIndex
                  const copy = eventCopy[event.eventType]
                  const when = new Date(event.startedAt)
                  return (
                    <div
                      aria-posinset={absoluteIndex + 1}
                      aria-setsize={dayHistory.length}
                      className={cn(
                        'absolute inset-x-0 top-0 grid h-17 grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3',
                        absoluteIndex < dayHistory.length - 1 && 'border-b border-edge-soft'
                      )}
                      key={event.id}
                      role="listitem"
                      style={{ transform: `translateY(${absoluteIndex * HISTORY_ROW_HEIGHT}px)` }}
                    >
                      <span className={cn('grid size-9 place-items-center rounded-xl', copy.tone)}><Activity size={16} /></span>
                      <div className="min-w-0">
                        <strong className="block truncate text-[11px]">{copy.label}</strong>
                        <small className="mt-1 flex items-center gap-1.5 truncate text-[9px] text-muted"><i className={cn('size-1.5 shrink-0 rounded-full', copy.dot)} />{Number.isNaN(when.getTime()) ? event.startedAt : when.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' })}{event.action ? ` · ${historyActionLabel(event.action)}` : ''}</small>
                      </div>
                      <b className="max-w-24 text-right text-[9px] leading-4 text-muted">{event.durationSeconds ? compactDuration(event.durationSeconds, language) : '即时'}</b>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="grid place-content-center justify-items-center gap-3 text-center text-muted"><span className="grid size-12 place-items-center rounded-2xl bg-panel-muted"><CalendarDays size={24} /></span><span className="text-[11px]">{selectedDate === today ? '今日还没有行为记录' : `${selectedDateLabel} 没有行为记录`}</span></div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function historyActionLabel(action: string): string {
  return ({
    returned: '已返回',
    recovered: '已恢复',
    started: '已开始',
    completed: '已完成',
    timed: '定时暂停',
    manual: '手动恢复',
    '30_minutes': '暂停 30 分钟',
    snoozed: '稍后提醒',
    dismissed: '已忽略'
  } as Record<string, string>)[action] ?? action
}
