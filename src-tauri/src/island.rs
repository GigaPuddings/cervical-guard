use super::*;

fn island_state_lock_error() -> String {
    msg::ERR_STATE_LOCK.get(Language::ZhCn).to_string()
}

/// 灵动岛窗口的两种形态尺寸（逻辑像素）。
pub(crate) const ISLAND_COMPACT_WIDTH: f64 = 360.0;
pub(crate) const ISLAND_COMPACT_HEIGHT: f64 = 76.0;
pub(crate) const ISLAND_DETAIL_WIDTH: f64 = 360.0;
pub(crate) const ISLAND_DETAIL_HEIGHT: f64 = 176.0;
pub(crate) const ISLAND_MENU_HEIGHT: f64 = 166.0;
pub(crate) const MAIN_TRAY_ID: &str = "main-tray";
/// 屏幕顶部触发悬停展开的热区（逻辑像素）：以岛中心为圆心的半宽与高度。
/// 高度覆盖整个紧凑窗口 + 上方余量，避免光标快速划过窄热区时来不及展开。
pub(crate) const ISLAND_HOT_ZONE_HALF_WIDTH: f64 = 210.0;
pub(crate) const ISLAND_HOT_ZONE_HEIGHT: f64 = 104.0;
/// 详情卡片展开后的宽限期（毫秒）：在此期间即使光标短暂离开也不收起，
/// 避免窗口变形异步延迟导致"闪现即消失"。
pub(crate) const ISLAND_EXPAND_GRACE_MS: u64 = 1200;
/// 收起后冷却期（毫秒）：防止收起后立即被轮询循环重新展开。
/// 远短于宽限期，仅阻断 collapse→expand 的瞬态循环（防抖也会额外延迟）。
pub(crate) const ISLAND_COLLAPSE_COOLDOWN_MS: u64 = 200;
/// 检测到低头后，状态灵动岛的展示时长。
pub(crate) const BEHAVIOR_NOTICE_DURATION: Duration = Duration::from_secs(6);
/// 紧凑提醒中三个按钮的逻辑像素命中矩形。窗口其余区域保持原生鼠标穿透。
/// 数值与 public/island.html 的 360×76 布局保持一致。
pub(crate) const ISLAND_ACTION_RECTS: [(f64, f64, f64, f64); 3] = [
    (239.0, 24.0, 277.0, 52.0),
    (281.0, 24.0, 319.0, 52.0),
    (323.0, 24.0, 350.0, 52.0),
];
/// 休息灵动岛只有一个结束按钮，命中区域与页面右侧按钮保持一致。
pub(crate) const BREAK_ACTION_RECT: (f64, f64, f64, f64) = (282.0, 24.0, 350.0, 52.0);

pub(crate) fn island_action_hit(logical_x: f64, logical_y: f64) -> bool {
    ISLAND_ACTION_RECTS
        .iter()
        .any(|(left, top, right, bottom)| {
            logical_x >= *left && logical_x <= *right && logical_y >= *top && logical_y <= *bottom
        })
}

pub(crate) fn break_action_hit(logical_x: f64, logical_y: f64) -> bool {
    let (left, top, right, bottom) = BREAK_ACTION_RECT;
    logical_x >= left && logical_x <= right && logical_y >= top && logical_y <= bottom
}

/// 灵动岛当前展示的界面状态（由 Rust 侧各循环协同维护）。
pub(crate) struct IslandUiState {
    /// 悬停详情卡片是否处于展开状态。
    pub(crate) detail_expanded: bool,
    /// “用户已离开”提示是否正展示在灵动岛上。
    pub(crate) away_notice: bool,
    /// 低头状态卡片的有效期。状态卡片没有操作按钮，到期后自动关闭。
    pub(crate) behavior_notice_until: Option<Instant>,
    /// 详情卡片上次收起时间，用于防止收起后立即被轮询循环重新展开（闪现循环）。
    pub(crate) last_collapsed_at: Option<Instant>,
    /// 用户点击提醒操作后，在光标真正离开顶部热区前禁止再次展开详情。
    /// 否则提醒状态刚被清空，仍停在按钮上的光标会立刻触发详情窗口，
    /// 与前端关闭动画竞争并造成窗口跳动。
    pub(crate) hover_suppressed_until_exit: bool,
    /// 进入休息前主窗口是否可见且未最小化。
    pub(crate) restore_main_after_break: bool,
    /// 临时关闭截止时间；None 表示未临时关闭。
    pub(crate) muted_until: Option<Instant>,
    /// 本次运行内彻底关闭。持久开关仍由 AppSettings 控制是否允许该操作。
    pub(crate) muted_permanently: bool,
    /// 启动恢复出的 Paused 只是安全的初始状态，不应被当成本次用户操作弹出。
    /// 只有本次运行里用户主动暂停后，才允许展示暂停状态灵动岛。
    pub(crate) pause_status_requested: bool,
    pub(crate) menu_open: bool,
    pub(crate) active_break_event: Option<(String, Instant)>,
}

