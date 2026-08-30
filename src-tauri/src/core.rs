use std::time::{Duration, Instant};

use chrono::{Local, Utc};

use crate::{
    database::Database,
    messages::{msg, Language},
    model::{
        AppSettings, AppSnapshot, BehaviorState, CalibrationResult, DailyStatistics, FrameQuality,
        MonitoringLifecycle, MonitoringMode, PermissionState, PersistedMeta, PostureState,
        ReminderKind, ReminderLevel, ReminderPayload, SedentaryReminderState, VisionObservation,
        SCHEMA_VERSION,
    },
};

/// 连续缺失达到该时长后，才把“不确定/丢点”升级为真正离座。
/// 确认窗口内继续沿用上一个已确认状态；只有确认离座后才暂停坐姿计时。
const DEFAULT_PERSON_ABSENCE_CONFIRMATION_SECS: u64 = 3;
const HEAD_DOWN_EXIT_CONFIRMATION_SECS: u64 = 6;
const HEAD_DOWN_STATISTICS_MIN_SECS: u64 = 60;
const HEAD_DOWN_SEGMENT_MERGE_GRACE_SECS: u64 = 15;
pub(crate) const MIN_RECORDED_BREAK_SECS: u64 = 60;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SedentaryReminderAction {
    Snoozed,
    Dismissed,
}

pub struct RuntimeState {
    snapshot: AppSnapshot,
    last_tick: Instant,
    last_observation: Option<Instant>,
    person_missing_since: Option<Instant>,
    sitting_candidate_since: Option<Instant>,
    head_candidate_since: Option<Instant>,
    normal_candidate_since: Option<Instant>,
    head_down_segment_seconds: u64,
    head_down_segment_reported_seconds: u64,
    head_down_gap_since: Option<Instant>,
    paused_deadline: Option<Instant>,
    snoozed_until: Option<Instant>,
    last_sedentary_reminder: Option<Instant>,
    last_sedentary_action: Option<SedentaryReminderAction>,
    last_head_reminder: Option<Instant>,
    break_started_at: Option<Instant>,
    effective_break_recorded: bool,
}

impl RuntimeState {
    fn person_absence_confirmation(&self) -> Duration {
        let seconds = match self.snapshot.settings.sensitivity.as_str() {
            "high" => 2,
            "low" => 5,
            _ => DEFAULT_PERSON_ABSENCE_CONFIRMATION_SECS,
        };
        Duration::from_secs(seconds)
    }

    fn reset_head_down_segment(&mut self) {
        self.head_down_segment_seconds = 0;
        self.head_down_segment_reported_seconds = 0;
        self.head_down_gap_since = None;
    }

    fn start_head_down_segment(&mut self, now: Instant) {
        if self.head_down_gap_since.is_some_and(|gap_since| {
            now.duration_since(gap_since) > Duration::from_secs(HEAD_DOWN_SEGMENT_MERGE_GRACE_SECS)
        }) {
            self.reset_head_down_segment();
        }
        self.head_down_gap_since = None;
        self.snapshot.behavior = BehaviorState::HeadDown;
    }

    fn stop_head_down_segment(&mut self, now: Instant) {
        self.snapshot.head_down_seconds = 0;
        self.last_head_reminder = None;
        self.head_down_gap_since = Some(now);
    }

    fn expire_head_down_gap(&mut self, now: Instant) {
        if self.head_down_gap_since.is_some_and(|gap_since| {
            now.duration_since(gap_since) > Duration::from_secs(HEAD_DOWN_SEGMENT_MERGE_GRACE_SECS)
        }) {
            self.reset_head_down_segment();
        }
    }

    fn advance_head_down_statistics(&mut self, elapsed: u64) {
        self.head_down_gap_since = None;
        self.head_down_segment_seconds = self.head_down_segment_seconds.saturating_add(elapsed);
        if !self.snapshot.settings.statistics_enabled {
            self.head_down_segment_reported_seconds = self.head_down_segment_seconds;
            return;
        }
        let reportable_seconds = if self.head_down_segment_seconds >= HEAD_DOWN_STATISTICS_MIN_SECS
        {
            self.head_down_segment_seconds
        } else {
            0
        };
        let delta = reportable_seconds.saturating_sub(self.head_down_segment_reported_seconds);
        if delta > 0 {
            self.snapshot.today.head_down_seconds =
                self.snapshot.today.head_down_seconds.saturating_add(delta);
            self.head_down_segment_reported_seconds = reportable_seconds;
        }
    }

    fn sync_active_break_elapsed(&mut self, now: Instant) {
        if let Some(started_at) = self.break_started_at {
            self.snapshot.break_rest_seconds = self
                .snapshot
                .break_rest_seconds
                .max(now.duration_since(started_at).as_secs());
        }
    }

    fn advance_active_break_elapsed(&mut self, elapsed: u64, now: Instant) {
        self.snapshot.break_rest_seconds = self.snapshot.break_rest_seconds.saturating_add(elapsed);
        self.sync_active_break_elapsed(now);
    }

