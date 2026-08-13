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