impl Default for IslandUiState {
    fn default() -> Self {
        Self {
            detail_expanded: false,
            away_notice: false,
            behavior_notice_until: None,
            last_collapsed_at: None,
            hover_suppressed_until_exit: false,
            restore_main_after_break: false,
            muted_until: None,
            muted_permanently: false,
            pause_status_requested: false,
            menu_open: false,
            active_break_event: None,
        }
    }
}

impl IslandUiState {
    pub(crate) fn island_available(&mut self, settings: &AppSettings) -> bool {
        if !settings.island_enabled || self.muted_permanently {
            return false;
        }
        if self
            .muted_until
            .is_some_and(|deadline| Instant::now() < deadline)
        {
            return false;
        }
        self.muted_until = None;
        true
    }
    pub(crate) fn remember_main_visibility_for_break(&mut self, visible: bool) {
        self.restore_main_after_break = visible;
    }

    pub(crate) fn take_main_restore_after_break(&mut self) -> bool {
        std::mem::take(&mut self.restore_main_after_break)
    }

    pub(crate) fn suppress_hover_until_cursor_exit(&mut self) {
        self.detail_expanded = false;
        self.away_notice = false;
        self.behavior_notice_until = None;
        self.menu_open = false;
        self.last_collapsed_at = Some(Instant::now());
        self.hover_suppressed_until_exit = true;
    }

    /// 返回本轮是否应继续屏蔽悬停。光标首次离开时解除后续屏蔽，
    /// 但当前这一轮仍不展开，确保必须再次进入热区才会触发详情。
    pub(crate) fn consume_hover_suppression(&mut self, in_hot_zone: bool) -> bool {
        if !self.hover_suppressed_until_exit {
            return false;
        }
        if !in_hot_zone {
            self.hover_suppressed_until_exit = false;
        }
        true
    }

    pub(crate) fn behavior_notice_active(&self) -> bool {
        self.behavior_notice_until
            .is_some_and(|deadline| Instant::now() < deadline)
    }

    pub(crate) fn blocks_persistent_status(&self) -> bool {
        self.detail_expanded || self.away_notice || self.menu_open || self.behavior_notice_active()
    }

    pub(crate) fn request_pause_status(&mut self) {
        self.pause_status_requested = true;
    }

    pub(crate) fn clear_pause_status_request(&mut self) {
        self.pause_status_requested = false;
    }

    pub(crate) fn status_enabled(
        &self,
        settings: &AppSettings,
        lifecycle: MonitoringLifecycle,
    ) -> bool {
        island_status_enabled(settings, lifecycle)
            && (lifecycle != MonitoringLifecycle::Paused || self.pause_status_requested)
    }

    /// 核心状态已经完成画面质量和人物置信度门控；一旦收到该稳定返回信号，
    /// 立即结束离座卡片，避免与坐姿状态机串联出额外的 4～5 秒等待。
    pub(crate) fn confirm_return_after_away(&mut self, person_confirmed: bool) -> bool {
        if !self.away_notice || !person_confirmed {
            return false;
        }
        self.away_notice = false;
        true
    }
}

pub(crate) fn island_feature_settings(
    app: &AppHandle,
    feature: impl FnOnce(&AppSettings) -> bool,
) -> Option<AppSettings> {
    let Some(context) = app.try_state::<AppContext>() else {
        return None;
    };
    let settings = match context.core.lock() {
        Ok(core) => core.settings().clone(),
        Err(_) => return None,
    };
    context
        .island_ui
        .lock()
        .is_ok_and(|mut ui| ui.island_available(&settings) && feature(&settings))
        .then_some(settings)
}