    pub fn load(database: &Database) -> Self {
        let settings = database.load_settings();
        let meta = database.load_meta();
        let monitoring_mode = meta.monitoring_mode.unwrap_or(MonitoringMode::Camera);
        let permission = meta.permission.unwrap_or(PermissionState::Prompt);
        // v1 的校准基线是负数头肩比；当前版本使用 0..1 画面头部位置。
        // 两者不可混用。检测到旧值时进入一次重新校准,避免静默误判低头。
        let calibration_baseline = meta
            .calibration_baseline
            .filter(|value| (0.0..=1.0).contains(value));
        // 只有 save_calibration 会写入有效基线，因此有效基线本身就是一次成功校准的
        // 持久化证据。旧版本在“开始重新校准”时过早清除了 calibrated，若随后退出，
        // 就会留下 baseline=Some、calibrated=false 的矛盾数据；这里兼容恢复这类数据。
        let calibrated = calibration_baseline.is_some();
        let lifecycle = if !meta.onboarded {
            MonitoringLifecycle::Unavailable
        } else if monitoring_mode == MonitoringMode::Camera && meta.calibrated && !calibrated {
            MonitoringLifecycle::Calibrating
        } else {
            MonitoringLifecycle::Paused
        };
        let today = database.load_today();
        let restore_current_session =
            meta.current_local_date.as_deref() == Some(today.local_date.as_str());
        let snapshot = AppSnapshot {
            schema_version: SCHEMA_VERSION,
            lifecycle,
            behavior: BehaviorState::Unknown,
            permission,
            monitoring_mode,
            person_present: false,
            posture_confidence: 0.0,
            frame_quality: FrameQuality::Unstable,
            seated_seconds: if restore_current_session {
                meta.current_seated_seconds
            } else {
                0
            },
            head_down_seconds: if restore_current_session {
                meta.current_head_down_seconds
            } else {
                0
            },
            away_seconds: if restore_current_session {
                meta.current_away_seconds
            } else {
                0
            },
            break_remaining_seconds: 0,
            break_rest_seconds: 0,
            paused_until: None,
            paused_started_at: None,
            current_reminder: None,
            sedentary_reminder_state: SedentaryReminderState::Counting,
            next_reminder_at: None,
            reminder_remaining_seconds: None,
            today,
            settings,
            calibrated,
            calibration_baseline,
            last_observation_at: None,
            last_detection_at: meta.last_detection_at.clone(),
            session_started_at: if restore_current_session {
                meta.session_started_at.clone()
            } else {
                None
            },
        };
        Self::new(snapshot)
    }

    fn new(snapshot: AppSnapshot) -> Self {
        Self {
            snapshot,
            last_tick: Instant::now(),
            last_observation: None,
            person_missing_since: None,
            sitting_candidate_since: None,
            head_candidate_since: None,
            normal_candidate_since: None,
            head_down_segment_seconds: 0,
            head_down_segment_reported_seconds: 0,
            head_down_gap_since: None,
            paused_deadline: None,
            snoozed_until: None,
            last_sedentary_reminder: None,
            last_sedentary_action: None,
            last_head_reminder: None,
            break_started_at: None,
            effective_break_recorded: false,
        }
    }

    pub fn snapshot(&mut self) -> AppSnapshot {
        self.tick();
        self.refresh_reminder_schedule(Instant::now());
        self.snapshot.clone()
    }

    fn reminder_repeat_delay(&self) -> Duration {
        let seconds = if self.snapshot.settings.sedentary_seconds <= 30 {
            self.snapshot.settings.sedentary_seconds
        } else {
            self.snapshot.settings.repeat_reminder_minutes * 60
        };
        Duration::from_secs(seconds.max(1))
    }

    fn reminder_includes_sedentary(reminder: &ReminderPayload) -> bool {
        matches!(
            &reminder.kind,
            ReminderKind::Sedentary | ReminderKind::Combined
        )
    }

    fn current_sedentary_reminder_active(&self) -> bool {
        self.snapshot
            .current_reminder
            .as_ref()
            .is_some_and(Self::reminder_includes_sedentary)
    }

    fn active_sedentary_snooze(&self, now: Instant) -> Option<Instant> {
        if !matches!(
            self.last_sedentary_action,
            Some(SedentaryReminderAction::Snoozed)
        ) {
            return None;
        }
        self.snoozed_until.filter(|deadline| *deadline > now)
    }

    fn sedentary_snooze_due(&self, now: Instant) -> bool {
        matches!(
            self.last_sedentary_action,
            Some(SedentaryReminderAction::Snoozed)
        ) && self.snoozed_until.is_some_and(|deadline| now >= deadline)
    }

    fn sedentary_reminder_state(&self, now: Instant) -> SedentaryReminderState {
        if self.current_sedentary_reminder_active() {
            return SedentaryReminderState::Due;
        }
        if self.snapshot.lifecycle == MonitoringLifecycle::Break {
            return SedentaryReminderState::Break;
        }

        let overdue = self.snapshot.seated_seconds >= self.snapshot.settings.sedentary_seconds;
        if self.snapshot.lifecycle == MonitoringLifecycle::Paused {
            return if overdue {
                SedentaryReminderState::PausedOverdue
            } else {
                SedentaryReminderState::Paused
            };
        }
        if overdue && self.active_sedentary_snooze(now).is_some() {
            return SedentaryReminderState::Snoozed;
        }
        if overdue
            && matches!(
                self.last_sedentary_action,
                Some(SedentaryReminderAction::Dismissed)
            )
        {
            return SedentaryReminderState::Dismissed;
        }
        if overdue {
            return SedentaryReminderState::Overdue;
        }
        SedentaryReminderState::Counting
    }

