use super::*;

#[test]
fn manual_launch_always_shows_the_main_window() {
    let args = vec!["cervical-guard".to_string()];
    assert!(should_show_main_window_for_launch(&args, true));
}

#[test]
fn autostart_launch_honors_the_silent_preference() {
    let args = vec![
        "cervical-guard".to_string(),
        AUTOSTART_BACKGROUND_ARG.to_string(),
    ];
    assert!(!should_show_main_window_for_launch(&args, true));
    assert!(should_show_main_window_for_launch(&args, false));
}

#[test]
fn short_head_down_history_segments_are_discarded() {
    let database = Database::memory();
    let started_at = chrono::Utc::now().to_rfc3339();
    let now = Instant::now();
    let mut pending = None;

    queue_head_down_event_segment(&database, &mut pending, &started_at, 45, now);
    flush_pending_head_down_event(&database, &mut pending, true, now);

    assert!(database.behavior_history(1).unwrap().is_empty());
}

#[test]
fn nearby_head_down_history_segments_are_merged_before_recording() {
    let database = Database::memory();
    let started_at = chrono::Utc::now().to_rfc3339();
    let now = Instant::now();
    let mut pending = None;

    queue_head_down_event_segment(&database, &mut pending, &started_at, 40, now);
    queue_head_down_event_segment(
        &database,
        &mut pending,
        &started_at,
        25,
        now + Duration::from_secs(10),
    );
    flush_pending_head_down_event(&database, &mut pending, true, now + Duration::from_secs(10));

    let events = database.behavior_history(1).unwrap();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].event_type, "head_down");
    assert_eq!(events[0].duration_seconds, 65);
}

#[test]
fn expired_head_down_history_gap_starts_a_new_segment() {
    let database = Database::memory();
    let started_at = chrono::Utc::now().to_rfc3339();
    let now = Instant::now();
    let mut pending = None;

    queue_head_down_event_segment(&database, &mut pending, &started_at, 40, now);
    queue_head_down_event_segment(
        &database,
        &mut pending,
        &started_at,
        25,
        now + Duration::from_secs(16),
    );
    flush_pending_head_down_event(&database, &mut pending, true, now + Duration::from_secs(16));

    assert!(database.behavior_history(1).unwrap().is_empty());
}
