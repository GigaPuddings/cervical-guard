import { z } from "zod";

const settingsSchema = z.object({
  schemaVersion: z.literal(2),
  cameraEnabled: z.boolean(),
  cameraId: z.string(),
  sensitivity: z.enum(["low", "balanced", "high"]),
  sedentaryMinutes: z.number().int().min(1).max(120),
  sedentarySeconds: z.number().int().min(5).max(14_400),
  repeatReminderMinutes: z.number().int().min(1).max(30),
  breakMinutes: z.number().int().min(1).max(10),
  headDownMinutes: z.number().int().min(1).max(10),
  headDownStrongMinutes: z.number().int().min(5).max(30),
  repeatReminders: z.boolean(),
  autostart: z.boolean(),
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
});

const dailyStatisticsSchema = z.object({
  localDate: z.string(),
  seatedSeconds: z.number().nonnegative(),
  longestSeatedSeconds: z.number().nonnegative(),
  headDownSeconds: z.number().nonnegative(),
  suspectedPhoneSeconds: z.number().nonnegative(),
  breakCount: z.number().nonnegative(),
  reminderCount: z.number().nonnegative(),
  dismissedCount: z.number().nonnegative(),
  awaySeconds: z.number().nonnegative().default(0),
  awayCount: z.number().nonnegative().default(0),
});

export const reminderSchema = z.object({
  id: z.string(),
  kind: z.enum(["sedentary", "head_down", "combined"]),
  level: z.enum(["gentle", "noticeable", "strong"]),
  title: z.string(),
  message: z.string(),
  durationSeconds: z.number().nonnegative(),
  triggeredAt: z.string(),
});

export const snapshotSchema = z.object({
  schemaVersion: z.literal(2),
  lifecycle: z.enum(["unavailable", "initializing", "calibrating", "monitoring", "paused", "break", "degraded"]),
  behavior: z.enum(["no_person", "present", "sitting_normal", "head_down", "standing_break", "unknown"]),
  permission: z.enum(["prompt", "granted", "denied", "unavailable"]),
  monitoringMode: z.enum(["camera", "timer"]),
  personPresent: z.boolean(),
  postureConfidence: z.number(),
  frameQuality: z.enum(["good", "dark", "occluded", "multi_person", "unstable"]),
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
  sessionStartedAt: z.string().nullable().default(null),
});

export const statisticsSchema = z.array(dailyStatisticsSchema);