    fn reminder_remaining(&self, now: Instant) -> Option<u64> {
        if self.snapshot.current_reminder.is_some()
            || !matches!(
                self.snapshot.lifecycle,
                MonitoringLifecycle::Monitoring | MonitoringLifecycle::Degraded
            )
            || !self.snapshot.settings.reminders_allowed_now()
        {
            return None;
        }
        if let Some(deadline) = self.active_sedentary_snooze(now) {
            return Some(deadline.duration_since(now).as_secs().saturating_add(1));
        }
        if self.snapshot.seated_seconds < self.snapshot.settings.sedentary_seconds {
            return Some(
                self.snapshot
                    .settings
                    .sedentary_seconds
                    .saturating_sub(self.snapshot.seated_seconds),
            );
        }
        if self.sedentary_snooze_due(now) {
            return Some(0);
        }
        match self.last_sedentary_reminder {
            None => Some(0),
            Some(last) if self.snapshot.settings.repeat_reminders => {
                let delay = self.reminder_repeat_delay().as_secs();
                Some(delay.saturating_sub(now.duration_since(last).as_secs()))
            }
            Some(_) => None,
        }
    }

    /// 当前是否正在真实消耗“连续坐姿”倒计时。
    ///
    /// 定时模式始终计时；摄像头模式只有确认人物在座且姿态稳定后才计时。
    /// 该判断同时用于生成绝对提醒时间，避免离座或画面不稳定时展示一个
    /// 实际上不会到达的时刻。
    fn sedentary_clock_running(&self) -> bool {
        if !matches!(
            self.snapshot.lifecycle,
            MonitoringLifecycle::Monitoring | MonitoringLifecycle::Degraded
        ) {
            return false;
        }
        self.snapshot.monitoring_mode == MonitoringMode::Timer
            || (self.snapshot.person_present
                && matches!(
                    self.snapshot.behavior,
                    BehaviorState::SittingNormal | BehaviorState::HeadDown
                ))
    }

    fn refresh_reminder_schedule(&mut self, now: Instant) {
        let remaining = self.reminder_remaining(now);
        self.snapshot.reminder_remaining_seconds = remaining;
        self.snapshot.next_reminder_at = if self.sedentary_clock_running() {
            remaining.map(|seconds| {
                (Utc::now() + chrono::Duration::seconds(seconds as i64)).to_rfc3339()
            })
        } else {
            None
        };
        self.snapshot.sedentary_reminder_state = self.sedentary_reminder_state(now);
    }

    pub fn tick(&mut self) -> Option<ReminderPayload> {
        let now = Instant::now();
        let elapsed = now.duration_since(self.last_tick).as_secs();
        if elapsed == 0 {
            return None;
        }
        self.last_tick = now;
        self.advance(elapsed, now)
    }

    fn advance(&mut self, elapsed: u64, now: Instant) -> Option<ReminderPayload> {
        self.roll_date_if_needed();

        if self.snapshot.lifecycle == MonitoringLifecycle::Paused {
            if self.paused_deadline.is_some_and(|deadline| now >= deadline) {
                self.paused_deadline = None;
                self.snapshot.paused_until = None;
                self.snapshot.paused_started_at = None;
                self.snapshot.lifecycle = if self.snapshot.monitoring_mode == MonitoringMode::Camera
                    && self.snapshot.calibrated
                    && self.snapshot.permission == PermissionState::Granted
                {
                    MonitoringLifecycle::Monitoring
                } else {
                    MonitoringLifecycle::Degraded
                };
            }
            return None;
        }

        if self.snapshot.lifecycle == MonitoringLifecycle::Break {
            // 主动休息期间不再使用摄像头判断“是否真的离座”。用户点击开始休息
            // 即进入休息流程，统计只按主动休息持续时间计算。
            self.advance_active_break_elapsed(elapsed, now);
            // 倒计时到 0 后不自动结束休息，仍由用户手动调用 end_break() 完成。
            self.snapshot.break_remaining_seconds = self
                .snapshot
                .break_remaining_seconds
                .saturating_sub(elapsed);
            return None;
        }

        let running = matches!(
            self.snapshot.lifecycle,
            MonitoringLifecycle::Monitoring | MonitoringLifecycle::Degraded
        );
        if !running {
            return None;
        }
        if self.snapshot.monitoring_mode == MonitoringMode::Timer {
            self.snapshot.last_detection_at = Some(Utc::now().to_rfc3339());
        }

        // 坐姿计时门控：
        // - Timer 模式：无条件累加（无摄像头行为感知）。
        // - Camera 模式：缺失确认窗口内沿用上一个已确认状态；只有连续缺失
        //   达到阈值并把 person_present 改为 false 后才暂停。
        let seated = if self.snapshot.monitoring_mode == MonitoringMode::Timer {
            true
        } else {
            self.snapshot.person_present
                && matches!(
                    self.snapshot.behavior,
                    BehaviorState::SittingNormal | BehaviorState::HeadDown
                )
        };
        if seated {
            self.snapshot.seated_seconds = self.snapshot.seated_seconds.saturating_add(elapsed);
            if self.snapshot.settings.statistics_enabled {
                self.snapshot.today.seated_seconds =
                    self.snapshot.today.seated_seconds.saturating_add(elapsed);
                self.snapshot.today.longest_seated_seconds = self
                    .snapshot
                    .today
                    .longest_seated_seconds
                    .max(self.snapshot.seated_seconds);
            }
        }
        // 人物不在座时累加离座活动时间（Camera 模式专用）。
        if !seated
            && self.snapshot.monitoring_mode == MonitoringMode::Camera
            && !self.snapshot.person_present
            && self.snapshot.settings.statistics_enabled
        {
            self.snapshot.away_seconds = self.snapshot.away_seconds.saturating_add(elapsed);
            self.snapshot.today.away_seconds =
                self.snapshot.today.away_seconds.saturating_add(elapsed);
        }
        if self.snapshot.settings.island_head_down_enabled
            && self.snapshot.behavior == BehaviorState::HeadDown
        {
            self.snapshot.head_down_seconds =
                self.snapshot.head_down_seconds.saturating_add(elapsed);
            self.advance_head_down_statistics(elapsed);
        } else {
            self.expire_head_down_gap(now);
        }

        self.check_reminders(now)
    }