pub(crate) fn island_status_feature_enabled(
    app: &AppHandle,
    lifecycle: MonitoringLifecycle,
) -> bool {
    let Some(context) = app.try_state::<AppContext>() else {
        return false;
    };
    let settings = match context.core.lock() {
        Ok(core) => core.settings().clone(),
        Err(_) => return false,
    };
    context.island_ui.lock().is_ok_and(|mut ui| {
        ui.island_available(&settings) && ui.status_enabled(&settings, lifecycle)
    })
}

pub(crate) fn island_hover_status_feature_enabled(
    app: &AppHandle,
    lifecycle: MonitoringLifecycle,
) -> bool {
    let Some(context) = app.try_state::<AppContext>() else {
        return false;
    };
    let settings = match context.core.lock() {
        Ok(core) => core.settings().clone(),
        Err(_) => return false,
    };
    island_hover_status_enabled_for_context(&context, &settings, lifecycle)
}

pub(crate) fn island_status_enabled_for_context(
    context: &AppContext,
    settings: &AppSettings,
    lifecycle: MonitoringLifecycle,
) -> bool {
    context
        .island_ui
        .lock()
        .is_ok_and(|mut ui| ui.island_available(settings) && ui.status_enabled(settings, lifecycle))
}

pub(crate) fn island_hover_status_enabled_for_context(
    context: &AppContext,
    settings: &AppSettings,
    lifecycle: MonitoringLifecycle,
) -> bool {
    context.island_ui.lock().is_ok_and(|mut ui| {
        ui.island_available(settings) && island_hover_status_enabled(settings, lifecycle)
    })
}

pub(crate) fn island_content_allowed_for_state(
    content_windows_hidden: bool,
    allow_with_main_window: bool,
    fullscreen_notifications: bool,
    external_fullscreen_active: bool,
) -> bool {
    (content_windows_hidden || allow_with_main_window)
        && (fullscreen_notifications || !external_fullscreen_active)
}

pub(crate) fn island_blocked_by_external_fullscreen(settings: &AppSettings) -> bool {
    !settings.fullscreen_notifications && external_fullscreen_window_active()
}

pub(crate) fn island_content_allowed(app: &AppHandle, settings: &AppSettings) -> bool {
    island_content_allowed_for_state(
        all_content_windows_hidden(app),
        settings.island_allow_with_main_window,
        settings.fullscreen_notifications,
        external_fullscreen_window_active(),
    )
}

pub(crate) fn island_surface_needed(
    settings: &AppSettings,
    status_enabled: bool,
    reminder_active: bool,
    break_active: bool,
    behavior_notice_active: bool,
    away_notice: bool,
    menu_open: bool,
    muted: bool,
) -> bool {
    settings.island_enabled
        && !muted
        && ((reminder_active && settings.island_reminder_enabled)
            || (break_active && settings.island_break_enabled)
            || (behavior_notice_active && settings.island_head_down_enabled)
            || (away_notice && settings.island_away_enabled)
            || status_enabled
            || menu_open)
}

pub(crate) fn island_status_enabled(
    settings: &AppSettings,
    lifecycle: MonitoringLifecycle,
) -> bool {
    match lifecycle {
        MonitoringLifecycle::Monitoring | MonitoringLifecycle::Degraded => {
            settings.island_persistent_status_enabled
        }
        MonitoringLifecycle::Paused => settings.island_paused_status_enabled,
        _ => false,
    }
}

/// 悬停详情与“持续检测状态”常驻卡片是两个独立能力。监测运行时只要灵动岛
/// 总开关开启，就保留顶部热区；关闭常驻状态只让紧凑卡片默认隐藏。
pub(crate) fn island_hover_status_enabled(
    settings: &AppSettings,
    lifecycle: MonitoringLifecycle,
) -> bool {
    settings.island_enabled
        && matches!(
            lifecycle,
            MonitoringLifecycle::Monitoring | MonitoringLifecycle::Degraded
        )
}

pub(crate) fn island_height_for_menu(open: bool, detail_expanded: bool) -> f64 {
    if open {
        ISLAND_MENU_HEIGHT
    } else if detail_expanded {
        ISLAND_DETAIL_HEIGHT
    } else {
        ISLAND_COMPACT_HEIGHT
    }
}

