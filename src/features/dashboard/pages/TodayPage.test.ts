import { describe, expect, it } from 'vitest'
import { shouldShowPreviewCaption } from './TodayPage'

describe('today detection preview caption', () => {
  it('hides the placeholder caption after camera monitoring resumes', () => {
    expect(shouldShowPreviewCaption('monitoring', true)).toBe(false)
  })

  it('keeps the placeholder caption while monitoring is paused', () => {
    expect(shouldShowPreviewCaption('paused', true)).toBe(true)
  })

  it('keeps the placeholder caption for timer-only monitoring', () => {
    expect(shouldShowPreviewCaption('degraded', false)).toBe(true)
  })
})