    fn roll_date_if_needed(&mut self) {
        let today = Local::now().date_naive().to_string();
        if self.snapshot.today.local_date != today {
            self.snapshot.today = DailyStatistics::today();
            self.snapshot.seated_seconds = 0;
            self.snapshot.head_down_seconds = 0;
            self.snapshot.away_seconds = 0;
            self.reset_head_down_segment();
            self.snapshot.session_started_at = if matches!(
                self.snapshot.lifecycle,
                MonitoringLifecycle::Monitoring | MonitoringLifecycle::Degraded
            ) {
                Some(Utc::now().to_rfc3339())
            } else {
                None
            };
            self.last_sedentary_reminder = None;
            self.last_sedentary_action = None;
            self.last_head_reminder = None;
            self.snoozed_until = None;
        }
    }

    fn check_reminders(&mut self, now: Instant) -> Option<ReminderPayload> {
        if self.snapshot.current_reminder.is_some()
            || !self.snapshot.settings.reminders_allowed_now()
            || self.snoozed_until.is_some_and(|deadline| deadline > now)
        {
            return None;
        }
        let sedentary_threshold = self.snapshot.settings.sedentary_seconds;
        let head_threshold = self.snapshot.settings.head_down_minutes * 60;
        let repeat = self.reminder_repeat_delay();
        let sedentary_snooze_due = self.sedentary_snooze_due(now);

        let sedentary_due = self.sedentary_clock_running()
            && self.snapshot.seated_seconds >= sedentary_threshold
            && match self.last_sedentary_reminder {
                None => true,
                Some(last) => {
                    sedentary_snooze_due
                        || (self.snapshot.settings.repeat_reminders
                            && now.duration_since(last) >= repeat)
                }
            };
        let head_due = self.snapshot.settings.island_head_down_enabled
            && self.snapshot.head_down_seconds >= head_threshold
            && match self.last_head_reminder {
                None => true,
                Some(last) => {
                    self.snapshot.settings.repeat_reminders && now.duration_since(last) >= repeat
                }
            };
        if !sedentary_due && !head_due {
            return None;
        }

        if sedentary_due {
            self.last_sedentary_reminder = Some(now);
            self.last_sedentary_action = None;
        }
        if head_due {
            self.last_head_reminder = Some(now);
        }
        if sedentary_snooze_due || (self.snoozed_until.is_some_and(|deadline| now >= deadline)) {
            self.snoozed_until = None;
        }
        let language = Language::of_settings(&self.snapshot.settings);
        let (kind, title, message) = match (sedentary_due, head_due) {
            (true, true) => (
                ReminderKind::Combined,
                msg::REMINDER_COMBINED_TITLE.get(language),
                msg::REMINDER_COMBINED_BODY.get(language),
            ),
            (true, false) => (
                ReminderKind::Sedentary,
                msg::REMINDER_SEDENTARY_TITLE.get(language),
                msg::REMINDER_SEDENTARY_BODY.get(language),
            ),
            (false, true) => (
                ReminderKind::HeadDown,
                msg::REMINDER_HEAD_DOWN_TITLE.get(language),
                msg::REMINDER_HEAD_DOWN_BODY.get(language),
            ),
            (false, false) => unreachable!(),
        };
        let strong = (self.snapshot.settings.island_head_down_enabled
            && self.snapshot.head_down_seconds
                >= self.snapshot.settings.head_down_strong_minutes * 60)
            || self.snapshot.today.deferred_reminder_count() >= 2;
        let level = if self.snapshot.settings.meeting_mode {
            ReminderLevel::Gentle
        } else if strong {
            ReminderLevel::Strong
        } else {
            ReminderLevel::Noticeable
        };
        let reminder = ReminderPayload {
            id: uuid::Uuid::new_v4().to_string(),
            kind,
            level,
            title: title.into(),
            message: message.into(),
            duration_seconds: self
                .snapshot
                .seated_seconds
                .max(self.snapshot.head_down_seconds),
            triggered_at: Utc::now().to_rfc3339(),
        };
        self.snapshot.today.reminder_count = self.snapshot.today.reminder_count.saturating_add(1);
        self.snapshot.current_reminder = Some(reminder.clone());
        Some(reminder)
    }