/// 计算灵动岛窗口左上角位置（逻辑像素）：主显示器顶部居中。
pub(crate) fn island_origin(app: &AppHandle, width: f64) -> (f64, f64) {
    if let Ok(Some(monitor)) = app.primary_monitor() {
        let scale = monitor.scale_factor();
        let monitor_width = monitor.size().width as f64 / scale;
        let monitor_x = monitor.position().x as f64 / scale;
        let monitor_y = monitor.position().y as f64 / scale;
        (monitor_x + (monitor_width - width) / 2.0, monitor_y + 16.0)
    } else {
        (100.0, 16.0)
    }
}

/// 调整灵动岛窗口尺寸并重新居中（窗口已存在时直接变形，保持顶部锚定）。
pub(crate) fn resize_island(app: &AppHandle, width: f64, height: f64) {
    if let Some(window) = app.get_webview_window("reminder-island") {
        let (x, y) = island_origin(app, width);
        let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(width, height)));
        let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(x, y)));
    }
}

/// 除灵动岛自身外，所有内容窗口是否都不可见。最小化等同于隐藏，因为它
/// 不应继续占用顶部热区；状态查询失败时保守地视为可见，避免误弹浮窗。
pub(crate) fn all_content_windows_hidden(app: &AppHandle) -> bool {
    app.webview_windows()
        .into_iter()
        .filter(|(label, _)| label != "reminder-island")
        .all(|(_, window)| match window.is_visible() {
            Ok(false) => true,
            Ok(true) => window.is_minimized().unwrap_or(false),
            Err(_) => false,
        })
}

#[cfg(target_os = "windows")]
pub(crate) fn external_fullscreen_window_active() -> bool {
    use std::mem::size_of;
    use windows::Win32::Foundation::RECT;
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowRect, GetWindowThreadProcessId, IsWindowVisible,
    };

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_invalid() || !IsWindowVisible(hwnd).as_bool() {
            return false;
        }

        let mut process_id = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut process_id));
        if process_id == std::process::id() {
            return false;
        }

        let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        if monitor.is_invalid() {
            return false;
        }

        let mut monitor_info = MONITORINFO {
            cbSize: size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if !GetMonitorInfoW(monitor, &mut monitor_info).as_bool() {
            return false;
        }

        let mut rect = RECT::default();
        if GetWindowRect(hwnd, &mut rect).is_err() {
            return false;
        }

        let monitor_rect = monitor_info.rcMonitor;
        rect.left <= monitor_rect.left
            && rect.top <= monitor_rect.top
            && rect.right >= monitor_rect.right
            && rect.bottom >= monitor_rect.bottom
    }
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn external_fullscreen_window_active() -> bool {
    false
}

/// 控制灵动岛窗口可见性及命中测试。被动状态卡片始终穿透；正式提醒也先
/// 穿透，后台光标轮询只会在光标进入三个按钮矩形时短暂开启窗口命中。
pub(crate) fn set_reminder_island_visible(
    app: &AppHandle,
    visible: bool,
    interactive: bool,
) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("reminder-island") {
        window.set_ignore_cursor_events(!interactive)?;
        if visible {
            window.show()?;
            window.set_always_on_top(true)?;
        } else {
            window.hide()?;
        }
        return Ok(());
    }

    // 隐藏一个尚未创建的灵动岛时无需创建 WebView。窗口只在某项灵动岛功能
    // 真正需要展示时按需创建，未启用功能不会注册页面事件或占用 WebView。
    if !visible {
        return Ok(());
    }

    let width = ISLAND_COMPACT_WIDTH;
    let height = ISLAND_COMPACT_HEIGHT;
    let (x, y) = island_origin(app, width);

    let window = WebviewWindowBuilder::new(
        app,
        "reminder-island",
        WebviewUrl::CustomProtocol(
            "guard://localhost/reminder-island"
                .parse()
                .expect("动态岛地址必须有效"),
        ),
    )
    .title("健康提醒")
    .inner_size(width, height)
    .position(x, y)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .focused(false)
    .visible(visible)
    .shadow(false)
    .build()?;
    window.set_ignore_cursor_events(!interactive)?;
    Ok(())
}

