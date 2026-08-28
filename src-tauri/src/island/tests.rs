use crate::app_runtime::guard_protocol_response;
use crate::island::*;
use crate::messages::Language;
use crate::model::{AppSettings, MonitoringLifecycle};
use crate::sound::reminder_sound_enabled;
use crate::tray::{
    normalized_proxy, tray_icon_with_update_badge, tray_tooltip_text, tray_update_badge_visible,
    update_tray_text, UpdateUiState,
};

#[test]
fn updater_tray_reports_progress_and_keeps_the_process_alive() {
    let downloading = UpdateUiState {
        stage: "downloading".to_string(),
        version: Some("0.2.0".to_string()),
        progress: 37,
        ..UpdateUiState::default()
    };
    assert!(downloading.keeps_app_alive());
    assert_eq!(
        update_tray_text(
            Language::ZhCn,
            &downloading.stage,
            downloading.version.as_deref(),
            37
        ),
        "↓ 正在下载 v0.2.0 · 37%"
    );
    assert_eq!(
        update_tray_text(Language::EnUs, "latest", None, 0),
        "Check for updates (up to date)"
    );
    assert!(!UpdateUiState::default().keeps_app_alive());
}

#[test]
fn tray_tooltip_follows_current_language() {
    assert_eq!(
        tray_tooltip_text(Language::ZhCn, "idle", None, 0),
        "健康提醒 · 姿态与久坐"
    );
    assert_eq!(
        tray_tooltip_text(Language::EnUs, "idle", None, 0),
        "Health Reminder · Posture & Sitting"
    );
    assert_eq!(
        tray_tooltip_text(Language::ZhCn, "downloading", Some("0.2.0"), 37),
        "↓ 正在下载 v0.2.0 · 37%"
    );
}

#[test]
fn updater_badge_only_marks_a_known_available_update() {
    assert!(tray_update_badge_visible("available", Some("0.2.0")));
    assert!(tray_update_badge_visible("downloading", Some("0.2.0")));
    assert!(tray_update_badge_visible("error", Some("0.2.0")));
    assert!(!tray_update_badge_visible("latest", None));
    assert!(!tray_update_badge_visible("checking", None));
}

#[test]
fn updater_badge_paints_the_tray_icons_top_right_corner() {
    let base = tauri::image::Image::new_owned(vec![0; 32 * 32 * 4], 32, 32);
    let badged = tray_icon_with_update_badge(&base);
    assert_eq!((badged.width(), badged.height()), (32, 32));
    let green_pixels = badged
        .rgba()
        .chunks_exact(4)
        .filter(|pixel| pixel[0..4] == [48, 181, 91, 255])
        .count();
    assert!(green_pixels > 40);
    let center_offset = ((6 * 32 + 26) * 4) as usize;
    assert_eq!(
        &badged.rgba()[center_offset..center_offset + 4],
        &[48, 181, 91, 255]
    );
}

#[test]
fn updater_proxy_accepts_windows_host_port_notation() {
    assert_eq!(
        normalized_proxy("127.0.0.1:7890").as_deref(),
        Some("http://127.0.0.1:7890")
    );
    assert_eq!(normalized_proxy("socks5://127.0.0.1:1080"), None);
    assert_eq!(normalized_proxy("   "), None);
}

#[test]
fn reminder_island_is_served_inside_the_guard_protocol() {
    let response = guard_protocol_response("/reminder-island");
    assert_eq!(response.status(), tauri::http::StatusCode::OK);
    assert_eq!(
        response.headers()[tauri::http::header::CONTENT_TYPE],
        "text/html; charset=utf-8"
    );
    assert!(!response.body().is_empty());
    let html = std::str::from_utf8(response.body()).expect("灵动岛必须是 UTF-8 HTML");
    assert!(html.contains("island://break"));
    assert!(html.contains("data-command=\"end_break\""));
    assert!(html.contains("transitionVersion"));
    assert!(html.contains("await hide(true)"));
    assert!(html.contains("closeAnimationMs = 250"));
    assert!(html.contains("定时提醒运行中"));
}

