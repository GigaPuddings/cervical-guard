import type { AppSettings, AppSnapshot, CalibrationResult, BehaviorHistoryEvent, CameraDevice, DailyStatistics, ReminderPayload, VisionFrame, VisionObservation } from '../types'

const today = (): string => new Date().toISOString().slice(0, 10)

const defaultSettings: AppSettings = {
  schemaVersion: 2,
  language: 'zh-CN',
  cameraEnabled: true,
  cameraId: 'default',
  sensitivity: 'balanced',
  sedentaryMinutes: 45,
  sedentarySeconds: 45 * 60,
  repeatReminderMinutes: 15,
  breakMinutes: 5,
  headDownMinutes: 3,
  headDownConfirmationSeconds: 2,
  headDownStrongMinutes: 10,
  repeatReminders: true,
  autostart: false,
  silentAutostart: true,
  runInBackground: true,
  soundEnabled: false,
  meetingMode: false,
  fullscreenNotifications: false,
  statisticsEnabled: true,
  diagnosticsEnabled: false,
  workdayStart: '09:00',
  workdayEnd: '18:00',
  quietHoursEnabled: true,
  quietStart: '12:00',
  quietEnd: '13:00',
  weekendEnabled: false,
  islandEnabled: true,
  islandReminderEnabled: true,
  islandAwayEnabled: true,
  islandHeadDownEnabled: true,
  islandBreakEnabled: true,
  islandPersistentStatusEnabled: false,
  islandPausedStatusEnabled: true,
  islandPeekThroughEnabled: true,
  islandAllowWithMainWindow: false,
  islandPermanentCloseEnabled: false
}

const blankDay = (date = today()): DailyStatistics => ({
  localDate: date,
  seatedSeconds: 0,
  longestSeatedSeconds: 0,
  headDownSeconds: 0,
  suspectedPhoneSeconds: 0,
  breakCount: 0,
  reminderCount: 0,
  dismissedCount: 0,
  awaySeconds: 0,
  awayCount: 0
})

function loadSettings(): AppSettings {
  try {
    const stored = localStorage.getItem('cervical-guard-settings')
    return stored ? { ...defaultSettings, ...(JSON.parse(stored) as Partial<AppSettings>) } : defaultSettings
  } catch {
    return defaultSettings
  }
}

class MockCore {
  private snapshot: AppSnapshot = {
    schemaVersion: 2,
    lifecycle: localStorage.getItem('cervical-guard-onboarded') ? 'paused' : 'unavailable',
    behavior: 'unknown',
    permission: 'prompt',
    monitoringMode: 'camera',
    personPresent: false,
    postureConfidence: 0,
    frameQuality: 'unstable',
    seatedSeconds: 0,
    headDownSeconds: 0,
    awaySeconds: 0,
    breakRemainingSeconds: 0,
    breakRestSeconds: 0,
    pausedUntil: null,
    currentReminder: null,
    nextReminderAt: null,
    reminderRemainingSeconds: null,
    today: blankDay(),
    settings: loadSettings(),
    calibrated: localStorage.getItem('cervical-guard-calibrated') === 'true',
    calibrationBaseline: Number(localStorage.getItem('cervical-guard-baseline')) || null,
    lastObservationAt: null,
    sessionStartedAt: null
  }

  private lastTick = performance.now()
  private headCandidateSeconds = 0
  private lastSedentaryReminderAt: number | null = null
  private snoozedUntil: number | null = null

  private reminderCadenceSeconds(): number {
    return this.snapshot.settings.sedentarySeconds <= 30 ? this.snapshot.settings.sedentarySeconds : this.snapshot.settings.repeatReminderMinutes * 60
  }

  private updateReminderSchedule(now: number): void {
    const running = this.snapshot.lifecycle === 'monitoring' || this.snapshot.lifecycle === 'degraded'
    if (!running || this.snapshot.currentReminder) {
      this.snapshot.nextReminderAt = null
      this.snapshot.reminderRemainingSeconds = null
      return
    }
    let remaining: number | null
    if (this.snoozedUntil && this.snoozedUntil > now) {
      remaining = Math.ceil((this.snoozedUntil - now) / 1_000)
    } else if (this.snapshot.seatedSeconds < this.snapshot.settings.sedentarySeconds) {
      remaining = Math.ceil(this.snapshot.settings.sedentarySeconds - this.snapshot.seatedSeconds)
    } else if (this.lastSedentaryReminderAt === null) {
      remaining = 0
    } else if (this.snapshot.settings.repeatReminders) {
      remaining = Math.max(0, Math.ceil(this.reminderCadenceSeconds() - (now - this.lastSedentaryReminderAt) / 1_000))
    } else {
      remaining = null
    }
    this.snapshot.reminderRemainingSeconds = remaining
    const clockRunning = this.snapshot.monitoringMode === 'timer' || (this.snapshot.personPresent && (this.snapshot.behavior === 'sitting_normal' || this.snapshot.behavior === 'head_down'))
    this.snapshot.nextReminderAt = remaining === null || !clockRunning ? null : new Date(Date.now() + remaining * 1_000).toISOString()
  }

