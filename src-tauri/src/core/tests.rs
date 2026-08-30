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

fn camera_state() -> RuntimeState {
    let mut state = state();
    state.snapshot.monitoring_mode = MonitoringMode::Camera;
    state.snapshot.lifecycle = MonitoringLifecycle::Monitoring;
    state.snapshot.person_present = true;
    state.snapshot.behavior = BehaviorState::SittingNormal;
    state
}

fn observation(posture: PostureState, down_score: f64) -> VisionObservation {
    VisionObservation {
        schema_version: SCHEMA_VERSION,
        sequence: 1,
        captured_at_monotonic_ms: 100.0,
        person: PersonObservation {
            present: true,
            uncertain: false,
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
fn disabling_head_detection_clears_state_and_blocks_future_triggers() {
    let mut state = state();
    state.snapshot.monitoring_mode = MonitoringMode::Camera;
    state.snapshot.lifecycle = MonitoringLifecycle::Monitoring;
    state.snapshot.person_present = true;
    state.snapshot.behavior = BehaviorState::HeadDown;
    state.snapshot.head_down_seconds = state.snapshot.settings.head_down_minutes * 60;

    let mut settings = state.snapshot.settings.clone();
    settings.camera_enabled = true;
    settings.island_head_down_enabled = false;
    state.update_settings(settings).unwrap();
    state.head_candidate_since = Some(Instant::now() - Duration::from_secs(10));
    let reminder = state
        .ingest(observation(PostureState::Sitting, 1.0))
        .unwrap();

    assert!(reminder.is_none());
    assert_eq!(state.snapshot.behavior, BehaviorState::SittingNormal);
    assert_eq!(state.snapshot.head_down_seconds, 0);
    assert!(state.head_candidate_since.is_none());
}

#[test]
fn head_down_confirmation_uses_the_detection_tab_setting() {
    let mut state = camera_state();
    state.snapshot.settings.head_down_confirmation_seconds = 5;
    state.head_candidate_since = Some(Instant::now() - Duration::from_secs(5));

    state
        .ingest(observation(PostureState::Sitting, 1.0))
        .unwrap();

    assert_eq!(state.snapshot.behavior, BehaviorState::HeadDown);
}

#[test]
fn default_head_down_confirmation_ignores_brief_movements() {
    let mut state = camera_state();
    state.head_candidate_since = Some(Instant::now() - Duration::from_secs(14));

    state
        .ingest(observation(PostureState::Sitting, 1.0))
        .unwrap();

    assert_eq!(state.snapshot.behavior, BehaviorState::SittingNormal);
}

#[test]
fn head_down_statistics_ignore_short_segments() {
    let mut state = camera_state();
    let now = Instant::now();
    state.start_head_down_segment(now);

    state.advance(59, now + Duration::from_secs(59));
    state.snapshot.behavior = BehaviorState::SittingNormal;
    state.stop_head_down_segment(now + Duration::from_secs(59));

    assert_eq!(state.snapshot.head_down_seconds, 0);
    assert_eq!(state.snapshot.today.head_down_seconds, 0);
}

#[test]
fn head_down_statistics_backfill_after_minimum_duration() {
    let mut state = camera_state();
    let now = Instant::now();
    state.start_head_down_segment(now);

    state.advance(59, now + Duration::from_secs(59));
    assert_eq!(state.snapshot.today.head_down_seconds, 0);

    state.advance(1, now + Duration::from_secs(60));
    assert_eq!(state.snapshot.today.head_down_seconds, 60);

    state.advance(5, now + Duration::from_secs(65));
    assert_eq!(state.snapshot.today.head_down_seconds, 65);
}

#[test]
fn head_down_statistics_merge_short_recovery_gaps() {
    let mut state = camera_state();
    let now = Instant::now();
    state.start_head_down_segment(now);
    state.advance(40, now + Duration::from_secs(40));

    state.snapshot.behavior = BehaviorState::SittingNormal;
    state.stop_head_down_segment(now + Duration::from_secs(40));
    state.advance(10, now + Duration::from_secs(50));

    state.start_head_down_segment(now + Duration::from_secs(50));
    state.advance(20, now + Duration::from_secs(70));

    assert_eq!(state.snapshot.today.head_down_seconds, 60);
}

#[test]
fn head_down_statistics_split_after_recovery_gap_expires() {
    let mut state = camera_state();
    let now = Instant::now();
    state.start_head_down_segment(now);
    state.advance(40, now + Duration::from_secs(40));

    state.snapshot.behavior = BehaviorState::SittingNormal;
    state.stop_head_down_segment(now + Duration::from_secs(40));
    state.advance(16, now + Duration::from_secs(56));

    state.start_head_down_segment(now + Duration::from_secs(56));
    state.advance(20, now + Duration::from_secs(76));

    assert_eq!(state.snapshot.today.head_down_seconds, 0);
}

#[test]
fn head_down_entry_requires_continuous_strong_evidence() {
    let mut state = state();
    state.snapshot.monitoring_mode = MonitoringMode::Camera;
    state.snapshot.lifecycle = MonitoringLifecycle::Monitoring;
    state.snapshot.person_present = true;
    state.snapshot.behavior = BehaviorState::SittingNormal;
    let enter = state.snapshot.settings.head_down_enter_score();
    state.head_candidate_since = Some(Instant::now() - Duration::from_secs(10));

    state
        .ingest(observation(PostureState::Sitting, enter - 0.05))
        .unwrap();

    assert_eq!(state.snapshot.behavior, BehaviorState::SittingNormal);
    assert!(state.head_candidate_since.is_none());
}

#[test]
fn head_down_sensitivity_uses_conservative_entry_thresholds() {
    let mut settings = AppSettings::default();
    settings.sensitivity = "high".into();
    assert_eq!(settings.head_down_enter_score(), 0.64);
    settings.sensitivity = "balanced".into();
    assert_eq!(settings.head_down_enter_score(), 0.74);
    settings.sensitivity = "low".into();
    assert_eq!(settings.head_down_enter_score(), 0.82);
}

#[test]
fn short_keypoint_loss_keeps_clock_running_without_publishing_away() {
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
    assert!(state.sedentary_clock_running());
    state.advance(5, Instant::now() + Duration::from_secs(5));
    assert_eq!(state.snapshot.seated_seconds, 35);
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
            - state
                .person_absence_confirmation()
                .saturating_sub(Duration::from_secs(1)),
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
fn partial_head_evidence_never_accumulates_into_away() {
    let mut state = state();
    state.snapshot.monitoring_mode = MonitoringMode::Camera;
    state.snapshot.lifecycle = MonitoringLifecycle::Monitoring;
    state.snapshot.person_present = true;
    state.snapshot.behavior = BehaviorState::SittingNormal;
    state.snapshot.seated_seconds = 30;
    state.person_missing_since =
        Some(Instant::now() - state.person_absence_confirmation() - Duration::from_secs(1));

    let mut partial = observation(PostureState::Unknown, 0.0);
    partial.person.present = false;
    partial.person.uncertain = true;
    partial.person.confidence = 0.2;
    partial.posture.confidence = 0.0;
    partial.head.confidence = 0.0;
    partial.frame_quality = FrameQuality::Unstable;
    state.ingest(partial).unwrap();

    assert!(state.snapshot.person_present);
    assert_eq!(state.snapshot.behavior, BehaviorState::SittingNormal);
    assert_eq!(state.snapshot.today.away_count, 0);
    assert!(state.sedentary_clock_running());
    assert!(state.person_missing_since.is_none());
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
        Some(Instant::now() - state.person_absence_confirmation() - Duration::from_secs(1));

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
    assert!(!state.sedentary_clock_running());

    state.ingest(missing).unwrap();
    assert_eq!(state.snapshot.today.away_count, 1);
}

#[test]
fn absence_confirmation_follows_detection_sensitivity() {
    let mut state = state();
    state.snapshot.settings.sensitivity = "high".into();
    assert_eq!(state.person_absence_confirmation(), Duration::from_secs(2));
    state.snapshot.settings.sensitivity = "balanced".into();
    assert_eq!(state.person_absence_confirmation(), Duration::from_secs(3));
    state.snapshot.settings.sensitivity = "low".into();
    assert_eq!(state.person_absence_confirmation(), Duration::from_secs(5));
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
fn timer_onboarding_and_camera_calibration_keep_the_camera_preference_consistent() {
    let mut state = state();
    assert_eq!(state.snapshot.monitoring_mode, MonitoringMode::Timer);
    assert!(!state.snapshot.settings.camera_enabled);

    state.start_calibration();
    state
        .save_calibration(CalibrationResult {
            baseline: 0.64,
            camera_id: "default".into(),
        })
        .unwrap();

    assert_eq!(state.snapshot.monitoring_mode, MonitoringMode::Camera);
    assert_eq!(state.snapshot.lifecycle, MonitoringLifecycle::Monitoring);
    assert!(state.snapshot.settings.camera_enabled);
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
            ..PersistedMeta::default()
        })
        .unwrap();

    let state = RuntimeState::load(&database);

    assert!(state.snapshot.calibrated);
    assert_eq!(state.snapshot.calibration_baseline, Some(0.64));
    assert_eq!(state.snapshot.lifecycle, MonitoringLifecycle::Paused);
}

#[test]
fn load_restores_same_day_continuous_session_and_last_detection() {
    let database = Database::memory();
    let today = Local::now().date_naive().to_string();
    database
        .save_meta(&PersistedMeta {
            onboarded: true,
            monitoring_mode: Some(MonitoringMode::Timer),
            current_local_date: Some(today),
            current_seated_seconds: 40 * 60,
            current_head_down_seconds: 3 * 60,
            current_away_seconds: 2 * 60,
            session_started_at: Some("2026-08-26T00:26:00Z".into()),
            last_detection_at: Some("2026-08-26T01:06:00Z".into()),
            ..PersistedMeta::default()
        })
        .unwrap();

    let state = RuntimeState::load(&database);

    assert_eq!(state.snapshot.seated_seconds, 40 * 60);
    assert_eq!(state.snapshot.head_down_seconds, 3 * 60);
    assert_eq!(state.snapshot.away_seconds, 2 * 60);
    assert_eq!(
        state.snapshot.session_started_at.as_deref(),
        Some("2026-08-26T00:26:00Z")
    );
    assert_eq!(
        state.snapshot.last_detection_at.as_deref(),
        Some("2026-08-26T01:06:00Z")
    );
}

#[test]
fn load_drops_stale_continuous_session_but_keeps_last_detection() {
    let database = Database::memory();
    database
        .save_meta(&PersistedMeta {
            onboarded: true,
            monitoring_mode: Some(MonitoringMode::Timer),
            current_local_date: Some("2000-01-01".into()),
            current_seated_seconds: 40 * 60,
            session_started_at: Some("2000-01-01T00:00:00Z".into()),
            last_detection_at: Some("2000-01-01T00:40:00Z".into()),
            ..PersistedMeta::default()
        })
        .unwrap();

    let state = RuntimeState::load(&database);

    assert_eq!(state.snapshot.seated_seconds, 0);
    assert!(state.snapshot.session_started_at.is_none());
    assert_eq!(
        state.snapshot.last_detection_at.as_deref(),
        Some("2000-01-01T00:40:00Z")
    );
}

#[test]
fn date_rollover_resets_current_session_counters() {
    let mut state = state();
    state.snapshot.today.local_date = "2000-01-01".into();
    state.snapshot.seated_seconds = 40 * 60;
    state.snapshot.head_down_seconds = 3 * 60;
    state.snapshot.away_seconds = 2 * 60;

    state.roll_date_if_needed();

    assert_eq!(
        state.snapshot.today.local_date,
        Local::now().date_naive().to_string()
    );
    assert_eq!(state.snapshot.seated_seconds, 0);
    assert_eq!(state.snapshot.head_down_seconds, 0);
    assert_eq!(state.snapshot.away_seconds, 0);
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
    assert_eq!(state.snapshot.today.dismissed_count, 1);
    assert!(state.advance(9, now + Duration::from_secs(9)).is_none());
    assert!(state.advance(1, now + Duration::from_secs(10)).is_some());
    assert_eq!(state.snapshot.today.reminder_count, 2);
}

#[test]
fn snoozed_and_dismissed_reminders_are_counted_separately() {
    let mut state = state();
    state.snapshot.current_reminder = Some(ReminderPayload {
        id: "snooze".into(),
        kind: ReminderKind::Sedentary,
        level: ReminderLevel::Noticeable,
        title: "提醒".into(),
        message: "起身活动".into(),
        duration_seconds: 60,
        triggered_at: Utc::now().to_rfc3339(),
    });
    state.snooze(10);
    assert_eq!(state.snapshot.today.snoozed_count, 1);
    assert_eq!(state.snapshot.today.dismissed_count, 0);

    state.snapshot.current_reminder = Some(ReminderPayload {
        id: "dismiss".into(),
        kind: ReminderKind::Sedentary,
        level: ReminderLevel::Noticeable,
        title: "提醒".into(),
        message: "起身活动".into(),
        duration_seconds: 60,
        triggered_at: Utc::now().to_rfc3339(),
    });
    state.dismiss();
    assert_eq!(state.snapshot.today.snoozed_count, 1);
    assert_eq!(state.snapshot.today.dismissed_count, 1);
    assert_eq!(state.snapshot.today.deferred_reminder_count(), 2);
}

#[test]
fn snoozed_sedentary_reminder_retriggers_even_when_repeat_is_disabled() {
    let mut state = state();
    state.snapshot.settings.sedentary_seconds = 60;
    state.snapshot.settings.repeat_reminders = false;
    let now = Instant::now();

    assert!(state.advance(60, now).is_some());
    state.snooze(1);
    assert_eq!(
        state.snapshot().sedentary_reminder_state,
        SedentaryReminderState::Snoozed
    );
    assert!(state.advance(59, now + Duration::from_secs(59)).is_none());

    let reminder = state.advance(1, Instant::now() + Duration::from_secs(61));

    assert!(matches!(
        reminder.map(|item| item.kind),
        Some(ReminderKind::Sedentary)
    ));
    assert_eq!(state.snapshot.today.reminder_count, 2);
}

#[test]
fn dismissed_sedentary_reminder_keeps_the_session_overdue() {
    let mut state = state();
    state.snapshot.settings.sedentary_seconds = 60;
    let now = Instant::now();

    assert!(state.advance(60, now).is_some());
    state.dismiss();
    let snapshot = state.snapshot();

    assert_eq!(snapshot.seated_seconds, 60);
    assert_eq!(
        snapshot.sedentary_reminder_state,
        SedentaryReminderState::Dismissed
    );
}

#[test]
fn pausing_an_overdue_session_marks_the_debt_without_resetting_it() {
    let mut state = state();
    state.snapshot.settings.sedentary_seconds = 60;
    state.snapshot.seated_seconds = 120;

    state.pause(None);
    let snapshot = state.snapshot();

    assert_eq!(snapshot.seated_seconds, 120);
    assert_eq!(
        snapshot.sedentary_reminder_state,
        SedentaryReminderState::PausedOverdue
    );
}

#[test]
fn completing_a_break_clears_snoozed_sedentary_delivery_state() {
    let mut state = state();
    state.snapshot.settings.sedentary_seconds = 60;
    let now = Instant::now();

    assert!(state.advance(60, now).is_some());
    state.snooze(1);
    state.start_break();
    state.advance(MIN_RECORDED_BREAK_SECS, now + Duration::from_secs(60));
    state.end_break();
    let snapshot = state.snapshot();

    assert_eq!(snapshot.seated_seconds, 0);
    assert_eq!(
        snapshot.sedentary_reminder_state,
        SedentaryReminderState::Counting
    );
    assert_eq!(snapshot.reminder_remaining_seconds, Some(60));
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
    assert_eq!(state.snapshot.break_rest_seconds, total + 1);
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
    // 主动休息期间不再用摄像头确认离座，休息时长只看用户主动休息多久。
    state.snapshot.person_present = true;
    state.snapshot.behavior = BehaviorState::SittingNormal;
    let total = state.snapshot.settings.break_minutes * 60;
    // 倒计时到 0 后不自动结束——保持 Break 生命周期。
    assert!(state.advance(total + 1, now).is_none());
    assert_eq!(state.snapshot.lifecycle, MonitoringLifecycle::Break);
    assert_eq!(state.snapshot.break_remaining_seconds, 0);
    // 手动确认后保留休息前最后一个姿态，立即开始新一轮倒计时。
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
    // 休息期间人物离座状态不会影响主动休息时长的统计。
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
fn short_manual_break_is_not_counted_or_used_to_reset_sitting_time() {
    let mut state = state();
    state.snapshot.seated_seconds = 120;
    state.snapshot.head_down_seconds = 30;
    state.start_break();
    let now = Instant::now();

    state.advance(MIN_RECORDED_BREAK_SECS - 1, now);
    state.end_break();

    assert_eq!(state.snapshot.lifecycle, MonitoringLifecycle::Degraded);
    assert_eq!(state.snapshot.today.break_count, 0);
    assert_eq!(state.snapshot.seated_seconds, 120);
    assert_eq!(state.snapshot.head_down_seconds, 30);
    assert_eq!(state.snapshot.break_rest_seconds, 0);
}

#[test]
fn camera_observations_are_ignored_during_manual_breaks() {
    let mut state = camera_state();
    state.start_break();
    state.snapshot.person_present = true;
    state.snapshot.behavior = BehaviorState::SittingNormal;
    let mut item = observation(PostureState::Sitting, 1.0);
    item.person.present = false;
    item.person.confidence = 0.0;
    item.frame_quality = FrameQuality::Dark;

    let reminder = state.ingest(item).unwrap();

    assert!(reminder.is_none());
    assert_eq!(state.snapshot.lifecycle, MonitoringLifecycle::Break);
    assert!(state.snapshot.person_present);
    assert_eq!(state.snapshot.behavior, BehaviorState::SittingNormal);
    assert_eq!(state.snapshot.frame_quality, FrameQuality::Unstable);
    assert!(state.snapshot.last_observation_at.is_none());
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