#[test]
fn a_queued_status_snapshot_cannot_overwrite_break_or_reminder_content() {
    assert!(island_status_payload_is_current(
        MonitoringLifecycle::Degraded,
        MonitoringLifecycle::Degraded,
        false,
    ));
    assert!(!island_status_payload_is_current(
        MonitoringLifecycle::Degraded,
        MonitoringLifecycle::Break,
        false,
    ));
    assert!(!island_status_payload_is_current(
        MonitoringLifecycle::Monitoring,
        MonitoringLifecycle::Monitoring,
        true,
    ));
}

#[test]
fn only_the_three_reminder_buttons_capture_pointer_input() {
    assert!(island_action_hit(250.0, 38.0));
    assert!(island_action_hit(300.0, 38.0));
    assert!(island_action_hit(336.0, 38.0));
    assert!(!island_action_hit(120.0, 38.0));
    assert!(!island_action_hit(279.0, 38.0));
    assert!(!island_action_hit(250.0, 12.0));
}

#[test]
fn only_the_break_end_button_captures_pointer_input() {
    assert!(break_action_hit(300.0, 38.0));
    assert!(break_action_hit(345.0, 38.0));
    assert!(!break_action_hit(250.0, 38.0));
    assert!(!break_action_hit(300.0, 12.0));
}

#[test]
fn break_completion_restores_main_only_when_it_was_visible_before_break() {
    let mut ui = IslandUiState::default();

    ui.remember_main_visibility_for_break(true);
    assert!(ui.take_main_restore_after_break());
    assert!(!ui.take_main_restore_after_break());

    ui.remember_main_visibility_for_break(false);
    assert!(!ui.take_main_restore_after_break());
}

#[test]
fn reminder_action_requires_cursor_exit_before_hover_can_expand_again() {
    let mut ui = IslandUiState::default();
    ui.detail_expanded = true;
    ui.away_notice = true;
    ui.behavior_notice_until = Some(std::time::Instant::now() + std::time::Duration::from_secs(6));

    ui.suppress_hover_until_cursor_exit();

    assert!(!ui.detail_expanded);
    assert!(!ui.away_notice);
    assert!(!ui.behavior_notice_active());
    assert!(ui.consume_hover_suppression(true));
    assert!(ui.hover_suppressed_until_exit);

    // 首次离开只解除屏蔽，不在同一轮重新展开。
    assert!(ui.consume_hover_suppression(false));
    assert!(!ui.hover_suppressed_until_exit);

    // 后续再次进入时不再受上一轮按钮操作影响。
    assert!(!ui.consume_hover_suppression(true));
}

#[test]
fn persistent_status_cannot_resize_over_an_active_island_surface() {
    let mut ui = IslandUiState::default();
    assert!(!ui.blocks_persistent_status());

    ui.detail_expanded = true;
    assert!(ui.blocks_persistent_status());
    ui.detail_expanded = false;

    ui.away_notice = true;
    assert!(ui.blocks_persistent_status());
    ui.away_notice = false;

    ui.menu_open = true;
    assert!(ui.blocks_persistent_status());
}

#[test]
fn hover_polling_stays_idle_when_no_island_surface_is_enabled() {
    let mut settings = AppSettings::default();
    settings.island_persistent_status_enabled = false;
    settings.island_paused_status_enabled = false;
    assert!(!island_surface_needed(
        &settings, false, false, false, false, false, false, false
    ));

    settings.island_persistent_status_enabled = true;
    settings.island_paused_status_enabled = true;
    assert!(island_surface_needed(
        &settings, true, false, false, false, false, false, false
    ));
    assert!(island_surface_needed(
        &settings, true, false, false, false, false, false, false
    ));
    assert!(!island_surface_needed(
        &settings, false, false, false, false, false, false, false
    ));

    settings.island_enabled = false;
    assert!(!island_surface_needed(
        &settings, true, true, true, true, true, true, false
    ));
}

