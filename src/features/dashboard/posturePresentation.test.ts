import { describe, expect, it } from 'vitest'
import type { AppSnapshot } from '../../types'
import { resolvePosturePresentationState } from './posturePresentation'

const base: Pick<AppSnapshot, 'behavior' | 'frameQuality' | 'lifecycle' | 'monitoringMode' | 'personPresent' | 'postureConfidence'> = {
  behavior: 'sitting_normal',
  frameQuality: 'good',
  lifecycle: 'monitoring',
  monitoringMode: 'camera',
  personPresent: true,
  postureConfidence: 0.85
}

describe('posture presentation state', () => {
  it('keeps paused and zero-confidence states out of the stable presentation', () => {
    expect(resolvePosturePresentationState({ ...base, lifecycle: 'paused', postureConfidence: 0 })).toBe('paused')
    expect(resolvePosturePresentationState({ ...base, behavior: 'unknown', postureConfidence: 0 })).toBe('unrecognized')
  })

  it('distinguishes low-confidence, confirming, and stable recognition', () => {
    expect(resolvePosturePresentationState({ ...base, postureConfidence: 0.42 })).toBe('low-confidence')
    expect(resolvePosturePresentationState({ ...base, postureConfidence: 0.68 })).toBe('confirming')
    expect(resolvePosturePresentationState(base)).toBe('stable')
  })

  it('prioritizes actionable frame and posture conditions', () => {
    expect(resolvePosturePresentationState({ ...base, frameQuality: 'dark' })).toBe('frame-dark')
    expect(resolvePosturePresentationState({ ...base, behavior: 'head_down' })).toBe('head-down')
    expect(resolvePosturePresentationState({ ...base, personPresent: false })).toBe('no-person')
  })
})