    pub fn finish_onboarding(&mut self, mode: MonitoringMode, permission: PermissionState) {
        self.snapshot.permission = permission;
        self.snapshot.monitoring_mode = mode;
        // “暂时使用定时提醒”是用户明确选择的运行模式。同步关闭摄像头偏好，
        // 避免设置页显示已启用、实际却仍在 timer/degraded 状态。
        self.snapshot.settings.camera_enabled = mode == MonitoringMode::Camera;
        self.snapshot.lifecycle = if mode == MonitoringMode::Camera {
            MonitoringLifecycle::Calibrating
        } else {
            MonitoringLifecycle::Degraded
        };
        if mode == MonitoringMode::Timer {
            self.snapshot.session_started_at = Some(Utc::now().to_rfc3339());
        }
        self.last_tick = Instant::now();
    }

    pub fn save_calibration(&mut self, result: CalibrationResult) -> Result<(), String> {
        let language = Language::of_settings(&self.snapshot.settings);
        if !result.baseline.is_finite() || !(0.0..=1.0).contains(&result.baseline) {
            return Err(msg::ERR_CALIBRATION_BASELINE.get(language).to_string());
        }
        if result.camera_id.len() > 512 {
            return Err(msg::ERR_CAMERA_ID_TOO_LONG.get(language).to_string());
        }
        self.snapshot.calibrated = true;
        self.snapshot.calibration_baseline = Some(result.baseline);
        self.snapshot.settings.camera_id = result.camera_id;
        self.snapshot.settings.camera_enabled = true;
        self.snapshot.permission = PermissionState::Granted;
        self.snapshot.monitoring_mode = MonitoringMode::Camera;
        self.snapshot.lifecycle = MonitoringLifecycle::Monitoring;
        self.snapshot.behavior = BehaviorState::Unknown;
        self.snapshot.session_started_at = Some(Utc::now().to_rfc3339());
        self.last_tick = Instant::now();
        Ok(())
    }

    pub fn start_calibration(&mut self) {
        self.snapshot.lifecycle = MonitoringLifecycle::Calibrating;
        self.snapshot.monitoring_mode = MonitoringMode::Camera;
        // 重新校准是一次事务：在 save_calibration 成功提交新基线前，保留上一次
        // 已验证的校准。这样取消校准或应用中途退出后仍能恢复相机检测。
        self.snapshot.current_reminder = None;
    }

    pub fn start_monitoring(&mut self, mode: MonitoringMode) -> Result<(), String> {
        if mode == MonitoringMode::Camera
            && (!self.snapshot.calibrated || self.snapshot.permission != PermissionState::Granted)
        {
            return Err(msg::ERR_CAMERA_NOT_AUTHORIZED
                .get(Language::of_settings(&self.snapshot.settings))
                .to_string());
        }
        self.snapshot.monitoring_mode = mode;
        if mode == MonitoringMode::Camera {
            // 这是用户主动进入摄像头模式（自动故障降级只会传入 Timer）。
            self.snapshot.settings.camera_enabled = true;
        }
        self.snapshot.lifecycle = if mode == MonitoringMode::Camera {
            MonitoringLifecycle::Monitoring
        } else {
            MonitoringLifecycle::Degraded
        };
        if self.snapshot.session_started_at.is_none() {
            self.snapshot.session_started_at = Some(Utc::now().to_rfc3339());
        }
        self.snapshot.current_reminder = None;
        self.snapshot.paused_until = None;
        self.snapshot.paused_started_at = None;
        self.paused_deadline = None;
        self.last_tick = Instant::now();
        Ok(())
    }

    pub fn pause(&mut self, minutes: Option<u64>) {
        self.tick();
        let now = Utc::now();
        self.snapshot.lifecycle = MonitoringLifecycle::Paused;
        self.snapshot.current_reminder = None;
        self.paused_deadline =
            minutes.map(|value| Instant::now() + Duration::from_secs(value.clamp(1, 24 * 60) * 60));
        self.snapshot.paused_until = minutes.map(|value| {
            (now + chrono::Duration::minutes(value.clamp(1, 24 * 60) as i64)).to_rfc3339()
        });
        self.snapshot.paused_started_at = Some(now.to_rfc3339());
    }

    pub fn resume(&mut self) -> Result<(), String> {
        // monitoring_mode 可能只是上一次相机临时故障后的 timer 退化状态。
        // 用户明确恢复检测时，应按当前持久化能力重新选择首选模式并重试相机。
        let preferred_mode = if self.snapshot.settings.camera_enabled
            && self.snapshot.calibrated
            && self.snapshot.permission == PermissionState::Granted
        {
            MonitoringMode::Camera
        } else {
            MonitoringMode::Timer
        };
        self.start_monitoring(preferred_mode)
    }

