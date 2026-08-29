use super::*;

#[test]
fn persists_only_structured_statistics() {
    let database = Database::memory();
    let mut day = DailyStatistics::today();
    day.seated_seconds = 120;
    database.save_daily(&day).unwrap();
    let rows = database.statistics(1).unwrap();
    assert_eq!(rows[0].seated_seconds, 120);
}

#[test]
fn deletion_removes_events_and_statistics() {
    let database = Database::memory();
    let mut day = DailyStatistics::today();
    day.break_count = 2;
    database.save_daily(&day).unwrap();
    database
        .record_event("break", 120, Some("completed"))
        .unwrap();
    database.delete_statistics().unwrap();
    assert_eq!(database.statistics(1).unwrap()[0].break_count, 0);
}

#[test]
fn behavior_history_returns_structured_events_newest_first() {
    let database = Database::memory();
    database.record_event("away", 12, Some("returned")).unwrap();
    let events = database.behavior_history(7).unwrap();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].event_type, "away");
    assert_eq!(events[0].duration_seconds, 12);
    assert_eq!(events[0].action.as_deref(), Some("returned"));
}

#[test]
fn delete_event_removes_a_started_event() {
    let database = Database::memory();
    let event_id = database.start_event("break", Some("started")).unwrap();

    database.delete_event(&event_id).unwrap();

    assert!(database.behavior_history(1).unwrap().is_empty());
}

#[test]
fn reminder_followups_are_counted_from_behavior_events() {
    let database = Database::memory();
    database
        .record_event("reminder", 120, Some("dismissed"))
        .unwrap();
    database
        .record_event("reminder", 60, Some("snoozed"))
        .unwrap();

    assert_eq!(database.load_today().dismissed_count, 1);
    assert_eq!(database.load_today().snoozed_count, 1);
    assert_eq!(database.statistics(1).unwrap()[0].dismissed_count, 1);
    assert_eq!(database.statistics(1).unwrap()[0].snoozed_count, 1);
}

#[test]
fn stored_reminder_followup_count_wins_when_it_is_higher_than_events() {
    let database = Database::memory();
    let mut day = DailyStatistics::today();
    day.dismissed_count = 3;
    day.snoozed_count = 2;
    database.save_daily(&day).unwrap();
    database
        .record_event("reminder", 120, Some("dismissed"))
        .unwrap();
    database
        .record_event("reminder", 60, Some("snoozed"))
        .unwrap();

    assert_eq!(database.load_today().dismissed_count, 3);
    assert_eq!(database.load_today().snoozed_count, 2);
    assert_eq!(database.statistics(1).unwrap()[0].dismissed_count, 3);
    assert_eq!(database.statistics(1).unwrap()[0].snoozed_count, 2);
}

#[test]
fn behavior_history_for_date_returns_every_event_from_that_local_day() {
    let database = Database::memory();
    for _ in 0..7 {
        database
            .record_event("head_down", 60, Some("recovered"))
            .unwrap();
    }
    let today = chrono::Local::now().date_naive().to_string();
    let events = database.behavior_history_for_date(&today).unwrap();
    assert_eq!(events.len(), 7);
    assert!(database.behavior_history_for_date("not-a-date").is_err());
}

#[test]
fn persists_custom_sedentary_seconds() {
    let database = Database::memory();
    let settings = AppSettings {
        sedentary_seconds: 10,
        ..AppSettings::default()
    };
    database.save_settings(&settings).unwrap();
    assert_eq!(database.load_settings().sedentary_seconds, 10);
}

#[test]
fn load_settings_migrates_legacy_head_down_confirmation() {
    let database = Database::memory();
    let settings = AppSettings {
        head_down_confirmation_seconds: 3,
        ..AppSettings::default()
    };
    database.save_settings(&settings).unwrap();

    assert_eq!(
        database.load_settings().head_down_confirmation_seconds,
        crate::model::DEFAULT_HEAD_DOWN_CONFIRMATION_SECS
    );
}

#[test]
fn persists_runtime_preferences_as_one_consistent_snapshot() {
    let database = Database::memory();
    let settings = AppSettings {
        sound_enabled: true,
        meeting_mode: true,
        run_in_background: false,
        autostart: true,
        weekend_enabled: true,
        statistics_enabled: false,
        ..AppSettings::default()
    };

    database.save_settings(&settings).unwrap();

    assert_eq!(database.load_settings(), settings);
}