/// 悬停模式需要一个隐藏的 WebView 来接收详情事件和提供窗口坐标，但不能像
/// “持续检测状态”那样创建后立即显示紧凑卡片。
pub(crate) fn ensure_hidden_reminder_island(app: &AppHandle) -> tauri::Result<()> {
    if app.get_webview_window("reminder-island").is_some() {
        return Ok(());
    }
    let width = ISLAND_COMPACT_WIDTH;
    let height = ISLAND_COMPACT_HEIGHT;
    let (x, y) = island_origin(app, width);
    let window = WebviewWindowBuilder::new(
        app,
        "reminder-island",
        WebviewUrl::CustomProtocol(
            "guard://localhost/reminder-island"
                .parse()
                .expect("动态岛地址必须有效"),
        ),
    )
    .title("健康提醒")
    .inner_size(width, height)
    .position(x, y)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .focused(false)
    .visible(false)
    .shadow(false)
    .build()?;
    window.set_ignore_cursor_events(true)?;
    Ok(())
}

/// 显示并聚焦主窗口。窗口在后台隐藏或最小化时都恢复到可交互状态。
pub(crate) fn show_main_window(app: &AppHandle) {
    let break_active = if let Some(context) = app.try_state::<AppContext>() {
        if let Ok(mut ui) = context.island_ui.lock() {
            ui.suppress_hover_until_cursor_exit();
        }
        context
            .core
            .lock()
            .ok()
            .is_some_and(|mut core| core.snapshot().lifecycle == MonitoringLifecycle::Break)
    } else {
        false
    };
    let Some(window) = app.get_webview_window("main") else {
        eprintln!("[window] main window not found");
        return;
    };
    let app_handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if !break_active {
            let _ = set_reminder_island_visible(&app_handle, false, false);
        }
        if let Err(error) = window.show() {
            eprintln!("[window] show main window failed: {error}");
            return;
        }
        if window.is_minimized().unwrap_or(false) {
            if let Err(error) = window.unminimize() {
                eprintln!("[window] unminimize main window failed: {error}");
            }
        }
        if let Err(error) = window.set_focus() {
            eprintln!("[window] focus main window failed: {error}");
        }
    });
}

/// 提醒按钮完成操作后，等待鼠标离开顶部热区再允许悬停详情重新展开。
pub(crate) fn suppress_island_hover_until_cursor_exit(context: &AppContext) -> Result<(), String> {
    let mut ui = context
        .island_ui
        .lock()
        .map_err(|_| island_state_lock_error())?;
    ui.suppress_hover_until_cursor_exit();
    Ok(())
}

/// 展示正式提醒。提示音选项必须由调用方在释放核心状态锁前解析并作为值传入；
/// 本函数不得再次获取 `AppContext::core`，否则观测触发提醒时会发生同线程锁重入死锁。
pub(crate) fn present_reminder_island(
    app: &AppHandle,
    reminder: model::ReminderPayload,
    sound: Option<ReminderSound>,
) {
    play_reminder_sound(sound);
    let app_handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let Some(settings) =
            island_feature_settings(&app_handle, |settings| settings.island_reminder_enabled)
        else {
            let _ = set_reminder_island_visible(&app_handle, false, false);
            return;
        };
        // 只有在内容窗口策略与外部全屏策略都允许时才使用独立屏幕级灵动岛。
        // 内容窗口可见时只更新页面自身状态，不渲染任何页面内“伪灵动岛”。
        if !island_content_allowed(&app_handle, &settings) {
            let _ = set_reminder_island_visible(&app_handle, false, false);
            return;
        }
        // 提醒优先级最高：收回详情卡片 / 离开提示，恢复紧凑形态。
        if let Some(context) = app_handle.try_state::<AppContext>() {
            if let Ok(mut ui) = context.island_ui.lock() {
                ui.detail_expanded = false;
                ui.away_notice = false;
                ui.behavior_notice_until = None;
                ui.hover_suppressed_until_exit = false;
            }
        }
        resize_island(&app_handle, ISLAND_COMPACT_WIDTH, ISLAND_COMPACT_HEIGHT);
        if let Err(error) = set_reminder_island_visible(&app_handle, true, false) {
            eprintln!("显示悬浮提醒失败: {error}");
            return;
        }
        let _ = app_handle.emit_to("reminder-island", "reminder://triggered", reminder);
    });
}

