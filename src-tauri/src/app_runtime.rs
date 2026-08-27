use super::*;

const AUTOSTART_BACKGROUND_ARG: &str = "--background-autostart";

fn should_show_main_window_for_launch(args: &[String], silent_autostart: bool) -> bool {
    !silent_autostart || !args.iter().any(|arg| arg == AUTOSTART_BACKGROUND_ARG)
}

fn silent_autostart_enabled(app: &AppHandle) -> bool {
    app.try_state::<AppContext>()
        .and_then(|context| {
            context
                .core
                .lock()
                .ok()
                .map(|core| core.settings().silent_autostart)
        })
        .unwrap_or(false)
}

pub(crate) fn guard_protocol_response(path: &str) -> tauri::http::Response<Vec<u8>> {
    match path {
        "/reminder-island" | "/" => tauri::http::Response::builder()
            .header(
                tauri::http::header::CONTENT_TYPE,
                "text/html; charset=utf-8",
            )
            .header(
                tauri::http::header::CACHE_CONTROL,
                "no-store, no-cache, must-revalidate",
            )
            .body(include_bytes!("../../public/island.html").to_vec())
            .expect("动态岛页面响应必须有效"),
        _ => tauri::http::Response::builder()
            .status(tauri::http::StatusCode::NOT_FOUND)
            .body(Vec::new())
            .expect("应用内协议 404 响应必须有效"),
    }
}

