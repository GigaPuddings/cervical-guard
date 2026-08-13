use super::*;

#[derive(Clone)]
pub(crate) struct UpdateUiState {
    pub(crate) stage: String,
    pub(crate) version: Option<String>,
    pub(crate) progress: u8,
    pub(crate) language: String,
}

impl Default for UpdateUiState {
    fn default() -> Self {
        Self {
            stage: "idle".to_string(),
            version: None,
            progress: 0,
            language: "zh-CN".to_string(),
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
    language: &str,
    lifecycle: MonitoringLifecycle,
) -> tauri::Result<Menu<tauri::Wry>> {
    let english = language == "en-US";
    let monitoring_active = matches!(
        lifecycle,
        MonitoringLifecycle::Monitoring | MonitoringLifecycle::Degraded
    );
    let pause_action_enabled = monitoring_active || lifecycle == MonitoringLifecycle::Paused;
    let status = MenuItem::with_id(
        app,
        "monitoring-status",
        match (english, lifecycle) {
            (true, MonitoringLifecycle::Monitoring | MonitoringLifecycle::Degraded) => {
                "Health Reminder · Monitoring"
            }
            (true, MonitoringLifecycle::Paused) => "Health Reminder · Monitoring paused",
            (true, MonitoringLifecycle::Break) => "Health Reminder · Break in progress",
            (true, MonitoringLifecycle::Initializing) => "Health Reminder · Starting monitoring",
            (true, MonitoringLifecycle::Calibrating) => "Health Reminder · Calibrating",
            (true, MonitoringLifecycle::Unavailable) => "Health Reminder · Monitoring unavailable",
            (false, MonitoringLifecycle::Monitoring | MonitoringLifecycle::Degraded) => {
                "健康提醒 · 正在检测"
            }
            (false, MonitoringLifecycle::Paused) => "健康提醒 · 检测已暂停",
            (false, MonitoringLifecycle::Break) => "健康提醒 · 主动休息中",
            (false, MonitoringLifecycle::Initializing) => "健康提醒 · 正在启动检测",
            (false, MonitoringLifecycle::Calibrating) => "健康提醒 · 正在校准",
            (false, MonitoringLifecycle::Unavailable) => "健康提醒 · 检测不可用",
        },
        false,
        None::<&str>,
    )?;
    let separator_after_status = PredefinedMenuItem::separator(app)?;
    let show = MenuItem::with_id(
        app,
        "show",
        if english {
            "Open main window"
        } else {
            "打开主窗口"
        },
        true,
        None::<&str>,
    )?;
    let pause = MenuItem::with_id(
        app,
        "pause",
        match (english, lifecycle) {
            (true, MonitoringLifecycle::Monitoring | MonitoringLifecycle::Degraded) => {
                "Pause monitoring"
            }
            (true, MonitoringLifecycle::Paused) => "Resume monitoring",
            (true, MonitoringLifecycle::Break) => "Break controls are in the main window",
            (true, _) => "Monitoring controls unavailable",
            (false, MonitoringLifecycle::Monitoring | MonitoringLifecycle::Degraded) => "暂停检测",
            (false, MonitoringLifecycle::Paused) => "恢复检测",
            (false, MonitoringLifecycle::Break) => "请在主窗口结束休息",
            (false, _) => "检测操作暂不可用",
        },
        pause_action_enabled,
        None::<&str>,
    )?;
    let separator_before_update = PredefinedMenuItem::separator(app)?;
    let update_text = update_tray_text(english, update_stage, update_version, update_progress);
    let update = MenuItem::with_id(app, "update", update_text, true, None::<&str>)?;
    let separator_before_quit = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(
        app,
        "quit",
        if english {
            "Quit Health Reminder"
        } else {
            "退出健康提醒"
        },
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
    english: bool,
    stage: &str,
    version: Option<&str>,
    progress: u8,
) -> String {
    match (english, stage, version) {
        (true, "checking", _) => "Checking for updates…".to_string(),
        (false, "checking", _) => "正在检查更新…".to_string(),
        (true, "downloading", Some(version)) => {
            format!("↓ Downloading v{version} · {}%", progress.min(100))
        }
        (false, "downloading", Some(version)) => {
            format!("↓ 正在下载 v{version} · {}%", progress.min(100))
        }
        (true, "downloading", None) => format!("↓ Downloading update · {}%", progress.min(100)),
        (false, "downloading", None) => format!("↓ 正在下载更新 · {}%", progress.min(100)),
        (true, "restarting", _) => "Update installed · Restarting…".to_string(),
        (false, "restarting", _) => "更新已安装 · 正在重启…".to_string(),
        (true, "error", _) => "Update failed · Click to retry".to_string(),
        (false, "error", _) => "更新失败 · 点击重试".to_string(),
        (true, "latest", _) => "Check for updates (up to date)".to_string(),
        (false, "latest", _) => "检查更新（当前已是最新）".to_string(),
        (true, _, Some(version)) => format!("View update v{version}"),
        (false, _, Some(version)) => format!("查看新版本 v{version}"),
        (true, _, None) => "Check for updates…".to_string(),
        (false, _, None) => "检查更新…".to_string(),
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
    let tray = app
        .tray_by_id(MAIN_TRAY_ID)
        .ok_or_else(|| "系统托盘尚未就绪".to_string())?;
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
    let context = app
        .try_state::<AppContext>()
        .ok_or_else(|| "应用状态尚未就绪".to_string())?;
    let update = context
        .update_ui
        .lock()
        .map_err(|_| "更新状态锁已损坏".to_string())?
        .clone();
    let lifecycle = context
        .core
        .lock()
        .map_err(|_| "状态锁已损坏".to_string())?
        .snapshot()
        .lifecycle;
    let menu = tray_menu(
        app,
        &update.stage,
        update.version.as_deref(),
        update.progress,
        &update.language,
        lifecycle,
    )
    .map_err(|error| error.to_string())?;
    app.tray_by_id(MAIN_TRAY_ID)
        .ok_or_else(|| "系统托盘尚未就绪".to_string())?
        .set_menu(Some(menu))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn set_update_tray_status(
    app: AppHandle,
    stage: String,
    version: Option<String>,
    progress: u8,
    language: String,
) -> Result<(), String> {
    if let Some(context) = app.try_state::<AppContext>() {
        if let Ok(mut update_ui) = context.update_ui.lock() {
            update_ui.stage.clone_from(&stage);
            update_ui.version.clone_from(&version);
            update_ui.progress = progress.min(100);
            update_ui.language.clone_from(&language);
        }
    }
    rebuild_tray_menu(&app)?;
    let tray = app
        .tray_by_id(MAIN_TRAY_ID)
        .ok_or_else(|| "系统托盘尚未就绪".to_string())?;
    set_tray_update_badge(&app, tray_update_badge_visible(&stage, version.as_deref()))?;
    let update_label = update_tray_text(
        language == "en-US",
        &stage,
        version.as_deref(),
        progress.min(100),
    );
    let tooltip = if matches!(stage.as_str(), "idle" | "latest") {
        if language == "en-US" {
            "Health Reminder · Posture & Sitting".to_string()
        } else {
            "健康提醒 · 姿态与久坐".to_string()
        }
    } else {
        update_label
    };
    tray.set_tooltip(Some(tooltip))
        .map_err(|error| error.to_string())
}

pub(crate) fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let lifecycle = app
        .state::<AppContext>()
        .core
        .lock()
        .map(|mut core| core.snapshot().lifecycle)
        .unwrap_or(MonitoringLifecycle::Paused);
    let menu = tray_menu(app.handle(), "idle", None, 0, "zh-CN", lifecycle)?;
    let mut builder = TrayIconBuilder::with_id(MAIN_TRAY_ID)
        .tooltip("健康提醒 · 姿态与久坐")
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
