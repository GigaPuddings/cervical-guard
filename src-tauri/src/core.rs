use std::time::{Duration, Instant};

use chrono::{Local, Utc};

use crate::{
    database::Database,
    model::{
        AppSettings, AppSnapshot, BehaviorState, CalibrationResult, DailyStatistics, FrameQuality,
        MonitoringLifecycle, MonitoringMode, PermissionState, PersistedMeta, PostureState,
        ReminderKind, ReminderLevel, ReminderPayload, VisionObservation, SCHEMA_VERSION,
    },
};

/// 连续缺失达到该时长后，才把“不确定/丢点”升级为真正离座。
/// 在确认窗口内暂停坐姿计时，但不发布离座状态，也不累计离座统计。
const PERSON_ABSENCE_CONFIRMATION_SECS: u64 = 20;

pub struct RuntimeState {
    snapshot: AppSnapshot,
    last_tick: Instant,
    last_observation: Option<Instant>,
    person_missing_since: Option<Instant>,
    sitting_candidate_since: Option<Instant>,
    head_candidate_since: Option<Instant>,
    normal_candidate_since: Option<Instant>,
    paused_deadline: Option<Instant>,
    snoozed_until: Option<Instant>,
    last_sedentary_reminder: Option<Instant>,
    last_head_reminder: Option<Instant>,
    effective_break_recorded: bool,
}

