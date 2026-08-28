use super::*;

#[derive(Clone)]
pub(crate) struct UpdateUiState {
    pub(crate) stage: String,
    pub(crate) version: Option<String>,
    pub(crate) progress: u8,
}

impl Default for UpdateUiState {
    fn default() -> Self {
        Self {
            stage: "idle".to_string(),
            version: None,
            progress: 0,
        }
    }
}

impl UpdateUiState {
    pub(crate) fn keeps_app_alive(&self) -> bool {
        matches!(self.stage.as_str(), "downloading" | "restarting")
    }
}

pub(crate) fn normalized_proxy(value: &str) -> Option<String> {
    let candidate = value.trim();
    if candidate.is_empty() {
        return None;
    }
    if candidate.starts_with("http://") || candidate.starts_with("https://") {
        Some(candidate.to_string())
    } else if candidate.contains("://") {
        // The updater's current reqwest build does not include SOCKS support.
        // Ignoring an unsupported scheme lets TUN routing or direct access work
        // instead of turning every update check into an invalid-proxy error.
        None
    } else {
        Some(format!("http://{candidate}"))
    }
}

pub(crate) fn proxy_from_environment() -> Option<String> {
    ["HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy"]
        .into_iter()
        .find_map(|name| {
            std::env::var(name)
                .ok()
                .and_then(|value| normalized_proxy(&value))
        })
}

#[cfg(target_os = "windows")]
pub(crate) fn proxy_from_system() -> Option<String> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let internet_settings = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings")
        .ok()?;
    let enabled = internet_settings
        .get_value::<u32, _>("ProxyEnable")
        .unwrap_or(0)
        != 0;
    if !enabled {
        return None;
    }
    let server = internet_settings
        .get_value::<String, _>("ProxyServer")
        .ok()?;
    // Windows accepts either a single host:port or a protocol map such as
    // `http=127.0.0.1:7890;https=127.0.0.1:7890`. Updates are always HTTPS.
    let selected = if server.contains('=') {
        let entries: Vec<_> = server
            .split(';')
            .filter_map(|entry| entry.split_once('='))
            .collect();
        entries
            .iter()
            .find(|(scheme, _)| scheme.trim().eq_ignore_ascii_case("https"))
            .or_else(|| {
                entries
                    .iter()
                    .find(|(scheme, _)| scheme.trim().eq_ignore_ascii_case("http"))
            })
            .map(|(_, address)| address.trim())?
    } else {
        server.trim()
    };
    normalized_proxy(selected)
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn proxy_from_system() -> Option<String> {
    None
}

#[tauri::command]
pub(crate) fn get_update_proxy() -> Option<String> {
    proxy_from_environment().or_else(proxy_from_system)
}

pub(crate) fn tray_menu(
    app: &AppHandle,
    update_stage: &str,
    update_version: Option<&str>,
    update_progress: u8,
    language: Language,
    lifecycle: MonitoringLifecycle,
) -> tauri::Result<Menu<tauri::Wry>> {
    let monitoring_active = matches!(
        lifecycle,
        MonitoringLifecycle::Monitoring | MonitoringLifecycle::Degraded
    );
    let pause_action_enabled = monitoring_active || lifecycle == MonitoringLifecycle::Paused;
    let status = MenuItem::with_id(
        app,
        "monitoring-status",
        match lifecycle {
            MonitoringLifecycle::Monitoring | MonitoringLifecycle::Degraded => {
                msg::TRAY_STATUS_MONITORING.get(language)
            }
            MonitoringLifecycle::Paused => msg::TRAY_STATUS_PAUSED.get(language),
            MonitoringLifecycle::Break => msg::TRAY_STATUS_BREAK.get(language),
            MonitoringLifecycle::Initializing => msg::TRAY_STATUS_INITIALIZING.get(language),
            MonitoringLifecycle::Calibrating => msg::TRAY_STATUS_CALIBRATING.get(language),
            MonitoringLifecycle::Unavailable => msg::TRAY_STATUS_UNAVAILABLE.get(language),
        },
        false,
        None::<&str>,
    )?;
    let separator_after_status = PredefinedMenuItem::separator(app)?;
    let show = MenuItem::with_id(
        app,
        "show",
        msg::TRAY_SHOW_MAIN_WINDOW.get(language),
        true,
        None::<&str>,
    )?;
    let pause = MenuItem::with_id(
        app,
        "pause",
        match lifecycle {
            MonitoringLifecycle::Monitoring | MonitoringLifecycle::Degraded => {
                msg::TRAY_PAUSE_MONITORING.get(language)
            }
            MonitoringLifecycle::Paused => msg::TRAY_RESUME_MONITORING.get(language),
            MonitoringLifecycle::Break => msg::TRAY_BREAK_HINT.get(language),
            _ => msg::TRAY_CONTROLS_UNAVAILABLE.get(language),
        },
        pause_action_enabled,
        None::<&str>,
    )?;
    let separator_before_update = PredefinedMenuItem::separator(app)?;
    let update_text = update_tray_text(language, update_stage, update_version, update_progress);
    let update = MenuItem::with_id(app, "update", update_text, true, None::<&str>)?;
    let separator_before_quit = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(
        app,
        "quit",
        msg::TRAY_QUIT.get(language),
        !matches!(update_stage, "downloading" | "restarting"),
        None::<&str>,
    )?;
    Menu::with_items(
        app,
        &[
            &status,
            &separator_after_status,
            &show,
            &pause,
            &separator_before_update,
            &update,
            &separator_before_quit,
            &quit,
        ],
    )
}

