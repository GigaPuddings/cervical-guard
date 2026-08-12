export const SCHEMA_VERSION = 2 as const;

export type AppPage = "today" | "statistics" | "weather" | "settings" | "privacy";
export type MonitoringLifecycle =
  | "unavailable"
  | "initializing"
  | "calibrating"
  | "monitoring"
  | "paused"
  | "break"
  | "degraded";
export type BehaviorState =
  | "no_person"
  | "present"
  | "sitting_normal"
  | "head_down"
  | "standing_break"
  | "unknown";
export type FrameQuality = "good" | "dark" | "occluded" | "multi_person" | "unstable";
export type PostureState = "unknown" | "sitting" | "standing";
export type ReminderKind = "sedentary" | "head_down" | "combined";
export type ReminderLevel = "gentle" | "noticeable" | "strong";
export type BehaviorEventType =
  | "away"
  | "head_down"
  | "break"
  | "proactive_break"
  | "early_break"
  | "proactive_pause"
  | "reminder";

export interface VisionObservation {
  schemaVersion: typeof SCHEMA_VERSION;
  sequence: number;
  capturedAtMonotonicMs: number;
  person: { present: boolean; confidence: number };
  posture: { state: PostureState; confidence: number };
  head: { downScore: number; confidence: number };
  frameQuality: FrameQuality;
  metrics: { poseMs: number; droppedFrames: number };
}

export interface ReminderPayload {
  id: string;
  kind: ReminderKind;
  level: ReminderLevel;
  title: string;
  message: string;
  durationSeconds: number;
  triggeredAt: string;
}

export interface AppSettings {
  schemaVersion: typeof SCHEMA_VERSION;
  cameraEnabled: boolean;
  cameraId: string;
  sensitivity: "low" | "balanced" | "high";
  sedentaryMinutes: number;
  sedentarySeconds: number;
  repeatReminderMinutes: number;
  breakMinutes: number;
  headDownMinutes: number;
  headDownStrongMinutes: number;
  repeatReminders: boolean;
  autostart: boolean;
  runInBackground: boolean;
  soundEnabled: boolean;
  meetingMode: boolean;
  fullscreenNotifications: boolean;
  statisticsEnabled: boolean;
  diagnosticsEnabled: boolean;
  workdayStart: string;
  workdayEnd: string;
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  weekendEnabled: boolean;
  islandEnabled: boolean;
  islandReminderEnabled: boolean;
  islandAwayEnabled: boolean;
  islandHeadDownEnabled: boolean;
  islandBreakEnabled: boolean;
  islandPersistentStatusEnabled: boolean;
  islandAllowWithMainWindow: boolean;
  islandPermanentCloseEnabled: boolean;
}

export interface BehaviorHistoryEvent {
  id: string;
  eventType: BehaviorEventType;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  action: string | null;
}

export interface DailyStatistics {
  localDate: string;
  seatedSeconds: number;
  longestSeatedSeconds: number;
  headDownSeconds: number;
  suspectedPhoneSeconds: number;
  breakCount: number;
  reminderCount: number;
  dismissedCount: number;
  /** 今日离座活动总秒数（接水、上厕所等短暂离开）。 */
  awaySeconds: number;
  /** 今日检测到的人物离开座位次数。 */
  awayCount: number;
}

export interface AppSnapshot {
  schemaVersion: typeof SCHEMA_VERSION;
  lifecycle: MonitoringLifecycle;
  behavior: BehaviorState;
  permission: "prompt" | "granted" | "denied" | "unavailable";
  monitoringMode: "camera" | "timer";
  personPresent: boolean;
  postureConfidence: number;
  frameQuality: FrameQuality;
  seatedSeconds: number;
  headDownSeconds: number;
  /** 当前会话离座活动秒数（人物不在座时累加）。 */
  awaySeconds: number;
  breakRemainingSeconds: number;
  /** 本次休息中检测到的有效休息秒数（确认离座）。 */
  breakRestSeconds: number;
  pausedUntil: string | null;
  currentReminder: ReminderPayload | null;
  nextReminderAt: string | null;
  reminderRemainingSeconds: number | null;
  today: DailyStatistics;
  settings: AppSettings;
  calibrated: boolean;
  calibrationBaseline: number | null;
  lastObservationAt: string | null;
  /** 本次连续监测会话的开始时间（RFC3339），应用重启后为空。 */
  sessionStartedAt: string | null;
}

export interface CameraDevice {
  id: string;
  label: string;
}

export interface LandmarkPoint {
  x: number;
  y: number;
  score: number;
}

/** 后端摄像头会话单帧结果：观测值 + 头部位置（校准采样用）。 */
export interface VisionFrame {
  observation: VisionObservation;
  headRatio: number | null;
  landmarks: LandmarkPoint[];
}

export interface CalibrationResult {
  baseline: number;
  cameraId: string;
}
