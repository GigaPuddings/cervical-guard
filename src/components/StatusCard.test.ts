import { describe, expect, it } from 'vitest'
import { formatDetectionTimestamp, formatStatusDetectionText } from './StatusCard'

describe('status card detection timestamp', () => {
  it('formats the persisted last detection time instead of a fixed value', () => {
    const timestamp = new Date(2026, 7, 26, 8, 48).toISOString()
    expect(formatDetectionTimestamp(timestamp, 'zh-CN')).toBe('08:48')
  })

  it('returns null when no detection has been recorded', () => {
    expect(formatDetectionTimestamp(null, 'zh-CN')).toBeNull()
  })

  it('uses the same last-detection copy while monitoring and paused', () => {
    const timestamp = new Date(2026, 7, 26, 8, 48).toISOString()

    expect(formatStatusDetectionText(timestamp, 'zh-CN', '上次检测', '暂无检测记录')).toBe('上次检测：08:48')
    expect(formatStatusDetectionText(null, 'zh-CN', '上次检测', '暂无检测记录')).toBe('暂无检测记录')
  })
})
