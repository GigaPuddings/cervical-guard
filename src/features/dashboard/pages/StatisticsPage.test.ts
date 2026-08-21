import { describe, expect, it } from 'vitest'
import type { BehaviorHistoryEvent } from '../../../types'
import { calendarDays, historyForDate, localDateKey, virtualHistoryRange } from './StatisticsPage'

describe('habit history date filtering', () => {
  it('uses the local calendar date and returns every record from that day', () => {
    const events: BehaviorHistoryEvent[] = Array.from({ length: 7 }, (_, index) => ({
      id: String(index),
      eventType: 'head_down',
      startedAt: new Date(2026, 7, 21, index, 0, 0).toISOString(),
      endedAt: null,
      durationSeconds: 60,
      action: 'recovered'
    }))
    expect(historyForDate(events, '2026-08-21')).toHaveLength(7)
    expect(localDateKey(new Date(2026, 7, 21, 23, 30, 0))).toBe('2026-08-21')
  })

  it('excludes records from another day', () => {
    const events: BehaviorHistoryEvent[] = [{
      id: 'earlier',
      eventType: 'away',
      startedAt: new Date(2026, 7, 20, 23, 59, 0).toISOString(),
      endedAt: null,
      durationSeconds: 30,
      action: 'returned'
    }]
    expect(historyForDate(events, '2026-08-21')).toEqual([])
  })

  it('builds a six-week Monday-first calendar grid', () => {
    const days = calendarDays(new Date(2026, 7, 1, 12))
    expect(days).toHaveLength(42)
    expect(days[0]?.dateKey).toBe('2026-07-27')
    expect(days[41]?.dateKey).toBe('2026-09-06')
    expect(days.filter(day => day.inCurrentMonth)).toHaveLength(31)
  })

  it('renders only the visible history rows plus overscan', () => {
    expect(virtualHistoryRange(100, 680, 204)).toEqual({ start: 8, end: 15 })
    expect(virtualHistoryRange(100, 6_700, 204)).toEqual({ start: 96, end: 100 })
  })
})