impl RuntimeState {
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
        let snapshot = AppSnapshot {
            schema_version: SCHEMA_VERSION,
            lifecycle,
            behavior: BehaviorState::Unknown,
            permission,
            monitoring_mode,
            person_present: false,
            posture_confidence: 0.0,
            frame_quality: FrameQuality::Unstable,
            seated_seconds: 0,
            head_down_seconds: 0,
            away_seconds: 0,
            break_remaining_seconds: 0,
            break_rest_seconds: 0,
            paused_until: None,
            current_reminder: None,
            next_reminder_at: None,
            reminder_remaining_seconds: None,
            today: database.load_today(),
            settings,
            calibrated,
            calibration_baseline,
            last_observation_at: None,
            session_started_at: None,
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
            paused_deadline: None,
            snoozed_until: None,
            last_sedentary_reminder: None,
            last_head_reminder: None,
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
        if let Some(deadline) = self.snoozed_until.filter(|deadline| *deadline > now) {
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
                && self.person_missing_since.is_none()
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
            // 休息期间摄像头保持低功耗观测：确认离座才计为有效休息，
            // 让系统知道本次真实休息了多久，而不是只依赖倒计时。
            let resting = self.snapshot.monitoring_mode == MonitoringMode::Camera
                && (!self.snapshot.person_present
                    || self.snapshot.behavior == BehaviorState::NoPerson);
            if resting {
                self.snapshot.break_rest_seconds =
                    self.snapshot.break_rest_seconds.saturating_add(elapsed);
            }
            // 倒计时到 0 后不自动结束休息——系统无法仅凭持续监测判断用户是否
            // 真正休息完毕。保持 Break 生命周期，前端展示"确认结束"按钮，
            // 由用户手动调用 end_break() 完成。摄像头在此期间持续运行，
            // 确保用户确认结束时检测管线已就绪。
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

        // 坐姿计时门控：
        // - Timer 模式：无条件累加（无摄像头行为感知）。
        // - Camera 模式：原始检测一旦进入缺失确认窗口就立即暂停；只有连续
        //   缺失达到阈值才把对外 person_present 改为 false。
        let seated = if self.snapshot.monitoring_mode == MonitoringMode::Timer {
            true
        } else {
            self.snapshot.person_present
                && self.person_missing_since.is_none()
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
        if self.snapshot.behavior == BehaviorState::HeadDown {
            self.snapshot.head_down_seconds =
                self.snapshot.head_down_seconds.saturating_add(elapsed);
            if self.snapshot.settings.statistics_enabled {
                self.snapshot.today.head_down_seconds = self
                    .snapshot
                    .today
                    .head_down_seconds
                    .saturating_add(elapsed);
            }
        }

        self.check_reminders(now)
    }

    fn roll_date_if_needed(&mut self) {
        let today = Local::now().date_naive().to_string();
        if self.snapshot.today.local_date != today {
            self.snapshot.today = DailyStatistics::today();
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

        let sedentary_due = self.sedentary_clock_running()
            && self.snapshot.seated_seconds >= sedentary_threshold
            && match self.last_sedentary_reminder {
                None => true,
                Some(last) => {
                    self.snapshot.settings.repeat_reminders && now.duration_since(last) >= repeat
                }
            };
        let head_due = self.snapshot.head_down_seconds >= head_threshold
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
        }
        if head_due {
            self.last_head_reminder = Some(now);
        }
        let (kind, title, message) = match (sedentary_due, head_due) {
            (true, true) => (
                ReminderKind::Combined,
                "该舒展一下了",
                "你已经连续坐了一段时间，也有持续低头的迹象。建议站起来活动 2～5 分钟。",
            ),
            (true, false) => (
                ReminderKind::Sedentary,
                "起来走一走吧",
                "你已经连续坐了一段时间，建议站起来活动 2～5 分钟。",
            ),
            (false, true) => (
                ReminderKind::HeadDown,
                "试着抬起头",
                "检测到你已经低头一段时间，可以抬高视线并放松颈肩。",
            ),
            (false, false) => unreachable!(),
        };
        let strong = self.snapshot.head_down_seconds
            >= self.snapshot.settings.head_down_strong_minutes * 60
            || self.snapshot.today.dismissed_count >= 2;
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
        if !result.baseline.is_finite() || !(0.0..=1.0).contains(&result.baseline) {
            return Err("校准基线无效".into());
        }
        if result.camera_id.len() > 512 {
            return Err("摄像头标识过长".into());
        }
        self.snapshot.calibrated = true;
        self.snapshot.calibration_baseline = Some(result.baseline);
        self.snapshot.settings.camera_id = result.camera_id;
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
            return Err("摄像头尚未授权或未完成校准".into());
        }
        self.snapshot.monitoring_mode = mode;
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
        self.paused_deadline = None;
        self.last_tick = Instant::now();
        Ok(())
    }

    pub fn pause(&mut self, minutes: Option<u64>) {
        self.tick();
        self.snapshot.lifecycle = MonitoringLifecycle::Paused;
        self.snapshot.current_reminder = None;
        self.paused_deadline =
            minutes.map(|value| Instant::now() + Duration::from_secs(value.clamp(1, 24 * 60) * 60));
        self.snapshot.paused_until = minutes.map(|value| {
            (Utc::now() + chrono::Duration::minutes(value.clamp(1, 24 * 60) as i64)).to_rfc3339()
        });
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
        self.effective_break_recorded = false;
        self.snapshot.lifecycle = MonitoringLifecycle::Break;
        self.snapshot.break_remaining_seconds = self.snapshot.settings.break_minutes * 60;
        self.snapshot.break_rest_seconds = 0;
        self.snapshot.current_reminder = None;
        self.snapshot.next_reminder_at = None;
        self.snapshot.reminder_remaining_seconds = None;
        self.last_tick = Instant::now();
    }

    pub fn end_break(&mut self) {
        // 用户已经完成一次明确的休息流程。确认后直接开始全新的监测会话，
        // 不再立刻生成“休息不足”的二次提醒，以免阻塞下一轮倒计时。
        self.complete_break();
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
        self.snapshot.seated_seconds = 0;
        self.snapshot.head_down_seconds = 0;
        self.snapshot.away_seconds = 0;
        self.snapshot.break_remaining_seconds = 0;
        self.snapshot.current_reminder = None;
        self.snapshot.next_reminder_at = None;
        self.snapshot.reminder_remaining_seconds = None;
        self.last_sedentary_reminder = None;
        self.last_head_reminder = None;
        self.head_candidate_since = None;
        self.person_missing_since = None;
        self.sitting_candidate_since = None;
        // 休息期间摄像头一直在低功耗观测。保留最后一个有效姿态，避免用户
        // 点击“确认结束”后被无条件打回 Unknown，导致新会话无故停在 0 秒。
        // 若用户仍离座，sedentary_clock_running() 会继续正确地暂停计时。
        self.resume_after_break();
        self.last_tick = Instant::now();
    }

    pub fn snooze(&mut self, minutes: u64) {
        self.snapshot.current_reminder = None;
        self.snoozed_until = Some(Instant::now() + Duration::from_secs(minutes.clamp(1, 120) * 60));
        self.refresh_reminder_schedule(Instant::now());
    }

    pub fn dismiss(&mut self) {
        if self.snapshot.current_reminder.take().is_some() {
            self.snapshot.today.dismissed_count =
                self.snapshot.today.dismissed_count.saturating_add(1);
        }
        self.refresh_reminder_schedule(Instant::now());
    }

    pub fn update_settings(&mut self, settings: AppSettings) -> Result<(), String> {
        settings.validate()?;
        self.tick();
        let was_camera_enabled = self.snapshot.settings.camera_enabled;
        let lifecycle = self.snapshot.lifecycle;
        self.snapshot.settings = settings;

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
        self.snapshot.current_reminder = None;
        self.last_sedentary_reminder = None;
        self.last_head_reminder = None;
    }

    pub fn ingest(
        &mut self,
        observation: VisionObservation,
    ) -> Result<Option<ReminderPayload>, String> {
        observation.validate()?;
        // Monitoring 正常检测；Break 期间也接受观测，用于感知真实休息行为。
        if self.snapshot.monitoring_mode != MonitoringMode::Camera
            || !matches!(
                self.snapshot.lifecycle,
                MonitoringLifecycle::Monitoring | MonitoringLifecycle::Break
            )
        {
            return Err("摄像头检测当前未运行".into());
        }
        let reminder = self.tick();
        let now = Instant::now();
        self.last_observation = Some(now);
        self.snapshot.last_observation_at = Some(Utc::now().to_rfc3339());
        self.snapshot.frame_quality = observation.frame_quality;
        self.snapshot.posture_confidence = observation.posture.confidence;

        if !observation.person.present {
            let missing = *self.person_missing_since.get_or_insert(now);
            self.sitting_candidate_since = None;
            self.head_candidate_since = None;
            // 单帧或短时关键点丢失只视为“不确定”：计时立即暂停，但对外仍保留
            // 上一个已确认的在场状态，避免深度低头/遮挡触发离座灵动岛。
            if now.duration_since(missing) >= Duration::from_secs(PERSON_ABSENCE_CONFIRMATION_SECS)
            {
                if self.snapshot.person_present && self.snapshot.settings.statistics_enabled {
                    self.snapshot.today.away_count =
                        self.snapshot.today.away_count.saturating_add(1);
                }
                self.snapshot.person_present = false;
                self.snapshot.behavior = BehaviorState::NoPerson;
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

        let enter = self.snapshot.settings.head_down_enter_score();
        if observation.head.confidence >= 0.55 && observation.head.down_score >= enter {
            self.normal_candidate_since = None;
            let head = *self.head_candidate_since.get_or_insert(now);
            if now.duration_since(head) >= Duration::from_secs(3) {
                self.snapshot.behavior = BehaviorState::HeadDown;
            }
        } else if observation.head.down_score <= enter - 0.14 {
            self.head_candidate_since = None;
            let normal = *self.normal_candidate_since.get_or_insert(now);
            if self.snapshot.behavior == BehaviorState::HeadDown
                && now.duration_since(normal) >= Duration::from_secs(4)
            {
                self.snapshot.behavior = BehaviorState::SittingNormal;
                self.snapshot.head_down_seconds = 0;
                self.last_head_reminder = None;
            }
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
        self.snapshot.seated_seconds = 0;
        self.snapshot.head_down_seconds = 0;
        self.snapshot.away_seconds = 0;
        self.snapshot.current_reminder = None;
        self.last_sedentary_reminder = None;
        self.last_head_reminder = None;
    }

    pub fn persisted_meta(&self) -> PersistedMeta {
        PersistedMeta {
            onboarded: self.snapshot.lifecycle != MonitoringLifecycle::Unavailable,
            calibrated: self.snapshot.calibrated,
            calibration_baseline: self.snapshot.calibration_baseline,
            permission: Some(self.snapshot.permission),
            monitoring_mode: Some(self.snapshot.monitoring_mode),
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
mod tests {
    use super::*;
    use crate::model::{HeadObservation, PersonObservation, PostureObservation, VisionMetrics};

    fn state() -> RuntimeState {
        let database = Database::memory();
        let mut state = RuntimeState::load(&database);
        state.finish_onboarding(MonitoringMode::Timer, PermissionState::Denied);
        state.snapshot.settings.workday_start = "00:00".into();
        state.snapshot.settings.workday_end = "23:59".into();
        state.snapshot.settings.weekend_enabled = true;
        // 单元测试不应随执行机器当前是否恰好处于默认静默时段而波动。
        state.snapshot.settings.quiet_hours_enabled = false;
        state
    }

    fn observation(posture: PostureState, down_score: f64) -> VisionObservation {
        VisionObservation {
            schema_version: SCHEMA_VERSION,
            sequence: 1,
            captured_at_monotonic_ms: 100.0,
            person: PersonObservation {
                present: true,
                confidence: 0.9,
            },
            posture: PostureObservation {
                state: posture,
                confidence: 0.9,
            },
            head: HeadObservation {
                down_score,
                confidence: 0.9,
            },
            frame_quality: FrameQuality::Good,
            metrics: VisionMetrics {
                pose_ms: 20.0,
                dropped_frames: 0,
            },
        }
    }

    #[test]
    fn timer_mode_triggers_after_continuous_threshold() {
        let mut state = state();
        state.snapshot.settings.sedentary_seconds = 60;
        state.snapshot.settings.quiet_start = "00:00".into();
        state.snapshot.settings.quiet_end = "00:00".into();
        state.snapshot.settings.workday_start = "00:00".into();
        state.snapshot.settings.workday_end = "23:59".into();
        state.snapshot.settings.weekend_enabled = true;
        let now = Instant::now();
        assert!(state.advance(59, now).is_none());
        let reminder = state.advance(1, now + Duration::from_secs(1));
        assert!(matches!(
            reminder.map(|item| item.kind),
            Some(ReminderKind::Sedentary)
        ));
    }

    #[test]
    fn low_quality_observation_never_asserts_head_down() {
        let mut state = state();
        state.snapshot.monitoring_mode = MonitoringMode::Camera;
        state.snapshot.lifecycle = MonitoringLifecycle::Monitoring;
        let mut item = observation(PostureState::Sitting, 1.0);
        item.frame_quality = FrameQuality::Dark;
        state.ingest(item).unwrap();
        assert_ne!(state.snapshot.behavior, BehaviorState::HeadDown);
    }

    #[test]
    fn camera_ingest_returns_a_due_head_down_reminder() {
        let mut state = state();
        state.snapshot.monitoring_mode = MonitoringMode::Camera;
        state.snapshot.lifecycle = MonitoringLifecycle::Monitoring;
        state.snapshot.person_present = true;
        state.snapshot.behavior = BehaviorState::HeadDown;
        state.snapshot.head_down_seconds = state.snapshot.settings.head_down_minutes * 60 - 1;
        state.last_tick = Instant::now() - Duration::from_secs(1);

        let reminder = state
            .ingest(observation(PostureState::Sitting, 1.0))
            .expect("camera observation should be accepted");

        assert!(matches!(
            reminder.map(|item| item.kind),
            Some(ReminderKind::HeadDown)
        ));
    }

    #[test]
    fn short_keypoint_loss_pauses_clock_without_publishing_away() {
        let mut state = state();
        state.snapshot.monitoring_mode = MonitoringMode::Camera;
        state.snapshot.lifecycle = MonitoringLifecycle::Monitoring;
        state.snapshot.person_present = true;
        state.snapshot.behavior = BehaviorState::SittingNormal;
        state.snapshot.seated_seconds = 30;

        let mut missing = observation(PostureState::Unknown, 0.0);
        missing.person.present = false;
        missing.person.confidence = 0.0;
        missing.posture.confidence = 0.0;
        missing.head.confidence = 0.0;
        missing.frame_quality = FrameQuality::Unstable;
        state.ingest(missing).unwrap();

        assert!(state.snapshot.person_present);
        assert_eq!(state.snapshot.behavior, BehaviorState::SittingNormal);
        assert!(!state.sedentary_clock_running());
        state.advance(5, Instant::now() + Duration::from_secs(5));
        assert_eq!(state.snapshot.seated_seconds, 30);
        assert_eq!(state.snapshot.today.away_count, 0);
    }

    #[test]
    fn arm_occlusion_inside_confirmation_window_never_publishes_away() {
        let mut state = state();
        state.snapshot.monitoring_mode = MonitoringMode::Camera;
        state.snapshot.lifecycle = MonitoringLifecycle::Monitoring;
        state.snapshot.person_present = true;
        state.snapshot.behavior = BehaviorState::SittingNormal;
        state.person_missing_since = Some(
            Instant::now()
                - Duration::from_secs(PERSON_ABSENCE_CONFIRMATION_SECS.saturating_sub(1)),
        );

        let mut missing = observation(PostureState::Unknown, 0.0);
        missing.person.present = false;
        missing.person.confidence = 0.0;
        missing.posture.confidence = 0.0;
        missing.head.confidence = 0.0;
        missing.frame_quality = FrameQuality::Occluded;
        state.ingest(missing).unwrap();

        assert!(state.snapshot.person_present);
        assert_eq!(state.snapshot.behavior, BehaviorState::SittingNormal);
        assert_eq!(state.snapshot.today.away_count, 0);
    }

    #[test]
    fn legacy_standing_observation_is_ignored() {
        let mut state = state();
        state.snapshot.monitoring_mode = MonitoringMode::Camera;
        state.snapshot.lifecycle = MonitoringLifecycle::Monitoring;
        state.snapshot.person_present = true;
        state.snapshot.behavior = BehaviorState::SittingNormal;

        state
            .ingest(observation(PostureState::Standing, 1.0))
            .unwrap();

        assert_eq!(state.snapshot.behavior, BehaviorState::SittingNormal);
    }

    #[test]
    fn continuous_keypoint_loss_confirms_away_only_once() {
        let mut state = state();
        state.snapshot.monitoring_mode = MonitoringMode::Camera;
        state.snapshot.lifecycle = MonitoringLifecycle::Monitoring;
        state.snapshot.person_present = true;
        state.snapshot.behavior = BehaviorState::SittingNormal;
        state.person_missing_since =
            Some(Instant::now() - Duration::from_secs(PERSON_ABSENCE_CONFIRMATION_SECS + 1));

        let mut missing = observation(PostureState::Unknown, 0.0);
        missing.person.present = false;
        missing.person.confidence = 0.0;
        missing.posture.confidence = 0.0;
        missing.head.confidence = 0.0;
        missing.frame_quality = FrameQuality::Unstable;
        state.ingest(missing.clone()).unwrap();

        assert!(!state.snapshot.person_present);
        assert_eq!(state.snapshot.behavior, BehaviorState::NoPerson);
        assert_eq!(state.snapshot.today.away_count, 1);

        state.ingest(missing).unwrap();
        assert_eq!(state.snapshot.today.away_count, 1);
    }

    #[test]
    fn pausing_stops_monotonic_accumulation() {
        let mut state = state();
        state.advance(30, Instant::now());
        state.pause(None);
        let seated = state.snapshot.seated_seconds;
        state.advance(3_600, Instant::now() + Duration::from_secs(3_600));
        assert_eq!(state.snapshot.seated_seconds, seated);
    }

    #[test]
    fn camera_mode_requires_calibration_and_permission() {
        let mut state = state();
        assert!(state.start_monitoring(MonitoringMode::Camera).is_err());
    }

    #[test]
    fn interrupted_recalibration_preserves_the_last_valid_baseline() {
        let mut state = state();
        state.snapshot.calibrated = true;
        state.snapshot.calibration_baseline = Some(0.64);
        state.snapshot.permission = PermissionState::Granted;

        state.start_calibration();

        assert_eq!(state.snapshot.lifecycle, MonitoringLifecycle::Calibrating);
        assert!(state.snapshot.calibrated);
        assert_eq!(state.snapshot.calibration_baseline, Some(0.64));
    }

    #[test]
    fn resume_retries_camera_after_a_previous_timer_fallback() {
        let mut state = state();
        state.snapshot.lifecycle = MonitoringLifecycle::Paused;
        state.snapshot.monitoring_mode = MonitoringMode::Timer;
        state.snapshot.settings.camera_enabled = true;
        state.snapshot.calibrated = true;
        state.snapshot.calibration_baseline = Some(0.64);
        state.snapshot.permission = PermissionState::Granted;

        state.resume().unwrap();

        assert_eq!(state.snapshot.monitoring_mode, MonitoringMode::Camera);
        assert_eq!(state.snapshot.lifecycle, MonitoringLifecycle::Monitoring);
    }

    #[test]
    fn load_recovers_valid_calibration_from_an_interrupted_recalibration() {
        let database = Database::memory();
        database
            .save_meta(&PersistedMeta {
                onboarded: true,
                calibrated: false,
                calibration_baseline: Some(0.64),
                permission: Some(PermissionState::Granted),
                monitoring_mode: Some(MonitoringMode::Timer),
            })
            .unwrap();

        let state = RuntimeState::load(&database);

        assert!(state.snapshot.calibrated);
        assert_eq!(state.snapshot.calibration_baseline, Some(0.64));
        assert_eq!(state.snapshot.lifecycle, MonitoringLifecycle::Paused);
    }

    #[test]
    fn settings_hot_update_preserves_pause_and_switches_running_mode() {
        let mut state = state();
        state.snapshot.monitoring_mode = MonitoringMode::Camera;
        state.pause(None);
        let mut settings = state.snapshot.settings.clone();
        settings.camera_enabled = false;
        settings.sedentary_seconds = 10;
        state.update_settings(settings).unwrap();
        assert_eq!(state.snapshot.lifecycle, MonitoringLifecycle::Paused);
        assert_eq!(state.snapshot.monitoring_mode, MonitoringMode::Timer);
        assert_eq!(state.snapshot.settings.sedentary_seconds, 10);
    }

    #[test]
    fn lowered_sedentary_threshold_applies_on_the_next_tick() {
        let mut state = state();
        let now = Instant::now();
        assert!(state.advance(12, now).is_none());
        let mut settings = state.snapshot.settings.clone();
        settings.sedentary_seconds = 10;
        state.update_settings(settings).unwrap();
        let reminder = state.advance(1, now + Duration::from_secs(1));
        assert!(matches!(
            reminder.map(|item| item.kind),
            Some(ReminderKind::Sedentary)
        ));
    }

    #[test]
    fn short_test_threshold_repeats_on_the_same_second_cadence() {
        let mut state = state();
        state.snapshot.settings.sedentary_seconds = 10;
        state.snapshot.settings.repeat_reminders = true;
        let now = Instant::now();

        assert!(state.advance(10, now).is_some());
        state.dismiss();
        assert!(state.advance(9, now + Duration::from_secs(9)).is_none());
        assert!(state.advance(1, now + Duration::from_secs(10)).is_some());
        assert_eq!(state.snapshot.today.reminder_count, 2);
    }

    #[test]
    fn snapshot_exposes_the_next_reminder_time_and_countdown() {
        let mut state = state();
        state.snapshot.settings.sedentary_seconds = 10;
        state.advance(4, Instant::now());

        let snapshot = state.snapshot();
        assert!(snapshot.next_reminder_at.is_some());
        assert_eq!(snapshot.reminder_remaining_seconds, Some(6));
    }

    #[test]
    fn person_absence_immediately_stops_seated_accumulation() {
        let mut state = state();
        state.snapshot.monitoring_mode = MonitoringMode::Camera;
        state.snapshot.lifecycle = MonitoringLifecycle::Monitoring;
        // 模拟人物在座、正常坐姿
        state.snapshot.person_present = true;
        state.snapshot.behavior = BehaviorState::SittingNormal;
        let now = Instant::now();
        // 累积 30 秒坐姿
        state.advance(30, now);
        assert_eq!(state.snapshot.seated_seconds, 30);
        // 人物离开：person_present = false，但 behavior 仍为 SittingNormal（10s 容忍窗口内）
        state.snapshot.person_present = false;
        // 再前进 5 秒——坐姿计时应立即停止
        state.advance(5, now + Duration::from_secs(35));
        assert_eq!(
            state.snapshot.seated_seconds, 30,
            "seated_seconds should not increase when person is absent"
        );
    }

    #[test]
    fn person_return_resumes_accumulation() {
        let mut state = state();
        state.snapshot.monitoring_mode = MonitoringMode::Camera;
        state.snapshot.lifecycle = MonitoringLifecycle::Monitoring;
        state.snapshot.person_present = true;
        state.snapshot.behavior = BehaviorState::SittingNormal;
        let now = Instant::now();
        state.advance(20, now);
        // 人物离开
        state.snapshot.person_present = false;
        state.advance(5, now + Duration::from_secs(25));
        assert_eq!(state.snapshot.seated_seconds, 20);
        // 人物返回
        state.snapshot.person_present = true;
        state.advance(10, now + Duration::from_secs(35));
        assert_eq!(state.snapshot.seated_seconds, 30);
    }

    #[test]
    fn short_absence_does_not_reset_seated() {
        let mut state = state();
        state.snapshot.monitoring_mode = MonitoringMode::Camera;
        state.snapshot.lifecycle = MonitoringLifecycle::Monitoring;
        state.snapshot.person_present = true;
        state.snapshot.behavior = BehaviorState::SittingNormal;
        let now = Instant::now();
        state.advance(40, now);
        // 短暂离座 15 秒（远小于默认 break_minutes * 60 = 300）
        state.snapshot.person_present = false;
        state.advance(15, now + Duration::from_secs(55));
        // seated_seconds 不应重置，但也不应增长
        assert_eq!(state.snapshot.seated_seconds, 40);
    }

    #[test]
    fn away_seconds_accumulate_during_absence() {
        let mut state = state();
        state.snapshot.monitoring_mode = MonitoringMode::Camera;
        state.snapshot.lifecycle = MonitoringLifecycle::Monitoring;
        state.snapshot.person_present = true;
        state.snapshot.behavior = BehaviorState::SittingNormal;
        let now = Instant::now();
        state.advance(10, now);
        assert_eq!(state.snapshot.away_seconds, 0);
        // 人物离开 20 秒
        state.snapshot.person_present = false;
        state.advance(20, now + Duration::from_secs(30));
        assert_eq!(state.snapshot.away_seconds, 20);
        assert_eq!(state.snapshot.today.away_seconds, 20);
        // 人物返回——away_seconds 停止增长
        state.snapshot.person_present = true;
        state.advance(10, now + Duration::from_secs(40));
        assert_eq!(
            state.snapshot.away_seconds, 20,
            "away should not grow when person present"
        );
    }

    #[test]
    fn break_completion_requires_manual_confirmation() {
        let mut state = state();
        state.start_break();
        assert_eq!(state.snapshot.lifecycle, MonitoringLifecycle::Break);
        let now = Instant::now();
        // 倒计时到 0 后不自动结束——保持 Break 生命周期等待手动确认。
        let total = state.snapshot.settings.break_minutes * 60;
        assert!(state.advance(total + 1, now).is_none());
        assert_eq!(state.snapshot.lifecycle, MonitoringLifecycle::Break);
        assert_eq!(state.snapshot.break_remaining_seconds, 0);
        assert_eq!(state.snapshot.today.break_count, 0);
        // 手动确认后才完成休息并恢复检测。
        state.end_break();
        assert_eq!(state.snapshot.lifecycle, MonitoringLifecycle::Degraded);
        assert_eq!(state.snapshot.today.break_count, 1);
        let snapshot = state.snapshot();
        assert_eq!(
            snapshot.reminder_remaining_seconds,
            Some(snapshot.settings.sedentary_seconds)
        );
        assert!(snapshot.next_reminder_at.is_some());
    }

    #[test]
    fn break_confirmation_starts_a_clean_camera_session_without_follow_up_reminder() {
        let mut state = state();
        state.snapshot.monitoring_mode = MonitoringMode::Camera;
        state.snapshot.calibrated = true;
        state.snapshot.permission = PermissionState::Granted;
        state.snapshot.lifecycle = MonitoringLifecycle::Monitoring;
        state.start_break();
        let now = Instant::now();
        // 休息期间人物一直坐着（无站立/离座），有效休息为 0。
        state.snapshot.person_present = true;
        state.snapshot.behavior = BehaviorState::SittingNormal;
        let total = state.snapshot.settings.break_minutes * 60;
        // 倒计时到 0 后不自动结束——保持 Break 生命周期。
        assert!(state.advance(total + 1, now).is_none());
        assert_eq!(state.snapshot.lifecycle, MonitoringLifecycle::Break);
        assert_eq!(state.snapshot.break_remaining_seconds, 0);
        // 手动确认后保留休息期间已经确认的坐姿，立即开始新一轮倒计时。
        state.end_break();
        assert_eq!(state.snapshot.lifecycle, MonitoringLifecycle::Monitoring);
        assert_eq!(state.snapshot.behavior, BehaviorState::SittingNormal);
        assert!(state.snapshot.current_reminder.is_none());
        let snapshot = state.snapshot();
        assert_eq!(
            snapshot.reminder_remaining_seconds,
            Some(snapshot.settings.sedentary_seconds)
        );
        assert!(snapshot.next_reminder_at.is_some());
    }

    #[test]
    fn real_rest_during_break_avoids_notice() {
        let mut state = state();
        state.snapshot.monitoring_mode = MonitoringMode::Camera;
        state.snapshot.calibrated = true;
        state.snapshot.permission = PermissionState::Granted;
        state.snapshot.lifecycle = MonitoringLifecycle::Monitoring;
        state.start_break();
        let now = Instant::now();
        // 休息期间人物离座（有效休息充足）。
        state.snapshot.person_present = false;
        state.snapshot.behavior = BehaviorState::NoPerson;
        let total = state.snapshot.settings.break_minutes * 60;
        // 倒计时到 0 后不自动结束——保持 Break 生命周期。
        assert!(state.advance(total + 1, now).is_none());
        assert_eq!(state.snapshot.lifecycle, MonitoringLifecycle::Break);
        assert_eq!(state.snapshot.break_remaining_seconds, 0);
        // 手动确认结束时，真实休息充足，不产生提示。
        state.end_break();
        assert_eq!(state.snapshot.lifecycle, MonitoringLifecycle::Monitoring);
        assert_eq!(state.snapshot.break_rest_seconds, total + 1);
        let snapshot = state.snapshot();
        assert!(snapshot.next_reminder_at.is_none());
        assert_eq!(
            snapshot.reminder_remaining_seconds,
            Some(snapshot.settings.sedentary_seconds)
        );
    }

    #[test]
    fn camera_schedule_only_projects_a_clock_time_while_sitting_is_confirmed() {
        let mut state = state();
        state.snapshot.monitoring_mode = MonitoringMode::Camera;
        state.snapshot.calibrated = true;
        state.snapshot.permission = PermissionState::Granted;
        state.snapshot.lifecycle = MonitoringLifecycle::Monitoring;
        state.snapshot.person_present = true;
        state.snapshot.behavior = BehaviorState::Unknown;

        let waiting = state.snapshot();
        assert_eq!(
            waiting.reminder_remaining_seconds,
            Some(waiting.settings.sedentary_seconds)
        );
        assert!(waiting.next_reminder_at.is_none());

        state.snapshot.behavior = BehaviorState::SittingNormal;
        let running = state.snapshot();
        assert!(running.next_reminder_at.is_some());
    }
}
