import type { AppSnapshot } from '../../types'

export type PosturePresentationState =
  | 'timer'
  | 'paused'
  | 'break'
  | 'not-ready'
  | 'no-person'
  | 'frame-dark'
  | 'frame-occluded'
  | 'frame-multi-person'
  | 'frame-unstable'
  | 'unrecognized'
  | 'low-confidence'
  | 'confirming'
  | 'stable'
  | 'head-down'
  | 'standing'

type PostureSnapshot = Pick<AppSnapshot, 'behavior' | 'frameQuality' | 'lifecycle' | 'monitoringMode' | 'personPresent' | 'postureConfidence'>

/**
 * Resolves one mutually exclusive UI state so posture copy, iconography, color,
 * progress, and status never communicate contradictory meanings.
 */
export function resolvePosturePresentationState(snapshot: PostureSnapshot): PosturePresentationState {
  if (snapshot.monitoringMode !== 'camera') return 'timer'
  if (snapshot.lifecycle === 'paused') return 'paused'
  if (snapshot.lifecycle === 'break') return 'break'
  if (!['monitoring', 'degraded'].includes(snapshot.lifecycle)) return 'not-ready'

  if (snapshot.frameQuality === 'dark') return 'frame-dark'
  if (snapshot.frameQuality === 'occluded') return 'frame-occluded'
  if (snapshot.frameQuality === 'multi_person') return 'frame-multi-person'
  if (snapshot.frameQuality === 'unstable') return 'frame-unstable'

  if (!snapshot.personPresent || snapshot.behavior === 'no_person') return 'no-person'
  if (snapshot.behavior === 'head_down') return 'head-down'
  if (snapshot.behavior === 'standing_break') return 'standing'
  if (snapshot.postureConfidence <= 0.01) return 'unrecognized'
  if (snapshot.postureConfidence < 0.55) return 'low-confidence'
  if (snapshot.behavior === 'present' || snapshot.behavior === 'unknown' || snapshot.postureConfidence < 0.75) return 'confirming'
  return 'stable'
}