  private tick(): void {
    const now = performance.now()
    const elapsed = Math.min(2, Math.max(0, (now - this.lastTick) / 1_000))
    this.lastTick = now
    if (this.snapshot.lifecycle === 'monitoring' || this.snapshot.lifecycle === 'degraded') {
      const timerMode = this.snapshot.monitoringMode === 'timer'
      const personHere = timerMode || this.snapshot.personPresent
      if (personHere && (timerMode || this.snapshot.behavior === 'sitting_normal' || this.snapshot.behavior === 'head_down')) {
        this.snapshot.seatedSeconds += elapsed
        this.snapshot.today.seatedSeconds += elapsed
        this.snapshot.today.longestSeatedSeconds = Math.max(this.snapshot.today.longestSeatedSeconds, this.snapshot.seatedSeconds)
        const repeatDue = this.lastSedentaryReminderAt !== null && this.snapshot.settings.repeatReminders && (now - this.lastSedentaryReminderAt) / 1_000 >= this.reminderCadenceSeconds()
        if (!this.snapshot.currentReminder && this.snapshot.seatedSeconds >= this.snapshot.settings.sedentarySeconds && (this.lastSedentaryReminderAt === null || repeatDue)) {
          this.triggerDemoReminder()
        }
      }
      // 人物不在座时累加离座活动时间（Camera 模式专用）。
      if (!personHere && this.snapshot.settings.statisticsEnabled) {
        this.snapshot.awaySeconds += elapsed
        this.snapshot.today.awaySeconds += elapsed
      }
      if (this.snapshot.settings.islandHeadDownEnabled && this.snapshot.behavior === 'head_down') {
        this.snapshot.headDownSeconds += elapsed
        this.snapshot.today.headDownSeconds += elapsed
      }
    }
    if (this.snapshot.lifecycle === 'break') {
      // 休息期间只把确认离座计为有效休息。
      if (!this.snapshot.personPresent || this.snapshot.behavior === 'no_person') {
        this.snapshot.breakRestSeconds += elapsed
      }
      // 倒计时到 0 后不自动结束——保持 Break 生命周期等待手动确认。
      // 摄像头在此期间持续运行，确保用户确认结束时检测管线已就绪。
      this.snapshot.breakRemainingSeconds = Math.max(0, this.snapshot.breakRemainingSeconds - elapsed)
    }
    this.updateReminderSchedule(now)
  }