    pub fn start_break(&mut self) {
        self.tick();
        let now = Instant::now();
        self.effective_break_recorded = false;
        self.break_started_at = Some(now);
        self.snapshot.lifecycle = MonitoringLifecycle::Break;
        self.snapshot.break_remaining_seconds = self.snapshot.settings.break_minutes * 60;
        self.snapshot.break_rest_seconds = 0;
        self.snapshot.paused_until = None;
        self.snapshot.paused_started_at = None;
        self.paused_deadline = None;
        self.snapshot.current_reminder = None;
        self.snapshot.next_reminder_at = None;
        self.snapshot.reminder_remaining_seconds = None;
        self.last_tick = now;
    }

    pub fn end_break(&mut self) {
        self.tick();
        self.sync_active_break_elapsed(Instant::now());
        if self.snapshot.break_rest_seconds >= MIN_RECORDED_BREAK_SECS {
            // 用户已经完成一次明确且足够长的休息流程。确认后直接开始全新的监测
            // 会话，不再立刻生成“休息不足”的二次提醒，以免阻塞下一轮倒计时。
            self.complete_break();
        } else {
            // 少于 1 分钟的误触/临时点击不计为休息，也不重置连续坐姿或低头计时。
            self.cancel_short_break();
        }
    }

    /// 休息结束后自动恢复监测（摄像头就绪则回到 Monitoring，否则退化为定时模式），
    /// 不再停留在 Paused 等待手动恢复，避免摄像头管线来不及重启导致 ingest 失败。
    fn resume_after_break(&mut self) {
        self.snapshot.lifecycle = if self.snapshot.monitoring_mode == MonitoringMode::Camera
            && self.snapshot.calibrated
            && self.snapshot.permission == PermissionState::Granted
        {
            MonitoringLifecycle::Monitoring
        } else {
            MonitoringLifecycle::Degraded
        };
    }

    fn complete_break(&mut self) {
        if !self.effective_break_recorded {
            self.snapshot.today.break_count = self.snapshot.today.break_count.saturating_add(1);
        }
        self.effective_break_recorded = true;
        self.snoozed_until = None;
        self.snapshot.seated_seconds = 0;
        self.snapshot.head_down_seconds = 0;
        self.snapshot.away_seconds = 0;
        self.reset_head_down_segment();
        self.snapshot.break_remaining_seconds = 0;
        self.snapshot.current_reminder = None;
        self.snapshot.next_reminder_at = None;
        self.snapshot.reminder_remaining_seconds = None;
        self.snapshot.session_started_at = Some(Utc::now().to_rfc3339());
        self.last_sedentary_reminder = None;
        self.last_sedentary_action = None;
        self.last_head_reminder = None;
        self.head_candidate_since = None;
        self.person_missing_since = None;
        self.sitting_candidate_since = None;
        // 休息期间不消费摄像头观测。保留休息前最后一个有效姿态，避免用户
        // 点击“确认结束”后被无条件打回 Unknown，导致新会话无故停在 0 秒。
        self.break_started_at = None;
        self.resume_after_break();
        self.last_tick = Instant::now();
    }

    fn cancel_short_break(&mut self) {
        self.break_started_at = None;
        self.snapshot.break_remaining_seconds = 0;
        self.snapshot.break_rest_seconds = 0;
        self.snapshot.current_reminder = None;
        self.snapshot.next_reminder_at = None;
        self.snapshot.reminder_remaining_seconds = None;
        self.resume_after_break();
        self.last_tick = Instant::now();
    }

    pub fn snooze(&mut self, minutes: u64) {
        let applies_to_sedentary = self
            .snapshot
            .current_reminder
            .as_ref()
            .is_some_and(Self::reminder_includes_sedentary);
        if self.snapshot.current_reminder.take().is_some() {
            self.snapshot.today.snoozed_count = self.snapshot.today.snoozed_count.saturating_add(1);
        }
        if applies_to_sedentary {
            self.last_sedentary_action = Some(SedentaryReminderAction::Snoozed);
        }
        self.snoozed_until = Some(Instant::now() + Duration::from_secs(minutes.clamp(1, 120) * 60));
        self.refresh_reminder_schedule(Instant::now());
    }

    pub fn dismiss(&mut self) {
        let applies_to_sedentary = self
            .snapshot
            .current_reminder
            .as_ref()
            .is_some_and(Self::reminder_includes_sedentary);
        if self.snapshot.current_reminder.take().is_some() {
            self.snapshot.today.dismissed_count =
                self.snapshot.today.dismissed_count.saturating_add(1);
        }
        if applies_to_sedentary {
            self.last_sedentary_action = Some(SedentaryReminderAction::Dismissed);
            self.snoozed_until = None;
        }
        self.refresh_reminder_schedule(Instant::now());
    }

