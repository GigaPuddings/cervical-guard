use super::*;

#[test]
fn short_test_threshold_bypasses_quiet_hours() {
    let mut settings = AppSettings::default();
    settings.sedentary_seconds = 10;
    assert!(settings.reminders_allowed_at(Weekday::Wed, 12 * 60 + 3));
}

#[test]
fn normal_threshold_still_honors_quiet_hours() {
    let settings = AppSettings::default();
    assert!(!settings.reminders_allowed_at(Weekday::Wed, 12 * 60 + 3));
    assert!(settings.reminders_allowed_at(Weekday::Wed, 11 * 60 + 59));
}

#[test]
fn disabling_quiet_hours_preserves_times_but_allows_reminders() {
    let mut settings = AppSettings::default();
    settings.quiet_hours_enabled = false;
    assert!(settings.reminders_allowed_at(Weekday::Wed, 12 * 60 + 3));
    assert_eq!(settings.quiet_start, "12:00");
    assert_eq!(settings.quiet_end, "13:00");
}

#[test]
fn legacy_settings_enable_quiet_hours_during_migration() {
    let mut json = serde_json::to_value(AppSettings::default()).unwrap();
    json.as_object_mut().unwrap().remove("quietHoursEnabled");
    let settings: AppSettings = serde_json::from_value(json).unwrap();
    assert!(settings.quiet_hours_enabled);
}

#[test]
fn legacy_settings_enable_new_island_interactions_during_migration() {
    let mut json = serde_json::to_value(AppSettings::default()).unwrap();
    let object = json.as_object_mut().unwrap();
    object.remove("islandPausedStatusEnabled");
    object.remove("islandPeekThroughEnabled");
    let settings: AppSettings = serde_json::from_value(json).unwrap();
    assert!(settings.island_paused_status_enabled);
    assert!(settings.island_peek_through_enabled);
}

#[test]
fn legacy_settings_enable_silent_autostart_during_migration() {
    let mut json = serde_json::to_value(AppSettings::default()).unwrap();
    json.as_object_mut().unwrap().remove("silentAutostart");
    let settings: AppSettings = serde_json::from_value(json).unwrap();
    assert!(settings.silent_autostart);
}

#[test]
fn legacy_meta_defaults_new_session_fields_during_migration() {
    let meta: PersistedMeta = serde_json::from_value(serde_json::json!({
        "onboarded": true,
        "calibrated": false
    }))
    .unwrap();

    assert!(meta.onboarded);
    assert_eq!(meta.current_seated_seconds, 0);
    assert_eq!(meta.current_head_down_seconds, 0);
    assert_eq!(meta.current_away_seconds, 0);
    assert_eq!(meta.session_started_at, None);
    assert_eq!(meta.last_detection_at, None);
}
