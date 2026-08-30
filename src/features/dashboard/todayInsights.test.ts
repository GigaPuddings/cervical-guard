import { describe, expect, it } from 'vitest'
import type { DailyStatistics } from '../../types'
import { buildHealthAdvice, buildSedentarySessionPresentation, buildTodayMetricInsights, formatReminderSchedule, formatRestCadence } from './todayInsights'

function day(overrides: Partial<DailyStatistics> = {}): DailyStatistics {
  return {
    localDate: '2026-08-26',
    seatedSeconds: 0,
    longestSeatedSeconds: 0,
    headDownSeconds: 0,
    suspectedPhoneSeconds: 0,
    breakCount: 0,
    reminderCount: 0,
    dismissedCount: 0,
    snoozedCount: 0,
    awaySeconds: 0,
    awayCount: 0,
    ...overrides
  }
}

describe('today reminder schedule', () => {
  it('uses the configured reminder interval in supporting copy', () => {
    expect(formatRestCadence(45 * 60, 'zh-CN')).toBe('建议每 45 分钟休息一次')
  })

  it('shows the exact next reminder time and remaining minutes', () => {
    const nextReminderAt = new Date(2026, 7, 26, 9, 11).toISOString()

    expect(
      formatReminderSchedule(
        {
          lifecycle: 'monitoring',
          nextReminderAt,
          reminderRemainingSeconds: 40 * 60,
          currentReminder: null,
          monitoringMode: 'camera',
          personPresent: true,
          seatedSeconds: 5 * 60,
          sedentaryReminderState: 'counting',
          settings: { sedentarySeconds: 45 * 60 }
        },
        'zh-CN'
      )
    ).toBe('下次休息 09:11 · 剩余 40 分钟')
  })

  it('does not invent a reminder time while detection is paused', () => {
    expect(
      formatReminderSchedule(
        {
          lifecycle: 'paused',
          nextReminderAt: null,
          reminderRemainingSeconds: null,
          currentReminder: null,
          monitoringMode: 'camera',
          personPresent: false,
          seatedSeconds: 0,
          sedentaryReminderState: 'paused',
          settings: { sedentarySeconds: 45 * 60 }
        },
        'zh-CN'
      )
    ).toBe('恢复检测后继续计时')
  })

  it('shows paused overdue sessions as health debt', () => {
    expect(
      formatReminderSchedule(
        {
          lifecycle: 'paused',
          nextReminderAt: null,
          reminderRemainingSeconds: null,
          currentReminder: null,
          monitoringMode: 'camera',
          personPresent: false,
          seatedSeconds: 70 * 60,
          sedentaryReminderState: 'paused_overdue',
          settings: { sedentarySeconds: 45 * 60 }
        },
        'zh-CN'
      )
    ).toContain('恢复后继续提醒')
  })
})

describe('today metric insights', () => {
  it('derives every card note and icon from current-day behavior', () => {
    const insights = buildTodayMetricInsights(
      day({
        seatedSeconds: 90 * 60,
        headDownSeconds: 9 * 60,
        breakCount: 1,
        dismissedCount: 0,
        snoozedCount: 0,
        awaySeconds: 10 * 60,
        awayCount: 2
      }),
      45 * 60,
      'zh-CN'
    )

    expect(insights.sitting.note).toContain('2 个提醒周期')
    expect(insights.headDown.note).toContain('10%')
    expect(insights.breaks.note).toContain('还差 1 次')
    expect(insights.reminderFollowups.note).toBe('今天没有稍后或关闭本次')
    expect(insights.activity.note).toContain('2 次离座')
    expect(new Set(Object.values(insights).map(item => item.icon)).size).toBeGreaterThan(2)
  })

  it('treats snoozed and closed reminders as follow-ups', () => {
    const insights = buildTodayMetricInsights(day({ snoozedCount: 1, dismissedCount: 1 }), 45 * 60, 'zh-CN')

    expect(insights.reminderFollowups.note).toContain('稍后 1 次 · 关闭本次 1 次')
  })

  it('changes guidance as the day accumulates behavior', () => {
    const empty = buildTodayMetricInsights(day(), 45 * 60, 'zh-CN')
    const active = buildTodayMetricInsights(day({ seatedSeconds: 20 * 60, awaySeconds: 8 * 60, awayCount: 1 }), 45 * 60, 'zh-CN')

    expect(empty.sitting.note).not.toBe(active.sitting.note)
    expect(empty.activity.note).not.toBe(active.activity.note)
  })

  it('does not round a partial activity minute up to a full minute', () => {
    const insights = buildTodayMetricInsights(day({ awaySeconds: 25 }), 45 * 60, 'zh-CN')

    expect(insights.activity.note).toBe('今日累计活动 少于 1 分钟')
  })
})