    pub fn update_settings(&mut self, settings: AppSettings) -> Result<(), String> {
        settings.validate()?;
        self.tick();
        let was_camera_enabled = self.snapshot.settings.camera_enabled;
        let lifecycle = self.snapshot.lifecycle;
        self.snapshot.settings = settings;

        if !self.snapshot.settings.island_head_down_enabled {
            self.head_candidate_since = None;
            self.normal_candidate_since = None;
            self.last_head_reminder = None;
            self.snapshot.head_down_seconds = 0;
            self.reset_head_down_segment();
            if self.snapshot.behavior == BehaviorState::HeadDown {
                self.snapshot.behavior = BehaviorState::SittingNormal;
            }
            if self
                .snapshot
                .current_reminder
                .as_ref()
                .is_some_and(|reminder| {
                    matches!(
                        &reminder.kind,
                        ReminderKind::HeadDown | ReminderKind::Combined
                    )
                })
            {
                self.snapshot.current_reminder = None;
            }
        }

        if !self.snapshot.settings.camera_enabled
            && self.snapshot.monitoring_mode == MonitoringMode::Camera
        {
            self.snapshot.monitoring_mode = MonitoringMode::Timer;
            if matches!(
                lifecycle,
                MonitoringLifecycle::Monitoring | MonitoringLifecycle::Degraded
            ) {
                self.snapshot.lifecycle = MonitoringLifecycle::Degraded;
                self.snapshot.behavior = BehaviorState::Unknown;
            }
        } else if !was_camera_enabled
            && self.snapshot.settings.camera_enabled
            && self.snapshot.calibrated
            && self.snapshot.permission == PermissionState::Granted
        {
            self.snapshot.monitoring_mode = MonitoringMode::Camera;
            if matches!(
                lifecycle,
                MonitoringLifecycle::Monitoring | MonitoringLifecycle::Degraded
            ) {
                self.snapshot.lifecycle = MonitoringLifecycle::Monitoring;
                self.snapshot.behavior = BehaviorState::Unknown;
            }
        }
        self.last_tick = Instant::now();
        Ok(())
    }

    pub fn clear_statistics(&mut self) {
        self.snapshot.today = DailyStatistics::today();
        self.snapshot.seated_seconds = 0;
        self.snapshot.head_down_seconds = 0;
        self.snapshot.away_seconds = 0;
        self.reset_head_down_segment();
        self.snapshot.current_reminder = None;
        self.snapshot.next_reminder_at = None;
        self.snapshot.reminder_remaining_seconds = None;
        self.snapshot.last_detection_at = None;
        self.snapshot.session_started_at = None;
        self.last_sedentary_reminder = None;
        self.last_sedentary_action = None;
        self.last_head_reminder = None;
        self.snoozed_until = None;
    }