pub(crate) fn update_tray_text(
    language: Language,
    stage: &str,
    version: Option<&str>,
    progress: u8,
) -> String {
    let progress = progress.min(100).to_string();
    match (stage, version) {
        ("checking", _) => msg::TRAY_UPDATE_CHECKING.get(language).to_string(),
        ("downloading", Some(version)) => msg::TRAY_UPDATE_DOWNLOADING.format(
            language,
            &[("version", version), ("progress", progress.as_str())],
        ),
        ("downloading", None) => msg::TRAY_UPDATE_DOWNLOADING_NO_VERSION
            .format(language, &[("progress", progress.as_str())]),
        ("restarting", _) => msg::TRAY_UPDATE_RESTARTING.get(language).to_string(),
        ("error", _) => msg::TRAY_UPDATE_ERROR.get(language).to_string(),
        ("latest", _) => msg::TRAY_UPDATE_LATEST.get(language).to_string(),
        (_, Some(version)) => msg::TRAY_UPDATE_VIEW.format(language, &[("version", version)]),
        (_, None) => msg::TRAY_UPDATE_CHECK.get(language).to_string(),
    }
}

pub(crate) fn tray_tooltip_text(
    language: Language,
    stage: &str,
    version: Option<&str>,
    progress: u8,
) -> String {
    if matches!(stage, "idle" | "latest") {
        msg::TRAY_TOOLTIP.get(language).to_string()
    } else {
        update_tray_text(language, stage, version, progress)
    }
}

pub(crate) fn tray_update_badge_visible(stage: &str, version: Option<&str>) -> bool {
    version.is_some() && matches!(stage, "available" | "downloading" | "error")
}

pub(crate) fn tray_icon_with_update_badge(
    base: &tauri::image::Image<'_>,
) -> tauri::image::Image<'static> {
    let width = base.width();
    let height = base.height();
    let mut rgba = base.rgba().to_vec();
    let shortest = width.min(height);
    if shortest < 4 || rgba.len() != (width * height * 4) as usize {
        return tauri::image::Image::new_owned(rgba, width, height);
    }

    let badge_radius = (shortest / 6).max(2);
    let border = (shortest / 32).max(1);
    let center_x = width.saturating_sub(badge_radius + border);
    let center_y = badge_radius + border;
    let mut paint_circle = |radius: u32, color: [u8; 4]| {
        let radius_squared = i64::from(radius) * i64::from(radius);
        let left = center_x.saturating_sub(radius);
        let top = center_y.saturating_sub(radius);
        let right = (center_x + radius).min(width.saturating_sub(1));
        let bottom = (center_y + radius).min(height.saturating_sub(1));
        for y in top..=bottom {
            for x in left..=right {
                let dx = i64::from(x) - i64::from(center_x);
                let dy = i64::from(y) - i64::from(center_y);
                if dx * dx + dy * dy <= radius_squared {
                    let offset = ((y * width + x) * 4) as usize;
                    rgba[offset..offset + 4].copy_from_slice(&color);
                }
            }
        }
    };
    paint_circle(badge_radius + border, [244, 247, 242, 255]);
    paint_circle(badge_radius, [48, 181, 91, 255]);
    tauri::image::Image::new_owned(rgba, width, height)
}

pub(crate) fn set_tray_update_badge(app: &AppHandle, visible: bool) -> Result<(), String> {
    let language = current_language(app);
    let tray = app
        .tray_by_id(MAIN_TRAY_ID)
        .ok_or_else(|| msg::ERR_TRAY_NOT_READY.get(language).to_string())?;
    let Some(base) = app.default_window_icon() else {
        return Ok(());
    };
    let icon = if visible {
        tray_icon_with_update_badge(base)
    } else {
        base.clone()
    };
    tray.set_icon(Some(icon)).map_err(|error| error.to_string())
}

