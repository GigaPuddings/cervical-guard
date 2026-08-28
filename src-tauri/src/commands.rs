use super::*;

pub(crate) fn persist(context: &AppContext, core: &RuntimeState) -> Result<(), String> {
    let database = context
        .database
        .lock()
        .map_err(|_| "数据库锁已损坏".to_string())?;
    database.save_settings(core.settings())?;
    database.save_meta(&core.persisted_meta())?;
    database.save_daily(core.today())
}

pub(crate) fn snapshot_after(
    context: &AppContext,
    operation: impl FnOnce(&mut RuntimeState) -> Result<(), String>,
) -> Result<AppSnapshot, String> {
    let mut core = context
        .core
        .lock()
        .map_err(|_| "状态锁已损坏".to_string())?;
    operation(&mut core)?;
    let snapshot = core.snapshot();
    persist(context, &core)?;
    Ok(snapshot)
}

#[tauri::command]
pub(crate) fn get_app_snapshot(
    app: AppHandle,
    context: State<'_, AppContext>,
) -> Result<AppSnapshot, String> {
    let mut core = context
        .core
        .lock()
        .map_err(|_| "状态锁已损坏".to_string())?;
    let reminder = core.tick();
    let snapshot = core.snapshot();
    persist(&context, &core)?;
    drop(core);
    if let Some(reminder) = reminder {
        let sound_enabled = reminder_sound_enabled(&snapshot.settings);
        present_reminder_island(&app, reminder, sound_enabled);
    }
    Ok(snapshot)
}

#[tauri::command]
pub(crate) fn finish_onboarding(
    context: State<'_, AppContext>,
    mode: MonitoringMode,
    permission: PermissionState,
) -> Result<AppSnapshot, String> {
    snapshot_after(&context, |core| {
        core.finish_onboarding(mode, permission);
        Ok(())
    })
}

#[tauri::command]
pub(crate) fn save_calibration(
    context: State<'_, AppContext>,
    result: CalibrationResult,
) -> Result<AppSnapshot, String> {
    snapshot_after(&context, |core| core.save_calibration(result))
}

#[tauri::command]
pub(crate) fn start_calibration(context: State<'_, AppContext>) -> Result<AppSnapshot, String> {
    snapshot_after(&context, |core| {
        core.start_calibration();
        Ok(())
    })
}

#[tauri::command]
pub(crate) fn start_monitoring(
    context: State<'_, AppContext>,
    mode: MonitoringMode,
) -> Result<AppSnapshot, String> {
    snapshot_after(&context, |core| core.start_monitoring(mode))
}

#[tauri::command]
pub(crate) fn ingest_observation(
    app: AppHandle,
    context: State<'_, AppContext>,
    observation: VisionObservation,
) -> Result<AppSnapshot, String> {
    let mut core = context
        .core
        .lock()
        .map_err(|_| "状态锁已损坏".to_string())?;
    let reminder = core.ingest(observation)?;
    let snapshot = core.snapshot();
    // 提醒展示可能访问窗口和播放声音，必须在释放核心状态锁后执行。
    // 默认低头阈值到达时曾在这里持锁调用提醒函数，而提醒函数又获取同一把锁，
    // 导致检测运行数分钟后确定性死锁。
    drop(core);
    if let Some(reminder) = reminder {
        let sound_enabled = reminder_sound_enabled(&snapshot.settings);
        present_reminder_island(&app, reminder, sound_enabled);
    }
    // 高频观测只更新内存状态;后台 1 秒 tick 已统一持久化,避免每帧重复
    // 写 SQLite。用户操作命令仍同步落盘,这里只增加最多约 1 秒的运行
    // 统计崩溃窗口,不影响提醒与设置的一致性。
    Ok(snapshot)
}

#[tauri::command]
pub(crate) fn pause_monitoring(
    app: AppHandle,
    context: State<'_, AppContext>,
    minutes: Option<u64>,
) -> Result<AppSnapshot, String> {
    let mut core = context
        .core
        .lock()
        .map_err(|_| "状态锁已损坏".to_string())?;
    core.pause(minutes);
    let snapshot = core.snapshot();
    persist(&context, &core)?;
    drop(core);
    {
        let database = context
            .database
            .lock()
            .map_err(|_| "数据库锁已损坏".to_string())?;
        database.record_event(
            "proactive_pause",
            minutes.unwrap_or(0).saturating_mul(60),
            Some(if minutes.is_some() { "timed" } else { "manual" }),
        )?;
    }
    context
        .island_ui
        .lock()
        .map_err(|_| "状态锁已损坏".to_string())?
        .request_pause_status();
    suppress_island_hover_until_cursor_exit(&context)?;
    rebuild_tray_menu(&app)?;
    Ok(snapshot)
}

