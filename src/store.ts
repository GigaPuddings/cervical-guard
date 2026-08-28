import { create } from 'zustand'
import { isTauri } from '@tauri-apps/api/core'
import { snapshotSchema } from './schemas'
import type { AppPage, AppSnapshot, BehaviorHistoryEvent, DailyStatistics } from './types'

const SNAPSHOT_CACHE_KEY = 'cervical-guard-last-snapshot'

function loadCachedSnapshot(): AppSnapshot | null {
  if (typeof window === 'undefined' || !isTauri()) return null
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_CACHE_KEY)
    if (!raw) return null
    const parsed = snapshotSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return null
    const cached = parsed.data
    return {
      ...cached,
      awaySeconds: cached.awaySeconds ?? 0,
      lifecycle: cached.lifecycle === 'unavailable' ? 'unavailable' : 'paused',
      currentReminder: null,
      nextReminderAt: null,
      reminderRemainingSeconds: null,
      pausedUntil: null,
      breakRemainingSeconds: 0
    }
  } catch {
    return null
  }
}

function cacheSnapshot(snapshot: AppSnapshot): void {
  if (typeof window === 'undefined' || !isTauri()) return
  try {
    window.localStorage.setItem(SNAPSHOT_CACHE_KEY, JSON.stringify(snapshot))
  } catch {
    // 本地缓存只用于加速首屏，失败时仍以 Rust 状态为准。
  }
}

interface AppStore {
  snapshot: AppSnapshot | null
  page: AppPage
  statistics: DailyStatistics[]
  behaviorHistory: BehaviorHistoryEvent[]
  busy: boolean
  error: string | null
  setSnapshot: (snapshot: AppSnapshot) => void
  setPage: (page: AppPage) => void
  setStatistics: (statistics: DailyStatistics[]) => void
  setBehaviorHistory: (events: BehaviorHistoryEvent[]) => void
  setBusy: (busy: boolean) => void
  setError: (error: string | null) => void
}

export const useAppStore = create<AppStore>(set => ({
  snapshot: loadCachedSnapshot(),
  page: 'today',
  statistics: [],
  behaviorHistory: [],
  busy: false,
  error: null,
  setSnapshot: snapshot => {
    cacheSnapshot(snapshot)
    set({ snapshot, error: null })
  },
  setPage: page => set({ page }),
  setStatistics: statistics => set({ statistics }),
  setBehaviorHistory: behaviorHistory => set({ behaviorHistory }),
  setBusy: busy => set({ busy }),
  setError: error => set({ error, busy: false })
}))