pub(crate) fn run() {
    tauri::Builder::default()
        .register_uri_scheme_protocol("guard", |_ctx, request| {
            guard_protocol_response(request.uri().path())
        })
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .arg(AUTOSTART_BACKGROUND_ARG)
                .build(),
        )
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if should_show_main_window_for_launch(&args, silent_autostart_enabled(app)) {
                show_main_window(app);
            }
        }))
        .on_page_load(|webview, payload| {
            // 配置层先隐藏主窗口，避免 WebView 尚未解析 index.html 时暴露空白底色。
            // 页面完成首次加载后，根 HTML 中不依赖 React 的启动画面已经可渲染，
            // 此时再显示窗口可同时覆盖冷启动和系统自启动场景。
            if webview.label() == "main"
                && payload.event() == PageLoadEvent::Finished
                && payload.url().scheme() != "about"
            {
                let args = std::env::args().collect::<Vec<_>>();
                let app = webview.app_handle();
                if should_show_main_window_for_launch(&args, silent_autostart_enabled(app)) {
                    let window = webview.window();
                    if let Err(error) = window.show() {
                        eprintln!("[startup] show main window after page load failed: {error}");
                    }
                }
            }
        })
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&directory)?;
            let database = Database::open(&directory.join("cervical-guard.sqlite3"))
                .map_err(std::io::Error::other)?;
            let runtime = RuntimeState::load(&database);
            let refresh_autostart_registration = runtime.settings().autostart;
            let vision = Arc::new(VisionService::new());
            app.manage(AppContext {
                core: Mutex::new(runtime),
                database: Mutex::new(database),
                vision,
                island_ui: Mutex::new(IslandUiState::default()),
                update_ui: Mutex::new(UpdateUiState::default()),
            });
            // enable() 会覆盖既有系统启动项，用带后台标记的新命令迁移旧版本注册。
            if refresh_autostart_registration {
                if let Err(error) = app.autolaunch().enable() {
                    eprintln!("[startup] refresh autostart registration failed: {error}");
                }
            }
            build_tray(app)?;
            set_reminder_island_visible(app.handle(), false, false)?;

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(Duration::from_secs(1));
                let mut last_behavior = BehaviorState::Unknown;
                let mut last_lifecycle = handle
                    .try_state::<AppContext>()
                    .and_then(|context| {
                        context
                            .core
                            .lock()
                            .ok()
                            .map(|mut core| core.snapshot().lifecycle)
                    })
                    .unwrap_or(MonitoringLifecycle::Unavailable);
                let mut behavior_started_at = Instant::now();
                let mut behavior_started_wall = chrono::Utc::now().to_rfc3339();
                let mut last_break_count = handle
                    .try_state::<AppContext>()
                    .and_then(|context| {
                        context
                            .core
                            .lock()
                            .ok()
                            .map(|core| core.today().break_count)
                    })
                    .unwrap_or(0);
                loop {
                    interval.tick().await;
                    let Some(context) = handle.try_state::<AppContext>() else {
                        continue;
                    };
                    let (snapshot, reminder) = {
                        let Ok(mut core) = context.core.lock() else {
                            continue;
                        };
                        let reminder = core.tick();
                        let snapshot = core.snapshot();
                        let _ = persist(&context, &core);
                        (snapshot, reminder)
                    };
                    if let Some(reminder) = reminder {
                        let sound_enabled = reminder_sound_enabled(&snapshot.settings);
                        present_reminder_island(&handle, reminder, sound_enabled);
                    }
                    if snapshot.lifecycle != last_lifecycle {
                        let _ = rebuild_tray_menu(&handle);
                        last_lifecycle = snapshot.lifecycle;
                    }
                    if snapshot.lifecycle == MonitoringLifecycle::Break {
                        let _ = handle.emit_to("reminder-island", "island://break", &snapshot);
                    }
                    let behavior_changed = snapshot.behavior != last_behavior;
                    if behavior_changed {
                        let completed_type = match last_behavior {
                            BehaviorState::NoPerson => Some("away"),
                            BehaviorState::HeadDown => Some("head_down"),
                            _ => None,
                        };
                        if let Some(event_type) = completed_type {
                            if let Ok(database) = context.database.lock() {
                                let _ = database.record_completed_event(
                                    event_type,
                                    &behavior_started_wall,
                                    behavior_started_at.elapsed().as_secs(),
                                    Some(if event_type == "away" {
                                        "returned"
                                    } else {
                                        "recovered"
                                    }),
                                );
                            }
                        }
                        behavior_started_at = Instant::now();
                        behavior_started_wall = chrono::Utc::now().to_rfc3339();
                    }
                    if snapshot.today.break_count > last_break_count
                        && snapshot.lifecycle != MonitoringLifecycle::Break
                    {
                        if let Ok(database) = context.database.lock() {
                            let _ = database.record_event(
                                "break",
                                snapshot.away_seconds,
                                Some("observed"),
                            );
                        }
                    }
                    last_break_count = snapshot.today.break_count;
                    last_behavior = snapshot.behavior;
                    if behavior_changed
                        && snapshot.monitoring_mode == MonitoringMode::Camera
                        && matches!(snapshot.lifecycle, MonitoringLifecycle::Monitoring)
                        && snapshot.behavior == BehaviorState::HeadDown
                    {
                        present_behavior_notice(&handle, &snapshot);
                    }
                    let passive_notice_active = context
                        .island_ui
                        .lock()
                        .map(|ui| ui.away_notice || ui.behavior_notice_active())
                        .unwrap_or(true);
                    let status_enabled = island_status_enabled_for_context(
                        &context,
                        &snapshot.settings,
                        snapshot.lifecycle,
                    );
                    if status_enabled
                        && snapshot.current_reminder.is_none()
                        && !passive_notice_active
                        && (snapshot.lifecycle == MonitoringLifecycle::Paused
                            || !matches!(
                                snapshot.behavior,
                                BehaviorState::HeadDown | BehaviorState::NoPerson
                            ))
                    {
                        present_persistent_status(&handle, &snapshot);
                    }
                    // —— 离开检测提示 ——
                    // 灵动岛仅在所有内容窗口均隐藏或最小化时展示。
                    let island_content_permitted =
                        island_content_allowed(&handle, &snapshot.settings);
                    let camera_tracking =
                        matches!(snapshot.lifecycle, MonitoringLifecycle::Monitoring)
                            && snapshot.monitoring_mode == MonitoringMode::Camera;
                    let confirmed_away = camera_tracking
                        && !snapshot.person_present
                        && matches!(snapshot.behavior, model::BehaviorState::NoPerson)
                        && snapshot.seated_seconds > 0;
                    let mut ui = match context.island_ui.lock() {
                        Ok(ui) => ui,
                        Err(_) => continue,
                    };
                    if !ui.island_available(&snapshot.settings)
                        || !snapshot.settings.island_away_enabled
                    {
                        if ui.away_notice {
                            ui.away_notice = false;
                            drop(ui);
                            hide_island_window(&handle);
                        }
                    } else if snapshot.current_reminder.is_some() {
                        // 提醒展示期间离开提示让位。
                        ui.away_notice = false;
                        ui.behavior_notice_until = None;
                    } else if camera_tracking && island_content_permitted {
                        // 使用“已确认离座”的稳定状态，而不是单帧 present 跳变。
                        // 因此即使用户先离座、随后才最小化主窗口，也能显示正确状态。
                        if confirmed_away && !ui.away_notice {
                            ui.away_notice = true;
                            ui.detail_expanded = false;
                            drop(ui);
                            present_away_notice(&handle, &snapshot);
                        } else if ui.confirm_return_after_away(
                            snapshot.person_present
                                && snapshot.frame_quality == model::FrameQuality::Good
                                && snapshot.posture_confidence >= 0.45,
                        ) {
                            drop(ui);
                            let _ =
                                handle.emit_to("reminder-island", "island://returned", &snapshot);
                        }
                    } else if ui.away_notice {
                        // 内容窗口可见或监测中断时，离开提示随之收起。
                        ui.away_notice = false;
                        drop(ui);
                        hide_island_window(&handle);
                    }
                    let _ = handle.emit("monitoring://snapshot", snapshot);
                }
            });

            // —— 鼠标悬停展开详情 ——
            // 轮询全局光标位置：进入屏幕顶部热区时展开灵动岛详情卡片，
            // 离开展开区域时通知前端延迟收起。窗口隐藏时 DOM 事件不可用，因此由 Rust 侧检测。
            let hover_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut idle = true;
                let mut hover_inside = false;
                let mut expanded_at: Option<Instant> = None;
                let mut hot_zone_hits: u32 = 0; // 展开防抖：连续命中计数
                let mut content_windows_were_hidden = false;
                let mut action_buttons_capturing = false;
                let mut pointer_peeking: Option<(f64, f64)> = None;
                let mut pointer_hovering = false;
                loop {
                    tokio::time::sleep(if idle {
                        Duration::from_secs(1)
                    } else {
                        Duration::from_millis(120)
                    })
                    .await;
                    let Some(context) = hover_handle.try_state::<AppContext>() else {
                        continue;
                    };
                    let snapshot = match context.core.lock() {
                        Ok(mut core) => core.snapshot(),
                        Err(_) => continue,
                    };
                    let (behavior_notice_active, away_notice, menu_open, muted) = context
                        .island_ui
                        .lock()
                        .map(|ui| {
                            (
                                ui.behavior_notice_active(),
                                ui.away_notice,
                                ui.menu_open,
                                ui.muted_permanently
                                    || ui
                                        .muted_until
                                        .is_some_and(|deadline| Instant::now() < deadline),
                            )
                        })
                        .unwrap_or((false, false, false, true));
                    let break_active = snapshot.lifecycle == MonitoringLifecycle::Break;
                    let reminder_active = snapshot.current_reminder.is_some();
                    let settings = &snapshot.settings;
                    let persistent_status_enabled =
                        island_status_enabled_for_context(&context, settings, snapshot.lifecycle);
                    let hover_status_enabled = island_hover_status_enabled_for_context(
                        &context,
                        settings,
                        snapshot.lifecycle,
                    );
                    let surface_needed = island_surface_needed(
                        settings,
                        persistent_status_enabled || hover_status_enabled,
                        reminder_active,
                        break_active,
                        behavior_notice_active,
                        away_notice,
                        menu_open,
                        muted,
                    );
                    if !surface_needed {
                        idle = true;
                        if let Some(window) = hover_handle.get_webview_window("reminder-island") {
                            if window.is_visible().unwrap_or(false) {
                                hide_island_window(&hover_handle);
                            }
                        }
                        action_buttons_capturing = false;
                        pointer_peeking = None;
                        update_island_hover_state(&hover_handle, &mut pointer_hovering, false);
                        hover_inside = false;
                        expanded_at = None;
                        hot_zone_hits = 0;
                        content_windows_were_hidden = false;
                        continue;
                    }
                    idle = false;
                    let fullscreen_blocked = island_blocked_by_external_fullscreen(settings);
                    let island_content_permitted = island_content_allowed(&hover_handle, settings);
                    if hover_handle.get_webview_window("reminder-island").is_none() {
                        if island_content_permitted {
                            if let Some(reminder) = snapshot.current_reminder.clone() {
                                present_reminder_island(&hover_handle, reminder, false);
                            } else if break_active {
                                present_break_island(&hover_handle, &snapshot);
                            } else if persistent_status_enabled {
                                present_persistent_status(&hover_handle, &snapshot);
                            } else if hover_status_enabled {
                                let app_handle = hover_handle.clone();
                                let _ = hover_handle.run_on_main_thread(move || {
                                    let _ = ensure_hidden_reminder_island(&app_handle);
                                });
                            }
                        }
                        continue;
                    }
                    let Some(window) = hover_handle.get_webview_window("reminder-island") else {
                        continue;
                    };
                    if fullscreen_blocked {
                        if window.is_visible().unwrap_or(false) {
                            if let Ok(mut ui) = context.island_ui.lock() {
                                ui.detail_expanded = false;
                                ui.away_notice = false;
                                ui.behavior_notice_until = None;
                                ui.menu_open = false;
                            }
                            hide_island_window(&hover_handle);
                        }
                        content_windows_were_hidden = false;
                        action_buttons_capturing = false;
                        update_island_peek_state(&hover_handle, &mut pointer_peeking, None);
                        update_island_hover_state(&hover_handle, &mut pointer_hovering, false);
                        hover_inside = false;
                        expanded_at = None;
                        hot_zone_hits = 0;
                        continue;
                    }
                    if !island_content_permitted && !behavior_notice_active && !break_active {
                        if content_windows_were_hidden || window.is_visible().unwrap_or(false) {
                            if let Ok(mut ui) = context.island_ui.lock() {
                                ui.detail_expanded = false;
                                ui.away_notice = false;
                            }
                            hide_island_window(&hover_handle);
                        }
                        content_windows_were_hidden = false;
                        action_buttons_capturing = false;
                        update_island_peek_state(&hover_handle, &mut pointer_peeking, None);
                        update_island_hover_state(&hover_handle, &mut pointer_hovering, false);
                        hover_inside = false;
                        expanded_at = None;
                        hot_zone_hits = 0;
                        continue;
                    }
                    if !content_windows_were_hidden {
                        content_windows_were_hidden = true;
                        let reminder = context
                            .core
                            .lock()
                            .ok()
                            .and_then(|core| core.current_reminder().cloned());
                        if let Some(reminder) = reminder {
                            // 这是把已存在的提醒恢复到后台灵动岛，不应重复播放声音。
                            present_reminder_island(&hover_handle, reminder, false);
                            continue;
                        }
                    }
                    let Ok(cursor) = window.cursor_position() else {
                        continue;
                    };
                    // 透明效果只响应真实窗口矩形，不使用更大的悬停热区；事件发送
                    // 逻辑坐标，确保 CSS 圆心在不同 DPI 缩放下仍贴合真实光标。
                    let pointer_in_island = if window.is_visible().unwrap_or(false) {
                        match (
                            window.outer_position(),
                            window.outer_size(),
                            window.scale_factor(),
                        ) {
                            (Ok(position), Ok(size), Ok(scale)) => {
                                let physical_x = cursor.x as f64 - position.x as f64;
                                let physical_y = cursor.y as f64 - position.y as f64;
                                (physical_x >= 0.0
                                    && physical_x <= size.width as f64
                                    && physical_y >= 0.0
                                    && physical_y <= size.height as f64)
                                    .then_some((physical_x / scale, physical_y / scale))
                            }
                            _ => None,
                        }
                    } else {
                        None
                    };
                    if menu_open {
                        let _ = window.set_ignore_cursor_events(false);
                        action_buttons_capturing = true;
                        update_island_peek_state(&hover_handle, &mut pointer_peeking, None);
                        update_island_hover_state(&hover_handle, &mut pointer_hovering, true);
                        continue;
                    }
                    update_island_hover_state(
                        &hover_handle,
                        &mut pointer_hovering,
                        pointer_in_island.is_some(),
                    );
                    let over_close =
                        pointer_in_island.is_some_and(|(x, y)| x >= 330.0 && y <= 26.0);
                    if over_close {
                        let _ = window.set_ignore_cursor_events(false);
                        action_buttons_capturing = true;
                        update_island_peek_state(&hover_handle, &mut pointer_peeking, None);
                        continue;
                    }
                    if break_active {
                        let over_action =
                            pointer_in_island.is_some_and(|(x, y)| break_action_hit(x, y));
                        if over_action != action_buttons_capturing {
                            let _ = window.set_ignore_cursor_events(!over_action);
                            action_buttons_capturing = over_action;
                        }
                        update_island_peek_state(
                            &hover_handle,
                            &mut pointer_peeking,
                            pointer_in_island
                                .filter(|_| settings.island_peek_through_enabled && !over_action),
                        );
                        hover_inside = false;
                        expanded_at = None;
                        hot_zone_hits = 0;
                        continue;
                    }
                    if behavior_notice_active && !reminder_active {
                        if action_buttons_capturing {
                            let _ = window.set_ignore_cursor_events(true);
                            action_buttons_capturing = false;
                        }
                        update_island_peek_state(
                            &hover_handle,
                            &mut pointer_peeking,
                            pointer_in_island.filter(|_| settings.island_peek_through_enabled),
                        );
                        hover_inside = false;
                        expanded_at = None;
                        hot_zone_hits = 0;
                        continue;
                    }
                    if reminder_active {
                        let over_action =
                            pointer_in_island.is_some_and(|(x, y)| island_action_hit(x, y));
                        if over_action != action_buttons_capturing {
                            let _ = window.set_ignore_cursor_events(!over_action);
                            action_buttons_capturing = over_action;
                        }
                        update_island_peek_state(
                            &hover_handle,
                            &mut pointer_peeking,
                            pointer_in_island
                                .filter(|_| settings.island_peek_through_enabled && !over_action),
                        );
                        hover_inside = false;
                        expanded_at = None;
                        hot_zone_hits = 0;
                        continue;
                    }
                    if action_buttons_capturing {
                        let _ = window.set_ignore_cursor_events(true);
                        action_buttons_capturing = false;
                    }
                    let (detail_expanded, hover_suppressed) = context
                        .island_ui
                        .lock()
                        .map(|ui| (ui.detail_expanded, ui.hover_suppressed_until_exit))
                        .unwrap_or((false, false));
                    update_island_peek_state(
                        &hover_handle,
                        &mut pointer_peeking,
                        pointer_in_island.filter(|_| settings.island_peek_through_enabled),
                    );
                    // 热区命中判断（物理坐标）：优先使用窗口实际位置计算热区，
                    // 确保热区与窗口真实位置对齐；窗口位置不可用时回退到显示器中心。
                    let in_hot_zone = {
                        let scale = window.scale_factor().unwrap_or(1.0);
                        let (center_x, top) = match window.outer_position() {
                            Ok(pos) => {
                                // 以窗口中心为热区中心，热区顶部延伸到窗口上方 32px。
                                let win_w = window
                                    .outer_size()
                                    .map(|s| s.width as f64)
                                    .unwrap_or(ISLAND_COMPACT_WIDTH * scale);
                                (pos.x as f64 + win_w / 2.0, pos.y as f64 - 32.0 * scale)
                            }
                            _ => match hover_handle.primary_monitor() {
                                Ok(Some(monitor)) => (
                                    monitor.position().x as f64 + monitor.size().width as f64 / 2.0,
                                    monitor.position().y as f64,
                                ),
                                _ => (0.0, 0.0),
                            },
                        };
                        let half = ISLAND_HOT_ZONE_HALF_WIDTH * scale;
                        let bottom = top + ISLAND_HOT_ZONE_HEIGHT * scale;
                        let x = cursor.x as f64;
                        let y = cursor.y as f64;
                        let hit =
                            x >= center_x - half && x <= center_x + half && y >= top && y <= bottom;
                        hit
                    };
                    // 提醒按钮刚执行完时，光标仍在按钮/顶部热区内。此时等待它
                    // 真正离开，避免“提醒关闭 → 详情立即展开”的窗口竞争。
                    if hover_suppressed {
                        let suppress_this_tick = context
                            .island_ui
                            .lock()
                            .map(|mut ui| ui.consume_hover_suppression(in_hot_zone))
                            .unwrap_or(false);
                        if suppress_this_tick {
                            hover_inside = false;
                            expanded_at = None;
                            hot_zone_hits = 0;
                            continue;
                        }
                    }
                    // 物理坐标判断：未展开时以热区为准；展开期间取
                    // 「窗口实际矩形（含余量）∪ 热区」的并集——窗口变形是
                    // 异步生效的，单纯依赖窗口矩形会在变形间隙把光标误判为离开，
                    // 导致详情卡片闪现后立即收起。
                    let mut inside = if detail_expanded {
                        let in_window = match (
                            window.outer_position(),
                            window.outer_size(),
                            window.scale_factor(),
                        ) {
                            (Ok(pos), Ok(size), Ok(scale)) => {
                                let top_margin = 32.0 * scale;
                                let side_margin = 16.0 * scale;
                                let x = cursor.x as f64;
                                let y = cursor.y as f64;
                                x >= pos.x as f64 - side_margin
                                    && x <= pos.x as f64 + size.width as f64 + side_margin
                                    && y >= pos.y as f64 - top_margin
                                    && y <= pos.y as f64 + size.height as f64 + top_margin
                            }
                            _ => false,
                        };
                        in_window || in_hot_zone
                    } else {
                        in_hot_zone
                    };
                    // 展开防抖：未展开时要求连续 2 次命中热区才触发展开，
                    // 避免鼠标快速划过热区时窗口闪现。已展开时不需要防抖。
                    if !detail_expanded {
                        if in_hot_zone {
                            hot_zone_hits = hot_zone_hits.saturating_add(1);
                        } else {
                            hot_zone_hits = 0;
                        }
                        if in_hot_zone && hot_zone_hits < 2 {
                            inside = false;
                        }
                    } else {
                        hot_zone_hits = 0;
                    }
                    // 展开后宽限期：刚展开的一小段时间内即使光标短暂离开也不收起，
                    // 避免窗口变形异步延迟导致"闪现即消失"。
                    let in_grace = match expanded_at {
                        Some(t) => t.elapsed() < Duration::from_millis(ISLAND_EXPAND_GRACE_MS),
                        None => false,
                    };
                    if inside == hover_inside {
                        // 状态一致，但可能 detail_expanded 与 hover_inside 不一致：
                        // collapse_island_detail 被前端调用后 detail_expanded=false，
                        // 但 hover_inside 仍为 true，导致无法重新展开。
                        if inside && !detail_expanded {
                            hover_inside = false;
                            continue;
                        }
                        continue;
                    }
                    // 离开时若仍在宽限期内，跳过本轮不触发收起。
                    if !inside && in_grace {
                        // 保留上一次的“仍在热区”状态。这样宽限期结束后，若光标
                        // 依然在外部，inside != hover_inside，轮询会补发 hover-left。
                        // 若此处提前写成 false，后续两者会一直相等，详情窗口将
                        // 永久停留在展开状态。
                        continue;
                    }
                    hover_inside = inside;
                    if inside {
                        let eligible = snapshot.current_reminder.is_none()
                            && island_hover_status_enabled_for_context(
                                &context,
                                &snapshot.settings,
                                snapshot.lifecycle,
                            );
                        let Ok(mut ui) = context.island_ui.lock() else {
                            continue;
                        };
                        if eligible && !ui.away_notice {
                            // 收起冷却期：刚收起后的一小段时间内不重新展开，
                            // 防止 collapse_island_detail → 轮询立即检测到光标在热区 → 重新展开 的闪现循环。
                            let in_collapse_cooldown = ui.last_collapsed_at.is_some_and(|t| {
                                t.elapsed() < Duration::from_millis(ISLAND_COLLAPSE_COOLDOWN_MS)
                            });
                            if in_collapse_cooldown {
                                drop(ui);
                                continue;
                            }
                            let newly_expanded = !ui.detail_expanded;
                            ui.detail_expanded = true;
                            ui.last_collapsed_at = None;
                            drop(ui);
                            if newly_expanded {
                                expanded_at = Some(Instant::now());
                                present_island_detail(&hover_handle, &snapshot);
                            } else {
                                // 展开期间光标重新进入：仅刷新数据并取消前端的收起计时。
                                let _ = hover_handle.emit_to(
                                    "reminder-island",
                                    "island://detail",
                                    &snapshot,
                                );
                            }
                        }
                    } else {
                        expanded_at = None;
                        let _ = hover_handle.emit_to("reminder-island", "island://hover-left", ());
                    }
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let (should_hide, update_active) = window
                    .app_handle()
                    .try_state::<AppContext>()
                    .map(|context| {
                        let should_hide = context
                            .core
                            .lock()
                            .ok()
                            .map(|core| core.settings().run_in_background)
                            .unwrap_or(false);
                        let update_active = context
                            .update_ui
                            .lock()
                            .ok()
                            .map(|update| update.keeps_app_alive())
                            .unwrap_or(false);
                        (should_hide, update_active)
                    })
                    .unwrap_or((false, false));
                api.prevent_close();
                if should_hide || update_active {
                    let _ = window.hide();
                } else {
                    // reminder-island 窗口始终存在（通常为隐藏状态），因此若仅让
                    // main 执行默认关闭，进程会残留且之后无法重新打开主窗口。
                    // 未启用后台运行时，关闭主窗口应明确退出整个应用。
                    window.app_handle().exit(0);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_app_snapshot,
            finish_onboarding,
            save_calibration,
            start_calibration,
            start_monitoring,
            ingest_observation,
            pause_monitoring,
            resume_monitoring,
            start_break,
            end_break,
            snooze_reminder,
            dismiss_reminder,
            update_settings,
            get_statistics,
            get_behavior_history,
            get_behavior_history_for_date,
            export_statistics,
            delete_local_data,
            list_cameras,
            start_vision,
            stop_vision,
            collapse_island_detail,
            dismiss_behavior_notice,
            set_island_menu_open,
            mute_island,
            set_update_tray_status,
            get_update_proxy,
        ])
        .run(tauri::generate_context!())
        .expect("健康提醒应用启动失败");
}

#[cfg(test)]
mod tests;