describe('today health advice', () => {
  const base = {
    behavior: 'sitting_normal' as const,
    currentReminder: null,
    lifecycle: 'monitoring' as const,
    monitoringMode: 'camera' as const,
    reminderRemainingSeconds: 30 * 60,
    sedentaryReminderState: 'counting' as const,
    seatedSeconds: 15 * 60
  }

  it('changes with the current detected behavior', () => {
    const natural = buildHealthAdvice(base, 45 * 60, 'zh-CN')
    const headDown = buildHealthAdvice({ ...base, behavior: 'head_down' }, 45 * 60, 'zh-CN')
    const away = buildHealthAdvice({ ...base, behavior: 'no_person' }, 45 * 60, 'zh-CN')

    expect(natural).toContain('姿态自然')
    expect(headDown).toContain('检测到低头')
    expect(away).toContain('离座')
  })

  it('uses lifecycle and remaining time instead of static copy', () => {
    expect(buildHealthAdvice({ ...base, lifecycle: 'paused' }, 45 * 60, 'zh-CN')).toContain('检测已暂停')
    expect(buildHealthAdvice({ ...base, lifecycle: 'break' }, 45 * 60, 'zh-CN')).toContain('站起来走动')
    expect(buildHealthAdvice({ ...base, reminderRemainingSeconds: 5 * 60, seatedSeconds: 40 * 60 }, 45 * 60, 'zh-CN')).toContain('5 分钟')
    expect(buildHealthAdvice({ ...base, lifecycle: 'paused', seatedSeconds: 70 * 60, sedentaryReminderState: 'paused_overdue' }, 45 * 60, 'zh-CN')).toContain('暂停不会重置')
  })
})

describe('sedentary session presentation', () => {
  const base = {
    currentReminder: null,
    lifecycle: 'monitoring' as const,
    reminderRemainingSeconds: 30 * 60,
    seatedSeconds: 15 * 60,
    sedentaryReminderState: 'counting' as const
  }

  it('keeps normal sitting separate from overdue delivery states', () => {
    expect(buildSedentarySessionPresentation(base, 45 * 60, 'zh-CN')).toMatchObject({ status: '进行中', tone: 'normal' })
    expect(buildSedentarySessionPresentation({ ...base, seatedSeconds: 55 * 60, sedentaryReminderState: 'overdue' }, 45 * 60, 'zh-CN')).toMatchObject({ status: '已超时', tone: 'danger' })
  })

  it('explains snoozed and dismissed sessions without resetting the clock', () => {
    expect(buildSedentarySessionPresentation({ ...base, seatedSeconds: 50 * 60, reminderRemainingSeconds: 10 * 60, sedentaryReminderState: 'snoozed' }, 45 * 60, 'zh-CN')).toMatchObject({ status: '已稍后', detail: '10 分钟后再次提醒', tone: 'warning' })
    expect(buildSedentarySessionPresentation({ ...base, seatedSeconds: 50 * 60, reminderRemainingSeconds: null, sedentaryReminderState: 'dismissed' }, 45 * 60, 'zh-CN')).toMatchObject({ status: '已关闭本次', detail: '有效休息后才会重置', tone: 'danger' })
  })
})
