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