pub(crate) fn rebuild_tray_menu(app: &AppHandle) -> Result<(), String> {
    let fallback_language = current_language(app);
    let context = app.try_state::<AppContext>().ok_or_else(|| {
        msg::ERR_APP_STATE_NOT_READY
            .get(fallback_language)
            .to_string()
    })?;
    let update = context
        .update_ui
        .lock()
        .map_err(|_| {
            msg::ERR_UPDATE_STATE_LOCK
                .get(fallback_language)
                .to_string()
        })?
        .clone();
    let (language, lifecycle) = {
        let mut core = context
            .core
            .lock()
            .map_err(|_| msg::ERR_STATE_LOCK.get(fallback_language).to_string())?;
        let snapshot = core.snapshot();
        (
            Language::of_settings(&snapshot.settings),
            snapshot.lifecycle,
        )
    };
    let menu = tray_menu(
        app,
        &update.stage,
        update.version.as_deref(),
        update.progress,
        language,
        lifecycle,
    )
    .map_err(|error| error.to_string())?;
    app.tray_by_id(MAIN_TRAY_ID)
        .ok_or_else(|| msg::ERR_TRAY_NOT_READY.get(language).to_string())?
        .set_menu(Some(menu))
        .map_err(|error| error.to_string())
}

pub(crate) fn refresh_tray_labels(app: &AppHandle) -> Result<(), String> {
    let language = current_language(app);
    let context = app
        .try_state::<AppContext>()
        .ok_or_else(|| msg::ERR_APP_STATE_NOT_READY.get(language).to_string())?;
    let update = context
        .update_ui
        .lock()
        .map_err(|_| msg::ERR_UPDATE_STATE_LOCK.get(language).to_string())?
        .clone();
    rebuild_tray_menu(app)?;
    app.tray_by_id(MAIN_TRAY_ID)
        .ok_or_else(|| msg::ERR_TRAY_NOT_READY.get(language).to_string())?
        .set_tooltip(Some(tray_tooltip_text(
            language,
            &update.stage,
            update.version.as_deref(),
            update.progress,
        )))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn set_update_tray_status(
    app: AppHandle,
    stage: String,
    version: Option<String>,
    progress: u8,
) -> Result<(), String> {
    if let Some(context) = app.try_state::<AppContext>() {
        if let Ok(mut update_ui) = context.update_ui.lock() {
            update_ui.stage.clone_from(&stage);
            update_ui.version.clone_from(&version);
            update_ui.progress = progress.min(100);
        }
    }
    rebuild_tray_menu(&app)?;
    let tray = app.tray_by_id(MAIN_TRAY_ID).ok_or_else(|| {
        msg::ERR_TRAY_NOT_READY
            .get(current_language(&app))
            .to_string()
    })?;
    set_tray_update_badge(&app, tray_update_badge_visible(&stage, version.as_deref()))?;
    let language = current_language(&app);
    tray.set_tooltip(Some(tray_tooltip_text(
        language,
        &stage,
        version.as_deref(),
        progress.min(100),
    )))
    .map_err(|error| error.to_string())
}

pub(crate) fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let lifecycle = app
        .state::<AppContext>()
        .core
        .lock()
        .map(|mut core| core.snapshot().lifecycle)
        .unwrap_or(MonitoringLifecycle::Paused);
    let menu = tray_menu(
        app.handle(),
        "idle",
        None,
        0,
        current_language(app.handle()),
        lifecycle,
    )?;
    let mut builder = TrayIconBuilder::with_id(MAIN_TRAY_ID)
        .tooltip(msg::TRAY_TOOLTIP.get(current_language(app.handle())))
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                show_main_window(tray.app_handle());
            }
        })
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "update" => {
                show_main_window(app);
                let _ = app.emit("updater://open", ());
            }
            "pause" => {
                if let Some(context) = app.try_state::<AppContext>() {
                    let updated = if let Ok(mut core) = context.core.lock() {
                        let snapshot = core.snapshot();
                        if matches!(
                            snapshot.lifecycle,
                            model::MonitoringLifecycle::Monitoring
                                | model::MonitoringLifecycle::Degraded
                        ) {
                            core.pause(None);
                            if let Ok(mut ui) = context.island_ui.lock() {
                                ui.request_pause_status();
                            }
                        } else {
                            let _ = core.resume();
                            if let Ok(mut ui) = context.island_ui.lock() {
                                ui.clear_pause_status_request();
                            }
                        }
                        let updated = core.snapshot();
                        let _ = persist(&context, &core);
                        Some(updated)
                    } else {
                        None
                    };
                    if let Some(updated) = updated {
                        let _ = app.emit("monitoring://snapshot", updated);
                        let _ = rebuild_tray_menu(app);
                    }
                }
            }
            "quit" => app.exit(0),
            _ => {}
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}
