import { invoke, isTauri } from '@tauri-apps/api/core'
import { behaviorHistorySchema, snapshotSchema, statisticsSchema } from '../schemas'
import type { AppSettings, AppSnapshot, CalibrationResult, CameraDevice, DailyStatistics, BehaviorHistoryEvent, VisionObservation } from '../types'

async function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) throw new Error('请在桌面应用中运行')
  return invoke<T>(name, args)
}

export const coreClient = {
  async getSnapshot(): Promise<AppSnapshot> {
    return snapshotSchema.parse(await command<unknown>('get_app_snapshot'))
  },

  async finishOnboarding(mode: 'camera' | 'timer', permission: AppSnapshot['permission']): Promise<AppSnapshot> {
    return snapshotSchema.parse(await command<unknown>('finish_onboarding', { mode, permission }))
  },

  async saveCalibration(result: CalibrationResult): Promise<AppSnapshot> {
    return snapshotSchema.parse(await command<unknown>('save_calibration', { result }))
  },

  async startMonitoring(mode: 'camera' | 'timer'): Promise<AppSnapshot> {
    return snapshotSchema.parse(await command<unknown>('start_monitoring', { mode }))
  },

  async startCalibration(): Promise<AppSnapshot> {
    return snapshotSchema.parse(await command<unknown>('start_calibration'))
  },

  async ingestObservation(observation: VisionObservation): Promise<AppSnapshot> {
    return snapshotSchema.parse(await command<unknown>('ingest_observation', { observation }))
  },

  async pauseMonitoring(minutes: number | null): Promise<AppSnapshot> {
    return snapshotSchema.parse(await command<unknown>('pause_monitoring', { minutes }))
  },

  async resumeMonitoring(): Promise<AppSnapshot> {
    return snapshotSchema.parse(await command<unknown>('resume_monitoring'))
  },

  async startBreak(): Promise<AppSnapshot> {
    return snapshotSchema.parse(await command<unknown>('start_break'))
  },

  async endBreak(): Promise<AppSnapshot> {
    return snapshotSchema.parse(await command<unknown>('end_break'))
  },

  async snoozeReminder(minutes = 10): Promise<AppSnapshot> {
    return snapshotSchema.parse(await command<unknown>('snooze_reminder', { minutes }))
  },

  async dismissReminder(): Promise<AppSnapshot> {
    return snapshotSchema.parse(await command<unknown>('dismiss_reminder'))
  },

  async updateSettings(settings: AppSettings): Promise<AppSnapshot> {
    return snapshotSchema.parse(await command<unknown>('update_settings', { settings }))
  },

  async getStatistics(days: number): Promise<DailyStatistics[]> {
    return statisticsSchema.parse(await command<unknown>('get_statistics', { days }))
  },
  async getBehaviorHistory(days: number): Promise<BehaviorHistoryEvent[]> {
    return behaviorHistorySchema.parse(await command<unknown>('get_behavior_history', { days }))
  },
  async getBehaviorHistoryForDate(localDate: string): Promise<BehaviorHistoryEvent[]> {
    return behaviorHistorySchema.parse(await command<unknown>('get_behavior_history_for_date', { localDate }))
  },

  async exportStatistics(): Promise<string> {
    return command<string>('export_statistics')
  },

  async deleteLocalData(): Promise<AppSnapshot> {
    return snapshotSchema.parse(await command<unknown>('delete_local_data'))
  },
  async muteIsland(minutes?: number, permanent = false): Promise<AppSnapshot> {
    return snapshotSchema.parse(await command<unknown>('mute_island', { minutes, permanent }))
  },

  async listCameras(): Promise<CameraDevice[]> {
    return command<CameraDevice[]>('list_cameras')
  },

  async startVision(cameraId: string, baseline: number | null, headDownEnabled: boolean): Promise<void> {
    await command<void>('start_vision', { cameraId, baseline, headDownEnabled })
  },

  async stopVision(): Promise<void> {
    await command<unknown>('stop_vision')
  }
}
