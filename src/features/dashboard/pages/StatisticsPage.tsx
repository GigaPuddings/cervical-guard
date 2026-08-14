import { Activity, CalendarClock, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { languageOf } from '../../../i18n'
import type { AppSnapshot, BehaviorHistoryEvent, DailyStatistics } from '../../../types'
import { cn, compactDuration } from '../../../utils'

export function StatisticsPage({ statistics, history, snapshot }: { statistics: DailyStatistics[]; history: BehaviorHistoryEvent[]; snapshot: AppSnapshot }) {
  const [range, setRange] = useState<7 | 30>(7)
  const rows = statistics.slice(-range)
  const maxSeated = Math.max(1, ...rows.map(item => item.seatedSeconds))
  const totalSeated = rows.reduce((sum, item) => sum + item.seatedSeconds, 0)
  const totalHeadDown = rows.reduce((sum, item) => sum + item.headDownSeconds, 0)
  const totalAway = rows.reduce((sum, item) => sum + item.awaySeconds, 0)
  const totalBreaks = rows.reduce((sum, item) => sum + item.breakCount, 0)
  const totalReminders = rows.reduce((sum, item) => sum + item.reminderCount, 0)
  const totalDismissed = rows.reduce((sum, item) => sum + item.dismissedCount, 0)
  const completion = totalReminders ? Math.round((totalBreaks / totalReminders) * 100) : 0
  const latestHistory = history.slice(0, 6)
  const eventCopy: Record<BehaviorHistoryEvent['eventType'], { label: string; tone: string }> = {
    away: { label: '离开座位', tone: 'bg-info-soft text-info' },
    head_down: { label: '持续低头', tone: 'bg-warning-soft text-warning' },
    break: { label: '提醒后休息', tone: 'bg-accent-soft text-accent' },
    proactive_break: { label: '主动休息', tone: 'bg-accent-soft text-accent' },
    early_break: { label: '提前休息', tone: 'bg-accent-soft text-accent' },
    proactive_pause: { label: '主动暂停', tone: 'bg-neutral-soft text-muted' },
    reminder: { label: '提醒操作', tone: 'bg-danger-soft text-danger' }
  }

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-3 overflow-hidden p-5 xl:p-7">
      <header className="flex shrink-0 items-end justify-between gap-4">
        <div>
          <span className="text-[10px] font-extrabold tracking-[.16em] text-accent">仅保存在本机</span>
          <h1 className="mt-1 text-[clamp(24px,2.4vw,34px)] font-black tracking-[-.04em]">你的习惯趋势</h1>
          <p className="mt-1 text-xs text-muted">看变化即可，不给身体表现打分。</p>
        </div>
        <div className="flex rounded-xl bg-edge-soft p-1 text-[10px] font-bold">
          <button className={cn('rounded-lg px-3 py-2 text-muted', range === 7 && 'bg-panel text-accent shadow-control')} onClick={() => setRange(7)}>
            近 7 天
          </button>
          <button className={cn('rounded-lg px-3 py-2 text-muted', range === 30 && 'bg-panel text-accent shadow-control')} onClick={() => setRange(30)}>
            近 30 天
          </button>
        </div>
      </header>
      <div className="grid shrink-0 grid-cols-3 gap-2 min-[1180px]:grid-cols-6">
        {[
          ['日均坐姿', compactDuration(totalSeated / Math.max(1, rows.length)), '稳定坐姿累计'],
          ['最长连续', compactDuration(Math.max(0, ...rows.map(item => item.longestSeatedSeconds))), '逐步缩短即可'],
          ['累计低头', compactDuration(totalHeadDown), `${totalReminders} 次提醒`],
          ['离座活动', compactDuration(totalAway), `${rows.reduce((sum, item) => sum + item.awayCount, 0)} 次离座`],
          ['完成休息', `${totalBreaks} 次`, `${Math.min(100, completion)}% 提醒转化`],
          ['忽略提醒', `${totalDismissed} 次`, totalReminders ? `${Math.round((totalDismissed / totalReminders) * 100)}% 的提醒` : '暂无提醒']
        ].map(([label, value, note]) => (
          <section className="min-w-0 rounded-2xl border border-edge bg-panel px-3 py-2.5 shadow-panel" key={label}>
            <span className="block truncate text-[8px] text-muted">{label}</span>
            <strong className="mt-1 block truncate text-lg tracking-[-.04em]">{value}</strong>
            <small className="block truncate text-[7px] text-subtle">{note}</small>
          </section>
        ))}
      </div>
      <div className="grid min-h-0 gap-3 min-[1080px]:grid-cols-[minmax(0,1.55fr)_minmax(300px,.75fr)]">
        <section className="flex min-h-0 flex-col rounded-card border border-edge bg-panel px-5 pb-3 pt-4 shadow-panel">
          <div className="flex shrink-0 items-center justify-between">
            <div>
              <span className="text-[9px] font-extrabold tracking-[.14em] text-accent">每日行为</span>
              <h2 className="mt-0.5 text-lg font-black">坐姿与低头变化</h2>
            </div>
            <span className="flex items-center gap-3 text-[8px] text-muted">
              <i className="size-2 rounded bg-accent" />
              坐姿
              <i className="size-2 rounded bg-warning" />
              低头
            </span>
          </div>
          <div
            className={cn(
              'mt-2 flex min-h-32.5 flex-1 items-end gap-3 border-b border-edge bg-[linear-gradient(to_bottom,var(--theme-edge-soft)_1px,transparent_1px)] bg-size-[100%_25%] px-1 pt-5',
              range === 30 && 'gap-1'
            )}
          >
            {rows.map((item, index) => {
              const date = new Date(`${item.localDate}T00:00:00`)
              return (
                <div className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end" key={item.localDate}>
                  <div className="pointer-events-none absolute -top-1 z-10 -translate-y-full rounded-md bg-panel-strong px-2 py-1 text-[7px] text-inverse opacity-0 transition-opacity group-hover:opacity-100">
                    坐姿 {compactDuration(item.seatedSeconds)} · 低头 {compactDuration(item.headDownSeconds)}
                  </div>
                  <div className="flex h-[calc(100%-20px)] w-full items-end justify-center gap-px">
                    <i className="w-[min(18px,44%)] min-w-0 rounded-t bg-accent" style={{ height: `${Math.max(4, (item.seatedSeconds / maxSeated) * 100)}%` }} />
                    <i
                      className="w-[min(8px,28%)] min-w-0 rounded-t bg-warning"
                      style={{
                        height: `${Math.max(3, (item.headDownSeconds / maxSeated) * 100)}%`
                      }}
                    />
                  </div>
                  <span className="h-5 pt-1.5 text-[8px] text-muted">{range === 7 || index % 5 === 0 ? `${date.getMonth() + 1}/${date.getDate()}` : ''}</span>
                </div>
              )
            })}
          </div>
          <div className="mt-3 flex shrink-0 items-center gap-3 rounded-xl bg-panel-muted px-3 py-2">
            <Sparkles size={16} className="text-warning" />
            <p className="min-w-0 truncate text-[9px] text-muted">
              <b className="mr-2 text-foreground">本期观察</b>
              {snapshot.today.breakCount > 0 ? '你正在主动打断久坐，继续保持自己的节奏。' : '今天可以从一次主动休息开始。'}
            </p>
          </div>
        </section>
        <section className="flex min-h-0 flex-col overflow-hidden rounded-card border border-edge bg-panel p-4 shadow-panel">
          <div className="flex shrink-0 items-center justify-between border-b border-edge-soft pb-3">
            <div>
              <span className="text-[9px] font-extrabold tracking-[.14em] text-accent">行为历史</span>
              <h2 className="mt-0.5 text-base font-black">最近记录</h2>
            </div>
            <CalendarClock size={19} className="text-muted" />
          </div>
          <div className="grid min-h-0 flex-1 auto-rows-fr">
            {latestHistory.length ? (
              latestHistory.map(event => {
                const copy = eventCopy[event.eventType]
                const when = new Date(event.startedAt)
                return (
                  <div className="grid min-h-0 grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-2 border-b border-edge-soft last:border-0" key={event.id}>
                    <span className={cn('grid size-7 place-items-center rounded-lg', copy.tone)}>
                      <Activity size={13} />
                    </span>
                    <div className="min-w-0">
                      <strong className="block truncate text-[9px]">{copy.label}</strong>
                      <small className="block truncate text-[7px] text-muted">
                        {Number.isNaN(when.getTime())
                          ? event.startedAt
                          : when.toLocaleTimeString(languageOf(snapshot.settings.language), {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                        {event.action ? ` · ${historyActionLabel(event.action)}` : ''}
                      </small>
                    </div>
                    <b className="text-[8px] text-muted">{event.durationSeconds ? compactDuration(event.durationSeconds) : '即时'}</b>
                  </div>
                )
              })
            ) : (
              <div className="grid place-content-center justify-items-center gap-2 text-muted">
                <CalendarClock size={26} />
                <span className="text-[9px]">行为发生后会记录在这里</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function historyActionLabel(action: string): string {
  return (
    (
      {
        returned: '已返回',
        recovered: '已恢复',
        started: '已开始',
        completed: '已完成',
        timed: '定时暂停',
        manual: '手动恢复',
        '30_minutes': '暂停 30 分钟',
        snoozed: '稍后提醒',
        dismissed: '已忽略'
      } as Record<string, string>
    )[action] ?? action
  )
}