#[tauri::command]
pub(crate) fn resume_monitoring(
    app: AppHandle,
    context: State<'_, AppContext>,
) -> Result<AppSnapshot, String> {
    let snapshot = snapshot_after(&context, RuntimeState::resume)?;
    context
        .island_ui
        .lock()
        .map_err(|_| "状态锁已损坏".to_string())?
        .clear_pause_status_request();
    rebuild_tray_menu(&app)?;
    Ok(snapshot)
}

#[tauri::command]
pub(crate) fn start_break(
    app: AppHandle,
    context: State<'_, AppContext>,
) -> Result<AppSnapshot, String> {
    // 从主窗口开始休息时，结束后恢复主窗口；从后台提醒
    // 灵动岛开始时不弹出主窗口。最小化状态按后台入口处理。
    let restore_main_after_break = app.get_webview_window("main").is_some_and(|window| {
        window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false)
    });
    let mut core = context
        .core
        .lock()
        .map_err(|_| "状态锁已损坏".to_string())?;
    let event_type = if core.current_reminder().is_some() {
        "break"
    } else if core.snapshot().seated_seconds < core.settings().sedentary_seconds {
        "early_break"
    } else {
        "proactive_break"
    };
    core.start_break();
    {
        let database = context
            .database
            .lock()
            .map_err(|_| "数据库锁已损坏".to_string())?;
        let event_id = database.start_event(event_type, Some("started"))?;
        context
            .island_ui
            .lock()
            .map_err(|_| "状态锁已损坏".to_string())?
            .active_break_event = Some((event_id, Instant::now()));
    }
    let snapshot = core.snapshot();
    persist(&context, &core)?;
    drop(core);
    context
        .island_ui
        .lock()
        .map_err(|_| "状态锁已损坏".to_string())?
        .remember_main_visibility_for_break(restore_main_after_break);
    let _ = app.emit("monitoring://snapshot", &snapshot);
    rebuild_tray_menu(&app)?;
    present_break_island(&app, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
pub(crate) fn end_break(
    app: AppHandle,
    context: State<'_, AppContext>,
) -> Result<AppSnapshot, String> {
    let mut core = context
        .core
        .lock()
        .map_err(|_| "状态锁已损坏".to_string())?;
    core.end_break();
    let snapshot = core.snapshot();
    persist(&context, &core)?;
    drop(core);
    let active_event = context
        .island_ui
        .lock()
        .map_err(|_| "状态锁已损坏".to_string())?
        .active_break_event
        .take();
    if let Some((event_id, started_at)) = active_event {
        context
            .database
            .lock()
            .map_err(|_| "数据库锁已损坏".to_string())?
            .finish_event(&event_id, started_at.elapsed().as_secs(), Some("completed"))?;
    }
    let restore_main_after_break = {
        let mut ui = context
            .island_ui
            .lock()
            .map_err(|_| "状态锁已损坏".to_string())?;
        let restore = ui.take_main_restore_after_break();
        ui.suppress_hover_until_cursor_exit();
        restore
    };
    let _ = app.emit("monitoring://snapshot", &snapshot);
    rebuild_tray_menu(&app)?;
    if restore_main_after_break {
        show_main_window(&app);
    } else {
        hide_island_window(&app);
    }
    Ok(snapshot)
}

#[tauri::command]
pub(crate) fn snooze_reminder(
    context: State<'_, AppContext>,
    minutes: u64,
) -> Result<AppSnapshot, String> {
    let mut core = context
        .core
        .lock()
        .map_err(|_| "状态锁已损坏".to_string())?;
    let duration = core
        .current_reminder()
        .map(|item| item.duration_seconds)
        .unwrap_or(0);
    let had_reminder = core.current_reminder().is_some();
    core.snooze(minutes);
    if had_reminder {
        let database = context
            .database
            .lock()
            .map_err(|_| "数据库锁已损坏".to_string())?;
        database.record_event("reminder", duration, Some("snoozed"))?;
    }
    let snapshot = core.snapshot();
    persist(&context, &core)?;
    suppress_island_hover_until_cursor_exit(&context)?;
    Ok(snapshot)
}

#[tauri::command]
pub(crate) fn dismiss_reminder(
    app: AppHandle,
    context: State<'_, AppContext>,
) -> Result<AppSnapshot, String> {
    let mut core = context
        .core
        .lock()
        .map_err(|_| "状态锁已损坏".to_string())?;
    let current_reminder = core.current_reminder().cloned();
    let duration = current_reminder
        .as_ref()
        .map(|item| item.duration_seconds)
        .unwrap_or(0);
    core.dismiss();
    if current_reminder.is_some() {
        let database = context
            .database
            .lock()
            .map_err(|_| "数据库锁已损坏".to_string())?;
        database.record_event("reminder", duration, Some("dismissed"))?;
    }
    let snapshot = core.snapshot();
    persist(&context, &core)?;
    suppress_island_hover_until_cursor_exit(&context)?;
    let _ = app.emit("monitoring://snapshot", &snapshot);
    Ok(snapshot)
}

#[tauri::command]
pub(crate) fn update_settings(
    app: AppHandle,
    context: State<'_, AppContext>,
    settings: AppSettings,
) -> Result<AppSnapshot, String> {
    // 先验证再修改系统自启动，避免无效设置导致 OS 状态与数据库状态分叉。
    settings.validate()?;
    let autostart_changed = {
        let core = context
            .core
            .lock()
            .map_err(|_| "状态锁已损坏".to_string())?;
        core.settings().autostart != settings.autostart
    };
    if autostart_changed {
        let result = if settings.autostart {
            app.autolaunch().enable()
        } else {
            app.autolaunch().disable()
        };
        result.map_err(|error| format!("无法更新开机启动设置：{error}"))?;
    }
    let snapshot = snapshot_after(&context, |core| core.update_settings(settings))?;
    if !snapshot.settings.island_enabled
        || (!island_status_enabled_for_context(&context, &snapshot.settings, snapshot.lifecycle)
            && snapshot.current_reminder.is_none()
            && snapshot.lifecycle != MonitoringLifecycle::Break)
    {
        hide_island_window(&app);
    }
    Ok(snapshot)
}

#[tauri::command]
pub(crate) fn get_statistics(
    context: State<'_, AppContext>,
    days: u32,
) -> Result<Vec<DailyStatistics>, String> {
    let database = context
        .database
        .lock()
        .map_err(|_| "数据库锁已损坏".to_string())?;
    database.statistics(days)
}

#[tauri::command]
pub(crate) fn get_behavior_history(
    context: State<'_, AppContext>,
    days: u32,
) -> Result<Vec<BehaviorHistoryEvent>, String> {
    context
        .database
        .lock()
        .map_err(|_| "数据库锁已损坏".to_string())?
        .behavior_history(days)
}

#[tauri::command]
pub(crate) fn get_behavior_history_for_date(
    context: State<'_, AppContext>,
    local_date: String,
) -> Result<Vec<BehaviorHistoryEvent>, String> {
    context
        .database
        .lock()
        .map_err(|_| "数据库锁已损坏".to_string())?
        .behavior_history_for_date(&local_date)
}

#[tauri::command]
pub(crate) fn set_island_menu_open(
    window: tauri::WebviewWindow,
    context: State<'_, AppContext>,
    open: bool,
) -> Result<(), String> {
    let detail_expanded = {
        let mut ui = context
            .island_ui
            .lock()
            .map_err(|_| "状态锁已损坏".to_string())?;
        let detail_expanded = ui.detail_expanded;
        ui.menu_open = open;
        detail_expanded
    };
    window
        .set_size(tauri::Size::Logical(tauri::LogicalSize::new(
            ISLAND_COMPACT_WIDTH,
            island_height_for_menu(open, detail_expanded),
        )))
        .map_err(|error| error.to_string())?;
    window
        .set_ignore_cursor_events(!open)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn mute_island(
    app: AppHandle,
    context: State<'_, AppContext>,
    minutes: Option<u64>,
    permanent: bool,
) -> Result<AppSnapshot, String> {
    if permanent {
        let mut core = context
            .core
            .lock()
            .map_err(|_| "状态锁已损坏".to_string())?;
        if !core.settings().island_permanent_close_enabled {
            return Err("请先在偏好设置中允许彻底关闭灵动岛".into());
        }
        let mut settings = core.settings().clone();
        settings.island_enabled = false;
        core.update_settings(settings)?;
        let snapshot = core.snapshot();
        persist(&context, &core)?;
        drop(core);
        hide_island_window(&app);
        return Ok(snapshot);
    }
    let duration = minutes.unwrap_or(10).clamp(1, 120);
    {
        let mut ui = context
            .island_ui
            .lock()
            .map_err(|_| "状态锁已损坏".to_string())?;
        ui.muted_until = Some(Instant::now() + Duration::from_secs(duration * 60));
        ui.menu_open = false;
        ui.detail_expanded = false;
        ui.away_notice = false;
        ui.behavior_notice_until = None;
    }
    hide_island_window(&app);
    let snapshot = context
        .core
        .lock()
        .map_err(|_| "状态锁已损坏".to_string())?
        .snapshot();
    Ok(snapshot)
}

#[tauri::command]
pub(crate) fn export_statistics(context: State<'_, AppContext>) -> Result<String, String> {
    let database = context
        .database
        .lock()
        .map_err(|_| "数据库锁已损坏".to_string())?;
    let rows = database.statistics(366)?;
    let mut csv = String::from(
        "日期,坐姿秒数,最长连续坐姿秒数,低头秒数,疑似手机秒数,休息次数,提醒次数,稍后提醒次数,关闭提醒次数,延后或关闭提醒次数,离座秒数,离座次数\n",
    );
    for item in rows {
        csv.push_str(&format!(
            "{},{},{},{},{},{},{},{},{},{},{},{}\n",
            item.local_date,
            item.seated_seconds,
            item.longest_seated_seconds,
            item.head_down_seconds,
            item.suspected_phone_seconds,
            item.break_count,
            item.reminder_count,
            item.snoozed_count,
            item.dismissed_count,
            item.deferred_reminder_count(),
            item.away_seconds,
            item.away_count,
        ));
    }
    csv.push_str("\n行为时间,行为类型,持续秒数,操作\n");
    for event in database.export_events(366)? {
        csv.push_str(&format!(
            "{},{},{},{}\n",
            event.started_at,
            event.event_type,
            event.duration_seconds,
            event.action.unwrap_or_default(),
        ));
    }
    Ok(csv)
}

#[tauri::command]
pub(crate) fn delete_local_data(context: State<'_, AppContext>) -> Result<AppSnapshot, String> {
    {
        let database = context
            .database
            .lock()
            .map_err(|_| "数据库锁已损坏".to_string())?;
        database.delete_statistics()?;
    }
    snapshot_after(&context, |core| {
        core.clear_statistics();
        Ok(())
    })
}

#[tauri::command]
pub(crate) async fn list_cameras(
    context: State<'_, AppContext>,
) -> Result<Vec<vision::CameraDevice>, String> {
    // Windows 某些摄像头驱动在枚举设备/检查权限时会阻塞数秒。放入阻塞线程池，
    // 避免查询期间冻结 WebView 主线程，造成入口按钮“无法点击”的错觉。
    let service = Arc::clone(&context.vision);
    tauri::async_runtime::spawn_blocking(move || service.list_cameras())
        .await
        .map_err(|error| format!("摄像头设备查询线程异常:{error}"))?
}

/// 启动摄像头与姿态检测管线；预览帧通过 `vision://preview` 事件推送。
#[tauri::command]
pub(crate) async fn start_vision(
    app: AppHandle,
    context: State<'_, AppContext>,
    camera_id: String,
    baseline: Option<f64>,
    head_down_enabled: bool,
) -> Result<(), String> {
    let service = Arc::clone(&context.vision);
    tauri::async_runtime::spawn_blocking(move || {
        service.start(&app, &camera_id, baseline, head_down_enabled)
    })
    .await
    .map_err(|error| format!("摄像头会话线程异常:{error}"))?
}

#[tauri::command]
pub(crate) async fn stop_vision(context: State<'_, AppContext>) -> Result<(), String> {
    let service = Arc::clone(&context.vision);
    tauri::async_runtime::spawn_blocking(move || service.stop())
        .await
        .map_err(|error| format!("摄像头会话线程异常:{error}"))?
}