#[test]
fn external_fullscreen_blocks_island_unless_enabled() {
    assert!(!island_content_allowed_for_state(true, false, false, true));
    assert!(island_content_allowed_for_state(true, false, true, true));
    assert!(island_content_allowed_for_state(true, false, false, false));
    assert!(!island_content_allowed_for_state(false, false, true, false));
    assert!(island_content_allowed_for_state(false, true, true, false));
}

#[test]
fn status_switches_control_monitoring_and_paused_lifecycles_independently() {
    let mut settings = AppSettings::default();
    assert!(!island_status_enabled(
        &settings,
        MonitoringLifecycle::Monitoring
    ));
    assert!(island_status_enabled(
        &settings,
        MonitoringLifecycle::Paused
    ));

    settings.island_persistent_status_enabled = true;
    settings.island_paused_status_enabled = false;
    assert!(island_status_enabled(
        &settings,
        MonitoringLifecycle::Monitoring
    ));
    assert!(island_status_enabled(
        &settings,
        MonitoringLifecycle::Degraded
    ));
    assert!(!island_status_enabled(
        &settings,
        MonitoringLifecycle::Paused
    ));
    assert!(!island_status_enabled(
        &settings,
        MonitoringLifecycle::Break
    ));
}

#[test]
fn disabling_persistent_status_keeps_monitoring_hover_available() {
    let mut settings = AppSettings::default();
    settings.island_enabled = true;
    settings.island_persistent_status_enabled = false;

    assert!(!island_status_enabled(
        &settings,
        MonitoringLifecycle::Monitoring
    ));
    assert!(island_hover_status_enabled(
        &settings,
        MonitoringLifecycle::Monitoring
    ));
    assert!(island_hover_status_enabled(
        &settings,
        MonitoringLifecycle::Degraded
    ));
    assert!(!island_hover_status_enabled(
        &settings,
        MonitoringLifecycle::Paused
    ));

    settings.island_enabled = false;
    assert!(!island_hover_status_enabled(
        &settings,
        MonitoringLifecycle::Monitoring
    ));
}

#[test]
fn restored_pause_waits_for_a_user_pause_before_showing_status() {
    let settings = AppSettings::default();
    let mut ui = IslandUiState::default();

    assert!(!ui.status_enabled(&settings, MonitoringLifecycle::Paused));
    ui.request_pause_status();
    assert!(ui.status_enabled(&settings, MonitoringLifecycle::Paused));
    ui.clear_pause_status_request();
    assert!(!ui.status_enabled(&settings, MonitoringLifecycle::Paused));
}

#[test]
fn closing_menu_restores_the_surface_that_was_underneath() {
    assert_eq!(island_height_for_menu(true, true), ISLAND_MENU_HEIGHT);
    assert_eq!(island_height_for_menu(false, true), ISLAND_DETAIL_HEIGHT);
    assert_eq!(island_height_for_menu(false, false), ISLAND_COMPACT_HEIGHT);
}

#[test]
fn away_notice_closes_as_soon_as_a_stable_return_is_confirmed() {
    let mut ui = IslandUiState::default();
    ui.away_notice = true;

    assert!(!ui.confirm_return_after_away(false));
    assert!(ui.away_notice);
    assert!(ui.confirm_return_after_away(true));
    assert!(!ui.away_notice);
}

#[test]
fn meeting_mode_keeps_notifications_silent() {
    let mut settings = AppSettings::default();
    assert!(!reminder_sound_enabled(&settings));

    settings.sound_enabled = true;
    assert!(reminder_sound_enabled(&settings));

    settings.meeting_mode = true;
    assert!(!reminder_sound_enabled(&settings));
}
