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