/// 进入休息时隐藏主窗口，再用可交互的紧凑灵动岛展示倒计时；
/// 灵动岛会一直保留到用户明确调用 `end_break`。
pub(crate) fn present_break_island(app: &AppHandle, snapshot: &AppSnapshot) {
    let app_handle = app.clone();
    let payload = snapshot.clone();
    let _ = app.run_on_main_thread(move || {
        let Some(settings) =
            island_feature_settings(&app_handle, |settings| settings.island_break_enabled)
        else {
            let _ = set_reminder_island_visible(&app_handle, false, false);
            return;
        };
        if !island_content_allowed(&app_handle, &settings) {
            let _ = set_reminder_island_visible(&app_handle, false, false);
            return;
        }
        if let Some(context) = app_handle.try_state::<AppContext>() {
            if let Ok(mut ui) = context.island_ui.lock() {
                ui.detail_expanded = false;
                ui.away_notice = false;
                ui.behavior_notice_until = None;
                ui.hover_suppressed_until_exit = false;
            }
        }
        if !settings.island_allow_with_main_window {
            if let Some(main) = app_handle.get_webview_window("main") {
                if let Err(error) = main.hide() {
                    eprintln!("进入休息时隐藏主窗口失败: {error}");
                }
            }
        }
        resize_island(&app_handle, ISLAND_COMPACT_WIDTH, ISLAND_COMPACT_HEIGHT);
        if let Err(error) = set_reminder_island_visible(&app_handle, true, false) {
            eprintln!("显示休息灵动岛失败: {error}");
            return;
        }
        let _ = app_handle.emit_to("reminder-island", "island://break", payload);
    });
}

/// 展示一次姿态状态变化。它与需要用户操作的正式提醒不同：始终鼠标穿透，
/// 即使主界面可见也会短暂展示，并在 6 秒后由静态页面自动关闭。
pub(crate) fn present_behavior_notice(app: &AppHandle, snapshot: &AppSnapshot) {
    if snapshot.current_reminder.is_some() || snapshot.behavior != BehaviorState::HeadDown {
        return;
    }

    let app_handle = app.clone();
    let payload = snapshot.clone();
    let _ = app.run_on_main_thread(move || {
        let Some(settings) =
            island_feature_settings(&app_handle, |settings| settings.island_head_down_enabled)
        else {
            return;
        };
        if !island_content_allowed(&app_handle, &settings) {
            return;
        }
        if let Some(context) = app_handle.try_state::<AppContext>() {
            let reminder_active = context
                .core
                .lock()
                .ok()
                .is_some_and(|core| core.current_reminder().is_some());
            if reminder_active {
                return;
            }
            if let Ok(mut ui) = context.island_ui.lock() {
                ui.detail_expanded = false;
                ui.away_notice = false;
                // 页面在第 6 秒开始 170ms 的收起动画；Rust 侧多保留一小段保护期，
                // 防止动画期间顶部热区把状态卡片抢切成详情卡片。
                ui.behavior_notice_until =
                    Some(Instant::now() + BEHAVIOR_NOTICE_DURATION + Duration::from_millis(300));
                ui.hover_suppressed_until_exit = false;
            }
        }

        resize_island(&app_handle, ISLAND_COMPACT_WIDTH, ISLAND_COMPACT_HEIGHT);
        if let Err(error) = set_reminder_island_visible(&app_handle, true, false) {
            eprintln!("显示姿态状态失败: {error}");
            return;
        }
        let _ = app_handle.emit_to("reminder-island", "island://behavior", payload);
    });
}

