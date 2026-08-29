use chrono::{Datelike, Local, Timelike, Weekday};
use serde::{Deserialize, Serialize};

use crate::messages::{msg, Language};

pub const SCHEMA_VERSION: u8 = 2;
pub const MIN_HEAD_DOWN_CONFIRMATION_SECS: u64 = 5;
pub const MAX_HEAD_DOWN_CONFIRMATION_SECS: u64 = 30;
pub const DEFAULT_HEAD_DOWN_CONFIRMATION_SECS: u64 = 15;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MonitoringLifecycle {
    Unavailable,
    Initializing,
    Calibrating,
    Monitoring,
    Paused,
    Break,
    Degraded,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BehaviorState {
    NoPerson,
    Present,
    SittingNormal,
    HeadDown,
    StandingBreak,
    Unknown,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PermissionState {
    Prompt,
    Granted,
    Denied,
    Unavailable,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MonitoringMode {
    Camera,
    Timer,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FrameQuality {
    Good,
    Dark,
    Occluded,
    MultiPerson,
    Unstable,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PostureState {
    Unknown,
    Sitting,
    Standing,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonObservation {
    pub present: bool,
    /// 只捕捉到少量头部点位时既不能确认有人，也不能据此确认离座。
    /// 旧客户端没有该字段时按明确结果处理，保持事件协议向后兼容。
    #[serde(default)]
    pub uncertain: bool,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostureObservation {
    pub state: PostureState,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeadObservation {
    pub down_score: f64,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VisionMetrics {
    pub pose_ms: f64,
    pub dropped_frames: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VisionObservation {
    pub schema_version: u8,
    pub sequence: u64,
    pub captured_at_monotonic_ms: f64,
    pub person: PersonObservation,
    pub posture: PostureObservation,
    pub head: HeadObservation,
    pub frame_quality: FrameQuality,
    pub metrics: VisionMetrics,
}

impl VisionObservation {
    pub fn validate_with_language(&self, language: Language) -> Result<(), String> {
        if self.schema_version != SCHEMA_VERSION {
            return Err(msg::ERR_OBSERVATION_VERSION
                .format(language, &[("version", &self.schema_version.to_string())]));
        }
        let scores = [
            self.person.confidence,
            self.posture.confidence,
            self.head.down_score,
            self.head.confidence,
        ];
        if scores
            .iter()
            .any(|value| !value.is_finite() || !(0.0..=1.0).contains(value))
        {
            return Err(msg::ERR_OBSERVATION_CONFIDENCE.get(language).to_string());
        }
        if self.person.present && self.person.uncertain {
            return Err(msg::ERR_OBSERVATION_PERSON.get(language).to_string());
        }
        if !self.captured_at_monotonic_ms.is_finite() || !self.metrics.pose_ms.is_finite() {
            return Err(msg::ERR_OBSERVATION_NUMBERS.get(language).to_string());
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub schema_version: u8,
    #[serde(default = "default_language")]
    pub language: String,
    pub camera_enabled: bool,
    pub camera_id: String,
    pub sensitivity: String,
    pub sedentary_minutes: u64,
    #[serde(default = "default_sedentary_seconds")]
    pub sedentary_seconds: u64,
    pub repeat_reminder_minutes: u64,
    pub break_minutes: u64,
    pub head_down_minutes: u64,
    #[serde(default = "default_head_down_confirmation_seconds")]
    pub head_down_confirmation_seconds: u64,
    pub head_down_strong_minutes: u64,
    pub repeat_reminders: bool,
    pub autostart: bool,
    #[serde(default = "default_enabled")]
    pub silent_autostart: bool,
    pub run_in_background: bool,
    pub sound_enabled: bool,
    /// 提示音选项：auto（按提醒级别自动匹配）/ system / chime / soft / alert / off。
    #[serde(default = "default_reminder_sound")]
    pub reminder_sound: String,
    pub meeting_mode: bool,
    pub fullscreen_notifications: bool,
    pub statistics_enabled: bool,
    pub diagnostics_enabled: bool,
    pub workday_start: String,
    pub workday_end: String,
    #[serde(default = "default_enabled")]
    pub quiet_hours_enabled: bool,
    pub quiet_start: String,
    pub quiet_end: String,
    pub weekend_enabled: bool,
    #[serde(default = "default_enabled")]
    pub island_enabled: bool,
    #[serde(default = "default_enabled")]
    pub island_reminder_enabled: bool,
    #[serde(default = "default_enabled")]
    pub island_away_enabled: bool,
    #[serde(default = "default_enabled")]
    pub island_head_down_enabled: bool,
    #[serde(default = "default_enabled")]
    pub island_break_enabled: bool,
    #[serde(default)]
    pub island_persistent_status_enabled: bool,
    #[serde(default = "default_enabled")]
    pub island_paused_status_enabled: bool,
    #[serde(default = "default_enabled")]
    pub island_peek_through_enabled: bool,
    #[serde(default)]
    pub island_allow_with_main_window: bool,
    #[serde(default)]
    pub island_permanent_close_enabled: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            language: default_language(),
            camera_enabled: true,
            camera_id: "default".into(),
            sensitivity: "balanced".into(),
            sedentary_minutes: 45,
            sedentary_seconds: default_sedentary_seconds(),
            repeat_reminder_minutes: 15,
            break_minutes: 5,
            head_down_minutes: 3,
            head_down_confirmation_seconds: default_head_down_confirmation_seconds(),
            head_down_strong_minutes: 10,
            repeat_reminders: true,
            autostart: false,
            silent_autostart: true,
            run_in_background: true,
            sound_enabled: false,
            reminder_sound: default_reminder_sound(),
            meeting_mode: false,
            fullscreen_notifications: false,
            statistics_enabled: true,
            diagnostics_enabled: false,
            workday_start: "09:00".into(),
            workday_end: "18:00".into(),
            quiet_hours_enabled: true,
            quiet_start: "12:00".into(),
            quiet_end: "13:00".into(),
            weekend_enabled: false,
            island_enabled: true,
            island_reminder_enabled: true,
            island_away_enabled: true,
            island_head_down_enabled: true,
            island_break_enabled: true,
            island_persistent_status_enabled: false,
            island_paused_status_enabled: true,
            island_peek_through_enabled: true,
            island_allow_with_main_window: false,
            island_permanent_close_enabled: false,
        }
    }
}

impl AppSettings {
    pub fn validate(&self) -> Result<(), String> {
        let language = Language::of_settings(self);
        if self.schema_version != SCHEMA_VERSION {
            return Err(msg::ERR_SCHEMA_VERSION.get(language).to_string());
        }
        if !matches!(self.language.as_str(), "zh-CN" | "en-US") {
            return Err(msg::ERR_LANGUAGE.get(language).to_string());
        }
        if !crate::sound::ReminderSound::ALL.contains(&self.reminder_sound.as_str()) {
            return Err(msg::ERR_REMINDER_SOUND.get(language).to_string());
        }
        if !(1..=120).contains(&self.sedentary_minutes)
            || !(5..=14_400).contains(&self.sedentary_seconds)
            || !(1..=30).contains(&self.repeat_reminder_minutes)
            || !(1..=10).contains(&self.break_minutes)
            || !(1..=10).contains(&self.head_down_minutes)
            || !(MIN_HEAD_DOWN_CONFIRMATION_SECS..=MAX_HEAD_DOWN_CONFIRMATION_SECS)
                .contains(&self.head_down_confirmation_seconds)
            || !(5..=30).contains(&self.head_down_strong_minutes)
        {
            return Err(msg::ERR_REMINDER_THRESHOLDS.get(language).to_string());
        }
        if !matches!(self.sensitivity.as_str(), "low" | "balanced" | "high") {
            return Err(msg::ERR_SENSITIVITY.get(language).to_string());
        }
        parse_minutes(&self.workday_start)
            .ok_or_else(|| msg::ERR_WORKDAY_START.get(language).to_string())?;
        parse_minutes(&self.workday_end)
            .ok_or_else(|| msg::ERR_WORKDAY_END.get(language).to_string())?;
        parse_minutes(&self.quiet_start)
            .ok_or_else(|| msg::ERR_QUIET_START.get(language).to_string())?;
        parse_minutes(&self.quiet_end)
            .ok_or_else(|| msg::ERR_QUIET_END.get(language).to_string())?;
        Ok(())
    }

    pub fn head_down_enter_score(&self) -> f64 {
        match self.sensitivity.as_str() {
            // MoveNet 的低头分数最高为 0.85。把“平衡”档放到旧版“较低”档
            // 的位置，只有更明确的相对位移才进入候选，降低轻微点头和模型
            // 漂移造成的频繁触发；“较高”档仍保留更早识别的空间。
            "low" => 0.82,
            "high" => 0.64,
            _ => 0.74,
        }
    }

    pub fn normalize_for_current_version(&mut self) {
        if !(MIN_HEAD_DOWN_CONFIRMATION_SECS..=MAX_HEAD_DOWN_CONFIRMATION_SECS)
            .contains(&self.head_down_confirmation_seconds)
        {
            self.head_down_confirmation_seconds = DEFAULT_HEAD_DOWN_CONFIRMATION_SECS;
        }
    }

    pub fn reminders_allowed_now(&self) -> bool {
        let now = Local::now();
        self.reminders_allowed_at(now.weekday(), now.hour() * 60 + now.minute())
    }

    fn reminders_allowed_at(&self, weekday: Weekday, minute: u32) -> bool {
        // 10/30 秒阈值只用于现场验证提醒链路，不能被默认的工作时段或
        // 午间静默规则吞掉，否则界面会持续显示“已达到阈值”却没有反馈。
        if self.sedentary_seconds <= 30 {
            return true;
        }
        if !self.weekend_enabled && matches!(weekday, Weekday::Sat | Weekday::Sun) {
            return false;
        }
        let work_start = parse_minutes(&self.workday_start).unwrap_or(0);
        let work_end = parse_minutes(&self.workday_end).unwrap_or(24 * 60);
        let in_work = in_span(minute, work_start, work_end);
        let quiet_start = parse_minutes(&self.quiet_start).unwrap_or(0);
        let quiet_end = parse_minutes(&self.quiet_end).unwrap_or(0);
        let in_quiet = self.quiet_hours_enabled
            && quiet_start != quiet_end
            && in_span(minute, quiet_start, quiet_end);
        in_work && !in_quiet
    }
}

fn default_sedentary_seconds() -> u64 {
    45 * 60
}

fn default_head_down_confirmation_seconds() -> u64 {
    DEFAULT_HEAD_DOWN_CONFIRMATION_SECS
}

fn default_language() -> String {
    "zh-CN".into()
}

fn default_reminder_sound() -> String {
    "auto".into()
}

fn default_enabled() -> bool {
    true
}

fn parse_minutes(value: &str) -> Option<u32> {
    let (hour, minute) = value.split_once(':')?;
    let hour: u32 = hour.parse().ok()?;
    let minute: u32 = minute.parse().ok()?;
    (hour < 24 && minute < 60).then_some(hour * 60 + minute)
}

fn in_span(value: u32, start: u32, end: u32) -> bool {
    if start <= end {
        value >= start && value <= end
    } else {
        value >= start || value <= end
    }
}

#[cfg(test)]
mod tests;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DailyStatistics {
    pub local_date: String,
    pub seated_seconds: u64,
    pub longest_seated_seconds: u64,
    pub head_down_seconds: u64,
    pub suspected_phone_seconds: u64,
    pub break_count: u64,
    pub reminder_count: u64,
    /// 今日点击“关闭本次”的提醒次数。
    pub dismissed_count: u64,
    /// 今日点击“稍后”的提醒次数。
    #[serde(default)]
    pub snoozed_count: u64,
    /// 今日离座活动总秒数（接水、上厕所等短暂离开）。
    #[serde(default)]
    pub away_seconds: u64,
    /// 今日检测到的人物离开座位次数。
    #[serde(default)]
    pub away_count: u64,
}

impl DailyStatistics {
    pub fn today() -> Self {
        Self {
            local_date: Local::now().date_naive().to_string(),
            ..Self::default()
        }
    }

    pub fn deferred_reminder_count(&self) -> u64 {
        self.snoozed_count.saturating_add(self.dismissed_count)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BehaviorHistoryEvent {
    pub id: String,
    pub event_type: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub duration_seconds: u64,
    pub action: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReminderKind {
    Sedentary,
    HeadDown,
    Combined,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReminderLevel {
    Gentle,
    Noticeable,
    Strong,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderPayload {
    pub id: String,
    pub kind: ReminderKind,
    pub level: ReminderLevel,
    pub title: String,
    pub message: String,
    pub duration_seconds: u64,
    pub triggered_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSnapshot {
    pub schema_version: u8,
    pub lifecycle: MonitoringLifecycle,
    pub behavior: BehaviorState,
    pub permission: PermissionState,
    pub monitoring_mode: MonitoringMode,
    pub person_present: bool,
    pub posture_confidence: f64,
    pub frame_quality: FrameQuality,
    pub seated_seconds: u64,
    pub head_down_seconds: u64,
    /// 当前会话离座活动秒数（人物不在座时累加）。
    #[serde(default)]
    pub away_seconds: u64,
    pub break_remaining_seconds: u64,
    /// 本次主动休息已持续秒数。进入休息后不再依赖摄像头确认离座。
    #[serde(default)]
    pub break_rest_seconds: u64,
    pub paused_until: Option<String>,
    /// 本次暂停开始时间（RFC3339），用于灵动岛暂停详情展示。
    #[serde(default)]
    pub paused_started_at: Option<String>,
    pub current_reminder: Option<ReminderPayload>,
    pub next_reminder_at: Option<String>,
    pub reminder_remaining_seconds: Option<u64>,
    pub today: DailyStatistics,
    pub settings: AppSettings,
    pub calibrated: bool,
    pub calibration_baseline: Option<f64>,
    pub last_observation_at: Option<String>,
    /// 最近一次检测活动时间（RFC3339），用于暂停和重启后的状态展示。
    #[serde(default)]
    pub last_detection_at: Option<String>,
    /// 本次连续监测会话的开始时间（RFC3339），同一天内可跨应用重启恢复。
    #[serde(default)]
    pub session_started_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalibrationResult {
    pub baseline: f64,
    pub camera_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct PersistedMeta {
    pub onboarded: bool,
    pub calibrated: bool,
    pub calibration_baseline: Option<f64>,
    pub permission: Option<PermissionState>,
    pub monitoring_mode: Option<MonitoringMode>,
    pub current_local_date: Option<String>,
    pub current_seated_seconds: u64,
    pub current_head_down_seconds: u64,
    pub current_away_seconds: u64,
    pub session_started_at: Option<String>,
    pub last_detection_at: Option<String>,
}
