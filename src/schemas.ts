import { z } from 'zod'

const settingsSchema = z.object({
  schemaVersion: z.literal(2),
  language: z.enum(['zh-CN', 'en-US']).default('zh-CN'),
  cameraEnabled: z.boolean(),
  cameraId: z.string(),
  sensitivity: z.enum(['low', 'balanced', 'high']),
  sedentaryMinutes: z.number().int().min(1).max(120),
  sedentarySeconds: z.number().int().min(5).max(14_400),
  repeatReminderMinutes: z.number().int().min(1).max(30),
  breakMinutes: z.number().int().min(1).max(10),
  headDownMinutes: z.number().int().min(1).max(10),
  headDownConfirmationSeconds: z.number().int().min(5).max(30).default(15),
  headDownStrongMinutes: z.number().int().min(5).max(30),
  repeatReminders: z.boolean(),
  autostart: z.boolean(),
  silentAutostart: z.boolean().default(true),
  runInBackground: z.boolean(),
  soundEnabled: z.boolean(),
  meetingMode: z.boolean(),
  fullscreenNotifications: z.boolean(),
  statisticsEnabled: z.boolean(),
  diagnosticsEnabled: z.boolean(),
  workdayStart: z.string(),
  workdayEnd: z.string(),
  quietHoursEnabled: z.boolean(),
  quietStart: z.string(),
  quietEnd: z.string(),
  weekendEnabled: z.boolean(),
  islandEnabled: z.boolean().default(true),
  islandReminderEnabled: z.boolean().default(true),
  islandAwayEnabled: z.boolean().default(true),
  islandHeadDownEnabled: z.boolean().default(true),
  islandBreakEnabled: z.boolean().default(true),
  islandPersistentStatusEnabled: z.boolean().default(false),
  islandPausedStatusEnabled: z.boolean().default(true),
  islandPeekThroughEnabled: z.boolean().default(true),
  islandAllowWithMainWindow: z.boolean().default(false),
  islandPermanentCloseEnabled: z.boolean().default(false)
})

const dailyStatisticsSchema = z.object({
  localDate: z.string(),
  seatedSeconds: z.number().nonnegative(),
  longestSeatedSeconds: z.number().nonnegative(),
  headDownSeconds: z.number().nonnegative(),
  suspectedPhoneSeconds: z.number().nonnegative(),
  breakCount: z.number().nonnegative(),
  reminderCount: z.number().nonnegative(),
  dismissedCount: z.number().nonnegative(),
  snoozedCount: z.number().nonnegative().default(0),
  awaySeconds: z.number().nonnegative().default(0),
  awayCount: z.number().nonnegative().default(0)
})

export const reminderSchema = z.object({
  id: z.string(),
  kind: z.enum(['sedentary', 'head_down', 'combined']),
  level: z.enum(['gentle', 'noticeable', 'strong']),
  title: z.string(),
  message: z.string(),
  durationSeconds: z.number().nonnegative(),
  triggeredAt: z.string()
})

export const snapshotSchema = z.object({
  schemaVersion: z.literal(2),
  lifecycle: z.enum(['unavailable', 'initializing', 'calibrating', 'monitoring', 'paused', 'break', 'degraded']),
  behavior: z.enum(['no_person', 'present', 'sitting_normal', 'head_down', 'standing_break', 'unknown']),
  permission: z.enum(['prompt', 'granted', 'denied', 'unavailable']),
  monitoringMode: z.enum(['camera', 'timer']),
  personPresent: z.boolean(),
  postureConfidence: z.number(),
  frameQuality: z.enum(['good', 'dark', 'occluded', 'multi_person', 'unstable']),
  seatedSeconds: z.number().nonnegative(),
  headDownSeconds: z.number().nonnegative(),
  awaySeconds: z.number().nonnegative().default(0),
  breakRemainingSeconds: z.number().nonnegative(),
  breakRestSeconds: z.number().nonnegative().default(0),
  pausedUntil: z.string().nullable(),
  currentReminder: reminderSchema.nullable(),
  nextReminderAt: z.string().nullable(),
  reminderRemainingSeconds: z.number().nonnegative().nullable(),
  today: dailyStatisticsSchema,
  settings: settingsSchema,
  calibrated: z.boolean(),
  calibrationBaseline: z.number().nullable(),
  lastObservationAt: z.string().nullable(),
  lastDetectionAt: z.string().nullable().default(null),
  sessionStartedAt: z.string().nullable().default(null)
})

export const statisticsSchema = z.array(dailyStatisticsSchema)

export const behaviorHistorySchema = z.array(
  z.object({
    id: z.string(),
    eventType: z.enum(['away', 'head_down', 'break', 'proactive_break', 'early_break', 'proactive_pause', 'reminder']),
    startedAt: z.string(),
    endedAt: z.string().nullable(),
    durationSeconds: z.number().nonnegative(),
    action: z.string().nullable()
  })
)