  async command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
    this.tick()
    switch (name) {
      case 'get_app_snapshot':
        break
      case 'finish_onboarding': {
        const mode = args?.mode as 'camera' | 'timer'
        this.snapshot.monitoringMode = mode
        this.snapshot.settings.cameraEnabled = mode === 'camera'
        this.snapshot.permission = args?.permission as AppSnapshot['permission']
        this.snapshot.lifecycle = mode === 'camera' ? 'calibrating' : 'degraded'
        localStorage.setItem('cervical-guard-onboarded', 'true')
        localStorage.setItem('cervical-guard-settings', JSON.stringify(this.snapshot.settings))
        break
      }
      case 'save_calibration': {
        const result = args?.result as CalibrationResult
        this.snapshot.calibrated = true
        this.snapshot.calibrationBaseline = result.baseline
        this.snapshot.permission = 'granted'
        this.snapshot.monitoringMode = 'camera'
        this.snapshot.settings.cameraEnabled = true
        this.snapshot.settings.cameraId = result.cameraId
        this.snapshot.lifecycle = 'monitoring'
        this.snapshot.behavior = 'unknown'
        this.snapshot.sessionStartedAt = new Date().toISOString()
        localStorage.setItem('cervical-guard-calibrated', 'true')
        localStorage.setItem('cervical-guard-baseline', String(result.baseline))
        localStorage.setItem('cervical-guard-settings', JSON.stringify(this.snapshot.settings))
        break
      }
      case 'start_monitoring':
        this.snapshot.monitoringMode = args?.mode as 'camera' | 'timer'
        if (this.snapshot.monitoringMode === 'camera') this.snapshot.settings.cameraEnabled = true
        this.snapshot.lifecycle = this.snapshot.monitoringMode === 'camera' ? 'monitoring' : 'degraded'
        this.snapshot.sessionStartedAt ??= new Date().toISOString()
        break
      case 'start_calibration':
        this.snapshot.lifecycle = 'calibrating'
        this.snapshot.monitoringMode = 'camera'
        break
      case 'ingest_observation': {
        const observation = args?.observation as VisionObservation
        if (observation.person.uncertain) {
          this.snapshot.postureConfidence = observation.posture.confidence
          this.snapshot.frameQuality = observation.frameQuality
          this.snapshot.lastObservationAt = new Date().toISOString()
          break
        }
        if (this.snapshot.personPresent && !observation.person.present) this.snapshot.today.awayCount += 1
        this.snapshot.personPresent = observation.person.present
        this.snapshot.postureConfidence = observation.posture.confidence
        this.snapshot.frameQuality = observation.frameQuality
        this.snapshot.lastObservationAt = new Date().toISOString()
        if (!observation.person.present) this.snapshot.behavior = 'no_person'
        else if (observation.posture.state === 'standing') this.snapshot.behavior = 'standing_break'
        else if (this.snapshot.settings.islandHeadDownEnabled && observation.head.downScore > 0.62 && observation.frameQuality === 'good') {
          this.headCandidateSeconds += 0.25
          this.snapshot.behavior = this.headCandidateSeconds >= this.snapshot.settings.headDownConfirmationSeconds ? 'head_down' : 'sitting_normal'
        } else {
          this.headCandidateSeconds = 0
          this.snapshot.behavior = 'sitting_normal'
        }
        break
      }
      case 'pause_monitoring':
        this.snapshot.lifecycle = 'paused'
        this.snapshot.pausedUntil = typeof args?.minutes === 'number' ? new Date(Date.now() + (args.minutes as number) * 60_000).toISOString() : null
        break
      case 'resume_monitoring':
        this.snapshot.monitoringMode = this.snapshot.settings.cameraEnabled && this.snapshot.calibrated && this.snapshot.permission === 'granted' ? 'camera' : 'timer'
        this.snapshot.lifecycle = this.snapshot.monitoringMode === 'camera' ? 'monitoring' : 'degraded'
        this.snapshot.pausedUntil = null
        break
      case 'start_break':
        this.snapshot.lifecycle = 'break'
        this.snapshot.currentReminder = null
        this.snapshot.breakRemainingSeconds = this.snapshot.settings.breakMinutes * 60
        this.snapshot.breakRestSeconds = 0
        this.snapshot.nextReminderAt = null
        this.snapshot.reminderRemainingSeconds = null
        break
      case 'end_break':
        // 手动确认结束休息：完成休息并自动恢复检测。
        this.snapshot.lifecycle = this.snapshot.monitoringMode === 'camera' && this.snapshot.calibrated ? 'monitoring' : 'degraded'
        this.snapshot.breakRemainingSeconds = 0
        this.snapshot.today.breakCount += 1
        this.snapshot.seatedSeconds = 0
        this.snapshot.headDownSeconds = 0
        this.snapshot.awaySeconds = 0
        this.snapshot.currentReminder = null
        this.lastSedentaryReminderAt = null
        this.updateReminderSchedule(performance.now())
        break
      case 'snooze_reminder':
        this.snapshot.currentReminder = null
        this.snoozedUntil = performance.now() + Number(args?.minutes ?? 10) * 60_000
        break
      case 'dismiss_reminder':
        this.snapshot.currentReminder = null
        this.snapshot.today.dismissedCount += 1
        break
      case 'update_settings':
        {
          const settings = args?.settings as AppSettings
          const wasCameraEnabled = this.snapshot.settings.cameraEnabled
          const lifecycle = this.snapshot.lifecycle
          this.snapshot.settings = settings
          if (this.snapshot.seatedSeconds < settings.sedentarySeconds) this.lastSedentaryReminderAt = null
          if (!settings.islandHeadDownEnabled) {
            this.headCandidateSeconds = 0
            this.snapshot.headDownSeconds = 0
            if (this.snapshot.behavior === 'head_down') this.snapshot.behavior = 'sitting_normal'
            if (this.snapshot.currentReminder?.kind === 'head_down' || this.snapshot.currentReminder?.kind === 'combined') this.snapshot.currentReminder = null
          }
          if (!settings.cameraEnabled && this.snapshot.monitoringMode === 'camera') {
            this.snapshot.monitoringMode = 'timer'
            if (lifecycle === 'monitoring' || lifecycle === 'degraded') {
              this.snapshot.lifecycle = 'degraded'
              this.snapshot.behavior = 'unknown'
            }
          } else if (!wasCameraEnabled && settings.cameraEnabled && this.snapshot.calibrated) {
            this.snapshot.monitoringMode = 'camera'
            if (lifecycle === 'monitoring' || lifecycle === 'degraded') {
              this.snapshot.lifecycle = 'monitoring'
              this.snapshot.behavior = 'unknown'
            }
          }
        }
        localStorage.setItem('cervical-guard-settings', JSON.stringify(this.snapshot.settings))
        break
      case 'get_statistics':
        return this.demoStatistics(args?.days as number) as T
      case 'get_behavior_history':
        return this.demoBehaviorHistory() as T
      case 'export_statistics':
        return this.csv() as T
      case 'delete_local_data':
        this.snapshot.today = blankDay()
        this.snapshot.seatedSeconds = 0
        this.snapshot.headDownSeconds = 0
        this.snapshot.awaySeconds = 0
        this.lastSedentaryReminderAt = null
        break
      case 'mute_island':
        break
      case 'list_cameras':
        return [{ id: '0', label: '模拟摄像头' }] as T
      case 'start_vision':
        break
      case 'stop_vision':
        break
      case 'capture_frame':
        return this.mockVisionFrame() as T
      default:
        throw new Error(`Unknown mock command: ${name}`)
    }
    return structuredClone(this.snapshot) as T
  }

  private mockVisionFrame(): VisionFrame {
    const observation: VisionObservation = {
      schemaVersion: 2,
      sequence: Math.floor(performance.now() / 240),
      capturedAtMonotonicMs: performance.now(),
      person: { present: true, uncertain: false, confidence: 0.9 },
      posture: { state: 'sitting', confidence: 0.9 },
      head: { downScore: 0.1, confidence: 0.9 },
      frameQuality: 'good',
      metrics: { poseMs: 12, droppedFrames: 0 }
    }
    return {
      observation,
      headRatio: -0.3,
      landmarks: []
    }
  }

  private demoStatistics(days: number): DailyStatistics[] {
    const output: DailyStatistics[] = []
    for (let index = days - 1; index >= 0; index -= 1) {
      const date = new Date()
      date.setDate(date.getDate() - index)
      const isToday = index === 0
      const variation = (index * 17) % 29
      output.push(
        isToday
          ? structuredClone(this.snapshot.today)
          : {
              localDate: date.toISOString().slice(0, 10),
              seatedSeconds: (165 + variation) * 60,
              longestSeatedSeconds: (42 + (variation % 18)) * 60,
              headDownSeconds: (18 + (variation % 21)) * 60,
              suspectedPhoneSeconds: 0,
              breakCount: 3 + (index % 4),
              reminderCount: 2 + (index % 3),
              dismissedCount: index % 2,
              awaySeconds: (28 + (variation % 15)) * 60,
              awayCount: 1 + (index % 5)
            }
      )
    }
    return output
  }

  private csv(): string {
    const rows = this.demoStatistics(30)
    return ['日期,坐姿秒数,最长连续坐姿秒数,低头秒数,休息次数,提醒次数,忽略次数,离座秒数', ...rows.map(item => [item.localDate, Math.round(item.seatedSeconds), Math.round(item.longestSeatedSeconds), Math.round(item.headDownSeconds), item.breakCount, item.reminderCount, item.dismissedCount, Math.round(item.awaySeconds)].join(','))].join('\n')
  }

  private demoBehaviorHistory(): BehaviorHistoryEvent[] {
    const at = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()
    return [
      { id: 'demo-1', eventType: 'proactive_break', startedAt: at(18), endedAt: at(13), durationSeconds: 300, action: 'completed' },
      { id: 'demo-2', eventType: 'away', startedAt: at(64), endedAt: at(58), durationSeconds: 360, action: 'returned' },
      { id: 'demo-3', eventType: 'head_down', startedAt: at(92), endedAt: at(87), durationSeconds: 300, action: 'recovered' },
      { id: 'demo-4', eventType: 'proactive_pause', startedAt: at(150), endedAt: null, durationSeconds: 1800, action: '30_minutes' }
    ]
  }

  triggerDemoReminder(): void {
    const reminder: ReminderPayload = {
      id: crypto.randomUUID(),
      kind: 'combined',
      level: 'noticeable',
      title: '该舒展一下了',
      message: '你已经连续坐了一段时间，也有持续低头的迹象。建议站起来活动 2～5 分钟。',
      durationSeconds: this.snapshot.seatedSeconds,
      triggeredAt: new Date().toISOString()
    }
    this.snapshot.currentReminder = reminder
    this.lastSedentaryReminderAt = performance.now()
    this.snapshot.today.reminderCount += 1
  }
}

export const mockCore = new MockCore()