/// 在主线程上展示“用户已离开”提示卡片（复用提醒卡片的紧凑形态）。
pub(crate) fn present_away_notice(app: &AppHandle, snapshot: &AppSnapshot) {
    let app_handle = app.clone();
    let payload = snapshot.clone();
    let _ = app.run_on_main_thread(move || {
        let Some(settings) =
            island_feature_settings(&app_handle, |settings| settings.island_away_enabled)
        else {
            return;
        };
        if !island_content_allowed(&app_handle, &settings) {
            let _ = set_reminder_island_visible(&app_handle, false, false);
            return;
        }
        if let Some(context) = app_handle.try_state::<AppContext>() {
            if let Ok(mut ui) = context.island_ui.lock() {
                ui.behavior_notice_until = None;
                ui.hover_suppressed_until_exit = false;
            }
        }
        resize_island(&app_handle, ISLAND_COMPACT_WIDTH, ISLAND_COMPACT_HEIGHT);
        if let Err(error) = set_reminder_island_visible(&app_handle, true, false) {
            eprintln!("显示离座提示失败: {error}");
            return;
        }
        let _ = app_handle.emit_to("reminder-island", "island://away", payload);
    });
}

/// 主线程任务可能晚于触发它的状态变更执行。只允许仍与核心当前生命周期一致、
/// 且没有更高优先级提醒的旧快照继续绘制，避免“开始休息”后又被旧状态卡覆盖。
pub(crate) fn island_status_payload_is_current(
    payload_lifecycle: MonitoringLifecycle,
    current_lifecycle: MonitoringLifecycle,
    has_reminder: bool,
) -> bool {
    payload_lifecycle == current_lifecycle
        && current_lifecycle != MonitoringLifecycle::Break
        && !has_reminder
}

pub(crate) fn current_status_payload_matches(app: &AppHandle, payload: &AppSnapshot) -> bool {
    app.try_state::<AppContext>()
        .and_then(|context| {
            context.core.lock().ok().map(|mut core| {
                let current = core.snapshot();
                island_status_payload_is_current(
                    payload.lifecycle,
                    current.lifecycle,
                    current.current_reminder.is_some(),
                )
            })
        })
        .unwrap_or(false)
}

/// 在主线程上展开悬停详情卡片（窗口变形 + 通知前端渲染）。
pub(crate) fn present_island_detail(app: &AppHandle, snapshot: &AppSnapshot) {
    let app_handle = app.clone();
    let payload = snapshot.clone();
    let schedule_result = app.run_on_main_thread(move || {
        if !current_status_payload_matches(&app_handle, &payload)
            || !island_hover_status_feature_enabled(&app_handle, payload.lifecycle)
        {
            return;
        }
        if !island_content_allowed(&app_handle, &payload.settings) {
            let _ = set_reminder_island_visible(&app_handle, false, false);
            return;
        }
        resize_island(&app_handle, ISLAND_DETAIL_WIDTH, ISLAND_DETAIL_HEIGHT);
        if let Err(error) = set_reminder_island_visible(&app_handle, true, false) {
            eprintln!("显示灵动岛状态失败: {error}");
            return;
        }
        let _ = app_handle.emit_to("reminder-island", "island://detail", payload);
    });
    if let Err(e) = &schedule_result {
        eprintln!("调度灵动岛状态失败: {e:?}");
    }
}

/// 持续检测状态使用紧凑形态常驻；提醒、休息和行为提示在同一个窗口中覆盖它，
/// 因而不会出现多个顶部浮层竞争。是否可与主窗口共存仍由统一窗口策略决定。
pub(crate) fn present_persistent_status(app: &AppHandle, snapshot: &AppSnapshot) {
    let app_handle = app.clone();
    let payload = snapshot.clone();
    let _ = app.run_on_main_thread(move || {
        if !current_status_payload_matches(&app_handle, &payload)
            || !island_status_feature_enabled(&app_handle, payload.lifecycle)
        {
            return;
        }
        if !island_content_allowed(&app_handle, &payload.settings) {
            let _ = set_reminder_island_visible(&app_handle, false, false);
            return;
        }
        // 详情、离座、行为提示或关闭菜单展示期间不能被周期性状态刷新改回
        // 76px 紧凑尺寸；否则 DOM 仍是详情页，原生窗口却已收窄，形成裁切残影。
        let status_blocked = app_handle
            .try_state::<AppContext>()
            .and_then(|context| {
                context
                    .island_ui
                    .lock()
                    .ok()
                    .map(|ui| ui.blocks_persistent_status())
            })
            .unwrap_or(true);
        if status_blocked {
            return;
        }
        resize_island(&app_handle, ISLAND_COMPACT_WIDTH, ISLAND_COMPACT_HEIGHT);
        if set_reminder_island_visible(&app_handle, true, false).is_ok() {
            let _ = app_handle.emit_to("reminder-island", "island://status", payload);
        }
    });
}