    pub fn ingest(
        &mut self,
        observation: VisionObservation,
    ) -> Result<Option<ReminderPayload>, String> {
        observation.validate_with_language(Language::of_settings(&self.snapshot.settings))?;
        // Monitoring 正常检测；Break 期间用户已进入主动休息流程，不再消费摄像头
        // 观测去确认离座，避免休息提醒后继续占用识别管线。
        if self.snapshot.lifecycle == MonitoringLifecycle::Break {
            let _ = self.tick();
            return Ok(None);
        }
        if self.snapshot.monitoring_mode != MonitoringMode::Camera
            || !matches!(self.snapshot.lifecycle, MonitoringLifecycle::Monitoring)
        {
            return Err(msg::ERR_CAMERA_NOT_RUNNING
                .get(Language::of_settings(&self.snapshot.settings))
                .to_string());
        }
        let reminder = self.tick();
        let now = Instant::now();
        self.last_observation = Some(now);
        self.snapshot.last_observation_at = Some(Utc::now().to_rfc3339());
        self.snapshot.last_detection_at = self.snapshot.last_observation_at.clone();
        self.snapshot.frame_quality = observation.frame_quality;
        self.snapshot.posture_confidence = observation.posture.confidence;

        if observation.person.uncertain {
            // 单个或少量头部点位属于“画面不确定”：沿用上一个已确认状态继续
            // 计时，并清除缺失候选，避免局部遮挡最终被累计成明确离座。
            self.person_missing_since = None;
            self.sitting_candidate_since = None;
            self.head_candidate_since = None;
            self.normal_candidate_since = None;
            return Ok(reminder);
        }

        if !observation.person.present {
            let missing = *self.person_missing_since.get_or_insert(now);
            self.sitting_candidate_since = None;
            self.head_candidate_since = None;
            // 完全没有可信点位时进入离座确认窗口；确认前继续沿用上一个在场
            // 状态和计时，避免短时丢点造成时钟频繁停顿。
            if now.duration_since(missing) >= self.person_absence_confirmation() {
                let was_head_down = self.snapshot.behavior == BehaviorState::HeadDown;
                if self.snapshot.person_present && self.snapshot.settings.statistics_enabled {
                    self.snapshot.today.away_count =
                        self.snapshot.today.away_count.saturating_add(1);
                }
                self.snapshot.person_present = false;
                self.snapshot.behavior = BehaviorState::NoPerson;
                if was_head_down {
                    self.stop_head_down_segment(now);
                }
            }
            if now.duration_since(missing)
                >= Duration::from_secs(self.snapshot.settings.break_minutes * 60)
            {
                self.complete_observed_break();
            }
            return Ok(reminder);
        }

        self.person_missing_since = None;
        self.snapshot.person_present = true;
        // 头部被部分遮挡时可能只能确认“有人”，但暂时无法确认坐姿。先退出
        // 已离座状态，后续清晰帧再通过原有 2 秒坐姿门控进入 SittingNormal。
        if self.snapshot.behavior == BehaviorState::NoPerson {
            self.snapshot.behavior = BehaviorState::Present;
        }
        if observation.frame_quality != FrameQuality::Good
            || observation.person.confidence < 0.55
            || observation.posture.confidence < 0.45
        {
            return Ok(reminder);
        }

        match observation.posture.state {
            // `Standing` 仅为旧事件协议兼容保留。移除肩部检测后没有足够证据
            // 自动确认站立，核心层也忽略该值，避免旧客户端或异常帧误触发休息。
            PostureState::Standing | PostureState::Unknown => return Ok(reminder),
            PostureState::Sitting => {
                self.effective_break_recorded = false;
                let sitting = *self.sitting_candidate_since.get_or_insert(now);
                if now.duration_since(sitting) >= Duration::from_secs(2)
                    && matches!(
                        self.snapshot.behavior,
                        BehaviorState::Unknown
                            | BehaviorState::NoPerson
                            | BehaviorState::Present
                            | BehaviorState::StandingBreak
                    )
                {
                    self.snapshot.behavior = BehaviorState::SittingNormal;
                } else if matches!(
                    self.snapshot.behavior,
                    BehaviorState::Unknown | BehaviorState::NoPerson
                ) {
                    self.snapshot.behavior = BehaviorState::Present;
                }
            }
        }

        if !self.snapshot.settings.island_head_down_enabled {
            self.head_candidate_since = None;
            self.normal_candidate_since = None;
            self.snapshot.head_down_seconds = 0;
            self.reset_head_down_segment();
            if self.snapshot.behavior == BehaviorState::HeadDown {
                self.snapshot.behavior = BehaviorState::SittingNormal;
            }
            return Ok(reminder);
        }

        let enter = self.snapshot.settings.head_down_enter_score();
        let exit = enter - 0.14;
        if observation.head.confidence >= 0.65 && observation.head.down_score >= enter {
            self.normal_candidate_since = None;
            let head = *self.head_candidate_since.get_or_insert(now);
            if now.duration_since(head)
                >= Duration::from_secs(self.snapshot.settings.head_down_confirmation_seconds)
            {
                self.start_head_down_segment(now);
            }
        } else if observation.head.down_score <= exit {
            self.head_candidate_since = None;
            let normal = *self.normal_candidate_since.get_or_insert(now);
            if self.snapshot.behavior == BehaviorState::HeadDown
                && now.duration_since(normal)
                    >= Duration::from_secs(HEAD_DOWN_EXIT_CONFIRMATION_SECS)
            {
                self.snapshot.behavior = BehaviorState::SittingNormal;
                self.stop_head_down_segment(now);
            }
        } else if self.snapshot.behavior != BehaviorState::HeadDown {
            // 进入低头状态前必须是连续的强证据。旧实现会让处于进入/退出阈值
            // 之间的普通帧保留候选起点，导致零散高分帧被按整段时间累计。
            self.head_candidate_since = None;
            self.normal_candidate_since = None;
        }
        Ok(reminder)
    }

    fn complete_observed_break(&mut self) {
        // 休息倒计时期间不重复触发“观测到的休息”逻辑（由 Break 分支统一处理）。
        if self.effective_break_recorded || self.snapshot.lifecycle == MonitoringLifecycle::Break {
            return;
        }
        self.effective_break_recorded = true;
        self.snapshot.today.break_count = self.snapshot.today.break_count.saturating_add(1);
        self.snoozed_until = None;
        self.snapshot.seated_seconds = 0;
        self.snapshot.head_down_seconds = 0;
        self.snapshot.away_seconds = 0;
        self.reset_head_down_segment();
        self.snapshot.current_reminder = None;
        self.snapshot.next_reminder_at = None;
        self.snapshot.reminder_remaining_seconds = None;
        self.snapshot.session_started_at = Some(Utc::now().to_rfc3339());
        self.last_sedentary_reminder = None;
        self.last_sedentary_action = None;
        self.last_head_reminder = None;
    }

    pub fn persisted_meta(&self) -> PersistedMeta {
        PersistedMeta {
            onboarded: self.snapshot.lifecycle != MonitoringLifecycle::Unavailable,
            calibrated: self.snapshot.calibrated,
            calibration_baseline: self.snapshot.calibration_baseline,
            permission: Some(self.snapshot.permission),
            monitoring_mode: Some(self.snapshot.monitoring_mode),
            current_local_date: Some(self.snapshot.today.local_date.clone()),
            current_seated_seconds: self.snapshot.seated_seconds,
            current_head_down_seconds: self.snapshot.head_down_seconds,
            current_away_seconds: self.snapshot.away_seconds,
            session_started_at: self.snapshot.session_started_at.clone(),
            last_detection_at: self.snapshot.last_detection_at.clone(),
        }
    }

    pub fn settings(&self) -> &AppSettings {
        &self.snapshot.settings
    }
    pub fn today(&self) -> &DailyStatistics {
        &self.snapshot.today
    }
    pub fn current_reminder(&self) -> Option<&ReminderPayload> {
        self.snapshot.current_reminder.as_ref()
    }
}

#[cfg(test)]
mod tests;