/// 前端在详情卡片收起动画结束后调用：恢复紧凑尺寸，并按需隐藏窗口。
#[tauri::command]
pub(crate) fn collapse_island_detail(
    app: AppHandle,
    context: State<'_, AppContext>,
) -> Result<(), String> {
    let (snapshot, has_reminder, break_active, away_notice) = {
        let mut core = context.core.lock().map_err(|_| island_state_lock_error())?;
        let ui = context
            .island_ui
            .lock()
            .map_err(|_| island_state_lock_error())?;
        let snapshot = core.snapshot();
        (
            snapshot.clone(),
            core.current_reminder().is_some(),
            snapshot.lifecycle == MonitoringLifecycle::Break,
            ui.away_notice,
        )
    };
    {
        let mut ui = context
            .island_ui
            .lock()
            .map_err(|_| island_state_lock_error())?;
        ui.detail_expanded = false;
        ui.last_collapsed_at = Some(Instant::now());
    }
    let status_enabled =
        island_status_enabled_for_context(&context, &snapshot.settings, snapshot.lifecycle);
    let app_handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        resize_island(&app_handle, ISLAND_COMPACT_WIDTH, ISLAND_COMPACT_HEIGHT);
        // 提醒或离开提示仍在时保留窗口（前端已切回对应卡片），否则隐藏。
        if status_enabled && !has_reminder && !away_notice {
            let _ = set_reminder_island_visible(&app_handle, true, false);
            let _ = app_handle.emit_to("reminder-island", "island://status", snapshot);
        } else if !has_reminder && !break_active && !away_notice {
            if let Some(window) = app_handle.get_webview_window("reminder-island") {
                let _ = window.hide();
            }
        }
    });
    Ok(())
}

/// 隐藏灵动岛窗口（离开提示失效时调用，窗口隐藏由前端动画完成后自行处理亦可）。
pub(crate) fn hide_island_window(app: &AppHandle) {
    let app_handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let _ = set_reminder_island_visible(&app_handle, false, false);
    });
}

/// 姿态状态卡片的 6 秒计时结束后由灵动岛页面调用。清理 Rust 侧有效期，
/// 并要求光标先离开顶部热区，避免卡片消失后立即误展开详情。
#[tauri::command]
pub(crate) fn dismiss_behavior_notice(
    app: AppHandle,
    context: State<'_, AppContext>,
) -> Result<(), String> {
    let snapshot = context
        .core
        .lock()
        .map_err(|_| island_state_lock_error())?
        .snapshot();
    {
        let mut ui = context
            .island_ui
            .lock()
            .map_err(|_| island_state_lock_error())?;
        ui.suppress_hover_until_cursor_exit();
    }
    if island_status_enabled_for_context(&context, &snapshot.settings, snapshot.lifecycle) {
        present_persistent_status(&app, &snapshot);
    } else {
        hide_island_window(&app);
    }
    Ok(())
}

/// 鼠标经过穿透区域时通知前端更新局部透视圆心。坐标变化不足 2px 时跳过，
/// 避免 120ms 光标轮询向 WebView 灌入没有视觉收益的重复事件。
pub(crate) fn update_island_peek_state(
    app: &AppHandle,
    current: &mut Option<(f64, f64)>,
    next: Option<(f64, f64)>,
) {
    let unchanged = match (*current, next) {
        (None, None) => true,
        (Some((old_x, old_y)), Some((x, y))) => (old_x - x).powi(2) + (old_y - y).powi(2) < 4.0,
        _ => false,
    };
    if unchanged {
        return;
    }
    *current = next;
    let payload = match next {
        Some((x, y)) => serde_json::json!({ "active": true, "x": x, "y": y }),
        None => serde_json::json!({ "active": false, "x": 0.0, "y": 0.0 }),
    };
    let _ = app.emit_to("reminder-island", "island://peek-through", payload);
}

pub(crate) fn update_island_hover_state(app: &AppHandle, current: &mut bool, next: bool) {
    if *current == next {
        return;
    }
    *current = next;
    let _ = app.emit_to("reminder-island", "island://pointer-hover", next);
}

#[cfg(test)]
mod tests;
