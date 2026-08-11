mod core;
mod database;
mod model;
mod vision;

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use core::RuntimeState;
use database::Database;
use model::{
    AppSettings, AppSnapshot, BehaviorState, CalibrationResult, DailyStatistics,
    MonitoringLifecycle, MonitoringMode, PermissionState, VisionObservation,
};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_autostart::ManagerExt;
use vision::VisionService;

/// 灵动岛窗口的两种形态尺寸（逻辑像素）。
const ISLAND_COMPACT_WIDTH: f64 = 360.0;
const ISLAND_COMPACT_HEIGHT: f64 = 76.0;
const ISLAND_DETAIL_WIDTH: f64 = 360.0;
const ISLAND_DETAIL_HEIGHT: f64 = 176.0;
/// 屏幕顶部触发悬停展开的热区（逻辑像素）：以岛中心为圆心的半宽与高度。
/// 高度覆盖整个紧凑窗口 + 上方余量，避免光标快速划过窄热区时来不及展开。
const ISLAND_HOT_ZONE_HALF_WIDTH: f64 = 210.0;
const ISLAND_HOT_ZONE_HEIGHT: f64 = 104.0;
/// 详情卡片展开后的宽限期（毫秒）：在此期间即使光标短暂离开也不收起，
/// 避免窗口变形异步延迟导致"闪现即消失"。
const ISLAND_EXPAND_GRACE_MS: u64 = 1200;
/// 收起后冷却期（毫秒）：防止收起后立即被轮询循环重新展开。
/// 远短于宽限期，仅阻断 collapse→expand 的瞬态循环（防抖也会额外延迟）。
const ISLAND_COLLAPSE_COOLDOWN_MS: u64 = 200;
/// 检测到低头后，状态灵动岛的展示时长。
const BEHAVIOR_NOTICE_DURATION: Duration = Duration::from_secs(6);
/// 紧凑提醒中三个按钮的逻辑像素命中矩形。窗口其余区域保持原生鼠标穿透。
/// 数值与 public/island.html 的 360×76 布局保持一致。
const ISLAND_ACTION_RECTS: [(f64, f64, f64, f64); 3] = [
    (239.0, 24.0, 277.0, 52.0),
    (281.0, 24.0, 319.0, 52.0),
    (323.0, 24.0, 350.0, 52.0),
];

fn island_action_hit(logical_x: f64, logical_y: f64) -> bool {
    ISLAND_ACTION_RECTS
        .iter()
        .any(|(left, top, right, bottom)| {
            logical_x >= *left && logical_x <= *right && logical_y >= *top && logical_y <= *bottom
        })
}

/// 灵动岛当前展示的界面状态（由 Rust 侧各循环协同维护）。
pub struct IslandUiState {
    /// 悬停详情卡片是否处于展开状态。
    detail_expanded: bool,
    /// “用户已离开”提示是否正展示在灵动岛上。
    away_notice: bool,
    /// 低头状态卡片的有效期。状态卡片没有操作按钮，到期后自动关闭。
    behavior_notice_until: Option<Instant>,
    /// 详情卡片上次收起时间，用于防止收起后立即被轮询循环重新展开（闪现循环）。
    last_collapsed_at: Option<Instant>,
    /// 用户点击提醒操作后，在光标真正离开顶部热区前禁止再次展开详情。
    /// 否则提醒状态刚被清空，仍停在按钮上的光标会立刻触发详情窗口，
    /// 与前端关闭动画竞争并造成窗口跳动。
    hover_suppressed_until_exit: bool,
}

impl Default for IslandUiState {
    fn default() -> Self {
        Self {
            detail_expanded: false,
            away_notice: false,
            behavior_notice_until: None,
            last_collapsed_at: None,
            hover_suppressed_until_exit: false,
        }
    }
}

impl IslandUiState {
    fn suppress_hover_until_cursor_exit(&mut self) {
        self.detail_expanded = false;
        self.away_notice = false;
        self.behavior_notice_until = None;
        self.last_collapsed_at = Some(Instant::now());
        self.hover_suppressed_until_exit = true;
    }

    /// 返回本轮是否应继续屏蔽悬停。光标首次离开时解除后续屏蔽，
    /// 但当前这一轮仍不展开，确保必须再次进入热区才会触发详情。
    fn consume_hover_suppression(&mut self, in_hot_zone: bool) -> bool {
        if !self.hover_suppressed_until_exit {
            return false;
        }
        if !in_hot_zone {
            self.hover_suppressed_until_exit = false;
        }
        true
    }

    fn behavior_notice_active(&self) -> bool {
        self.behavior_notice_until
            .is_some_and(|deadline| Instant::now() < deadline)
    }
}

fn reminder_sound_enabled(settings: &AppSettings) -> bool {
    // 会议模式的产品承诺是“安静通知”，优先级高于声音开关。
    settings.sound_enabled && !settings.meeting_mode
}

#[cfg(target_os = "windows")]
fn play_notification_sound() {
    #[link(name = "user32")]
    extern "system" {
        fn MessageBeep(sound_type: u32) -> i32;
    }

    // MB_ICONASTERISK：使用 Windows 当前声音方案中的“信息”提示音；若系统
    // 已静音或禁用了该声音，尊重系统级设置。
    unsafe {
        let _ = MessageBeep(0x0000_0040);
    }
}

#[cfg(not(target_os = "windows"))]
fn play_notification_sound() {}

pub struct AppContext {
    core: Mutex<RuntimeState>,
    database: Mutex<Database>,
    vision: Arc<VisionService>,
    island_ui: Mutex<IslandUiState>,
}

/// 计算灵动岛窗口左上角位置（逻辑像素）：主显示器顶部居中。
fn island_origin(app: &AppHandle, width: f64) -> (f64, f64) {
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
fn resize_island(app: &AppHandle, width: f64, height: f64) {
    if let Some(window) = app.get_webview_window("reminder-island") {
        let (x, y) = island_origin(app, width);
        let size_result =
            window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(width, height)));
        let pos_result =
            window.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(x, y)));
        eprintln!("[island] resize_island: pos=({x},{y}) size={width}x{height} set_size={size_result:?} set_pos={pos_result:?}");
    } else {
        eprintln!("[island] resize_island: window NOT FOUND");
    }
}

/// 除灵动岛自身外，所有内容窗口是否都不可见。最小化等同于隐藏，因为它
/// 不应继续占用顶部热区；状态查询失败时保守地视为可见，避免误弹浮窗。
fn all_content_windows_hidden(app: &AppHandle) -> bool {
    app.webview_windows()
        .into_iter()
        .filter(|(label, _)| label != "reminder-island")
        .all(|(_, window)| match window.is_visible() {
            Ok(false) => true,
            Ok(true) => window.is_minimized().unwrap_or(false),
            Err(_) => false,
        })
}

/// 控制灵动岛窗口可见性及命中测试。被动状态卡片始终穿透；正式提醒也先
/// 穿透，后台光标轮询只会在光标进入三个按钮矩形时短暂开启窗口命中。
fn set_reminder_island_visible(
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

/// 显示并聚焦主窗口。窗口在后台隐藏或最小化时都恢复到可交互状态。
fn show_main_window(app: &AppHandle) {
    if let Some(context) = app.try_state::<AppContext>() {
        if let Ok(mut ui) = context.island_ui.lock() {
            ui.suppress_hover_until_cursor_exit();
        }
    }
    let Some(window) = app.get_webview_window("main") else {
        eprintln!("[window] main window not found");
        return;
    };
    let app_handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let _ = set_reminder_island_visible(&app_handle, false, false);
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
fn suppress_island_hover_until_cursor_exit(context: &AppContext) -> Result<(), String> {
    let mut ui = context
        .island_ui
        .lock()
        .map_err(|_| "状态锁已损坏".to_string())?;
    ui.suppress_hover_until_cursor_exit();
    Ok(())
}

/// 展示正式提醒。声音策略必须由调用方在释放核心状态锁前读取并作为值传入；
/// 本函数不得再次获取 `AppContext::core`，否则观测触发提醒时会发生同线程锁重入死锁。
fn present_reminder_island(app: &AppHandle, reminder: model::ReminderPayload, sound_enabled: bool) {
    if sound_enabled {
        play_notification_sound();
    }
    let app_handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        // 只有所有内容窗口（包括主页面和休息页）都隐藏/最小化后才使用
        // 独立的屏幕级灵动岛；内容窗口可见时只更新页面自身状态，不渲染
        // 任何页面内“伪灵动岛”。
        if !all_content_windows_hidden(&app_handle) {
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

/// 展示一次姿态状态变化。它与需要用户操作的正式提醒不同：始终鼠标穿透，
/// 即使主界面可见也会短暂展示，并在 6 秒后由静态页面自动关闭。
fn present_behavior_notice(app: &AppHandle, snapshot: &AppSnapshot) {
    if snapshot.current_reminder.is_some() || snapshot.behavior != BehaviorState::HeadDown {
        return;
    }

    let app_handle = app.clone();
    let payload = snapshot.clone();
    let _ = app.run_on_main_thread(move || {
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
fn present_away_notice(app: &AppHandle, snapshot: &AppSnapshot) {
    let app_handle = app.clone();
    let payload = snapshot.clone();
    let _ = app.run_on_main_thread(move || {
        if !all_content_windows_hidden(&app_handle) {
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

/// 在主线程上展开悬停详情卡片（窗口变形 + 通知前端渲染）。
fn present_island_detail(app: &AppHandle, snapshot: &AppSnapshot) {
    let app_handle = app.clone();
    let payload = snapshot.clone();
    let schedule_result = app.run_on_main_thread(move || {
        if !all_content_windows_hidden(&app_handle) {
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

/// 前端在详情卡片收起动画结束后调用：恢复紧凑尺寸，并按需隐藏窗口。
#[tauri::command]
fn collapse_island_detail(app: AppHandle, context: State<'_, AppContext>) -> Result<(), String> {
    eprintln!("[island] collapse_island_detail: CALLED");
    let (has_reminder, away_notice) = {
        let core = context
            .core
            .lock()
            .map_err(|_| "状态锁已损坏".to_string())?;
        let ui = context
            .island_ui
            .lock()
            .map_err(|_| "状态锁已损坏".to_string())?;
        (core.current_reminder().is_some(), ui.away_notice)
    };
    {
        let mut ui = context
            .island_ui
            .lock()
            .map_err(|_| "状态锁已损坏".to_string())?;
        ui.detail_expanded = false;
        ui.last_collapsed_at = Some(Instant::now());
        eprintln!("[island] collapse_island_detail: detail_expanded=false, cooldown set");
    }
    let app_handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        eprintln!("[island] collapse_island_detail: main thread, resizing to compact");
        resize_island(&app_handle, ISLAND_COMPACT_WIDTH, ISLAND_COMPACT_HEIGHT);
        // 提醒或离开提示仍在时保留窗口（前端已切回对应卡片），否则隐藏。
        if !has_reminder && !away_notice {
            eprintln!("[island] collapse_island_detail: hiding window (no reminder/away)");
            if let Some(window) = app_handle.get_webview_window("reminder-island") {
                let r = window.hide();
                eprintln!("[island] collapse_island_detail: window.hide() = {r:?}");
            }
        } else {
            eprintln!("[island] collapse_island_detail: keeping window (has_reminder={has_reminder} away_notice={away_notice})");
        }
    });
    Ok(())
}

/// 隐藏灵动岛窗口（离开提示失效时调用，窗口隐藏由前端动画完成后自行处理亦可）。
fn hide_island_window(app: &AppHandle) {
    let app_handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let _ = set_reminder_island_visible(&app_handle, false, false);
    });
}

/// 姿态状态卡片的 6 秒计时结束后由灵动岛页面调用。清理 Rust 侧有效期，
/// 并要求光标先离开顶部热区，避免卡片消失后立即误展开详情。
#[tauri::command]
fn dismiss_behavior_notice(app: AppHandle, context: State<'_, AppContext>) -> Result<(), String> {
    {
        let mut ui = context
            .island_ui
            .lock()
            .map_err(|_| "状态锁已损坏".to_string())?;
        ui.suppress_hover_until_cursor_exit();
    }
    hide_island_window(&app);
    Ok(())
}

/// 鼠标经过穿透区域时通知前端更新局部透视圆心。坐标变化不足 2px 时跳过，
/// 避免 120ms 光标轮询向 WebView 灌入没有视觉收益的重复事件。
fn update_island_peek_state(
    app: &AppHandle,
    current: &mut Option<(f64, f64)>,
    next: Option<(f64, f64)>,
) {
    let active_changed = current.is_some() != next.is_some();
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
    if active_changed {
        eprintln!("[island] peek-through: active={}", next.is_some());
    }
}

fn persist(context: &AppContext, core: &RuntimeState) -> Result<(), String> {
    let database = context
        .database
        .lock()
        .map_err(|_| "数据库锁已损坏".to_string())?;
    database.save_settings(core.settings())?;
    database.save_meta(&core.persisted_meta())?;
    database.save_daily(core.today())
}

fn snapshot_after(
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
fn get_app_snapshot(app: AppHandle, context: State<'_, AppContext>) -> Result<AppSnapshot, String> {
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
fn finish_onboarding(
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
fn save_calibration(
    context: State<'_, AppContext>,
    result: CalibrationResult,
) -> Result<AppSnapshot, String> {
    snapshot_after(&context, |core| core.save_calibration(result))
}

#[tauri::command]
fn start_calibration(context: State<'_, AppContext>) -> Result<AppSnapshot, String> {
    snapshot_after(&context, |core| {
        core.start_calibration();
        Ok(())
    })
}

#[tauri::command]
fn start_monitoring(
    context: State<'_, AppContext>,
    mode: MonitoringMode,
) -> Result<AppSnapshot, String> {
    snapshot_after(&context, |core| core.start_monitoring(mode))
}

#[tauri::command]
fn ingest_observation(
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
fn pause_monitoring(
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
    suppress_island_hover_until_cursor_exit(&context)?;
    Ok(snapshot)
}

#[tauri::command]
fn resume_monitoring(context: State<'_, AppContext>) -> Result<AppSnapshot, String> {
    snapshot_after(&context, RuntimeState::resume)
}

#[tauri::command]
fn start_break(app: AppHandle, context: State<'_, AppContext>) -> Result<AppSnapshot, String> {
    let mut core = context
        .core
        .lock()
        .map_err(|_| "状态锁已损坏".to_string())?;
    let duration = core.settings().break_minutes * 60;
    core.start_break();
    {
        let database = context
            .database
            .lock()
            .map_err(|_| "数据库锁已损坏".to_string())?;
        database.record_event("break", duration, Some("started"))?;
    }
    let snapshot = core.snapshot();
    persist(&context, &core)?;
    suppress_island_hover_until_cursor_exit(&context)?;
    drop(core);
    let _ = app.emit("monitoring://snapshot", &snapshot);
    show_main_window(&app);
    Ok(snapshot)
}

#[tauri::command]
fn end_break(app: AppHandle, context: State<'_, AppContext>) -> Result<AppSnapshot, String> {
    let mut core = context
        .core
        .lock()
        .map_err(|_| "状态锁已损坏".to_string())?;
    core.end_break();
    let snapshot = core.snapshot();
    persist(&context, &core)?;
    suppress_island_hover_until_cursor_exit(&context)?;
    drop(core);
    let _ = app.emit("monitoring://snapshot", &snapshot);
    hide_island_window(&app);
    show_main_window(&app);
    Ok(snapshot)
}

#[tauri::command]
fn snooze_reminder(context: State<'_, AppContext>, minutes: u64) -> Result<AppSnapshot, String> {
    let mut core = context
        .core
        .lock()
        .map_err(|_| "状态锁已损坏".to_string())?;
    let duration = core
        .current_reminder()
        .map(|item| item.duration_seconds)
        .unwrap_or(0);
    core.snooze(minutes);
    {
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
fn dismiss_reminder(context: State<'_, AppContext>) -> Result<AppSnapshot, String> {
    let mut core = context
        .core
        .lock()
        .map_err(|_| "状态锁已损坏".to_string())?;
    let duration = core
        .current_reminder()
        .map(|item| item.duration_seconds)
        .unwrap_or(0);
    core.dismiss();
    {
        let database = context
            .database
            .lock()
            .map_err(|_| "数据库锁已损坏".to_string())?;
        database.record_event("reminder", duration, Some("dismissed"))?;
    }
    let snapshot = core.snapshot();
    persist(&context, &core)?;
    suppress_island_hover_until_cursor_exit(&context)?;
    Ok(snapshot)
}

#[tauri::command]
fn update_settings(
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
    snapshot_after(&context, |core| core.update_settings(settings))
}

#[tauri::command]
fn get_statistics(
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
fn export_statistics(context: State<'_, AppContext>) -> Result<String, String> {
    let database = context
        .database
        .lock()
        .map_err(|_| "数据库锁已损坏".to_string())?;
    let rows = database.statistics(366)?;
    let mut csv = String::from(
        "日期,坐姿秒数,最长连续坐姿秒数,低头秒数,疑似手机秒数,休息次数,提醒次数,忽略次数,离座秒数,离座次数\n",
    );
    for item in rows {
        csv.push_str(&format!(
            "{},{},{},{},{},{},{},{},{},{}\n",
            item.local_date,
            item.seated_seconds,
            item.longest_seated_seconds,
            item.head_down_seconds,
            item.suspected_phone_seconds,
            item.break_count,
            item.reminder_count,
            item.dismissed_count,
            item.away_seconds,
            item.away_count,
        ));
    }
    Ok(csv)
}

#[tauri::command]
fn delete_local_data(context: State<'_, AppContext>) -> Result<AppSnapshot, String> {
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
fn list_cameras(context: State<'_, AppContext>) -> Result<Vec<vision::CameraDevice>, String> {
    context.vision.list_cameras()
}

/// 启动摄像头与姿态检测管线；预览帧通过 `vision://preview` 事件推送。
#[tauri::command]
async fn start_vision(
    app: AppHandle,
    context: State<'_, AppContext>,
    camera_id: String,
    baseline: Option<f64>,
) -> Result<(), String> {
    let service = Arc::clone(&context.vision);
    tauri::async_runtime::spawn_blocking(move || service.start(&app, &camera_id, baseline))
        .await
        .map_err(|error| format!("摄像头会话线程异常:{error}"))?
}

#[tauri::command]
async fn stop_vision(context: State<'_, AppContext>) -> Result<(), String> {
    let service = Arc::clone(&context.vision);
    tauri::async_runtime::spawn_blocking(move || service.stop())
        .await
        .map_err(|error| format!("摄像头会话线程异常:{error}"))?
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "打开健康提醒", true, None::<&str>)?;
    let pause = MenuItem::with_id(app, "pause", "暂停 / 恢复检测", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &pause, &quit])?;
    let mut builder = TrayIconBuilder::new()
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
            "pause" => {
                if let Some(context) = app.try_state::<AppContext>() {
                    if let Ok(mut core) = context.core.lock() {
                        let snapshot = core.snapshot();
                        if matches!(
                            snapshot.lifecycle,
                            model::MonitoringLifecycle::Monitoring
                                | model::MonitoringLifecycle::Degraded
                        ) {
                            core.pause(None);
                        } else {
                            let _ = core.resume();
                        }
                        let updated = core.snapshot();
                        let _ = persist(&context, &core);
                        let _ = app.emit("monitoring://snapshot", updated);
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

fn guard_protocol_response(path: &str) -> tauri::http::Response<Vec<u8>> {
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

pub fn run() {
    tauri::Builder::default()
        .register_uri_scheme_protocol("guard", |_ctx, request| {
            guard_protocol_response(request.uri().path())
        })
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .on_page_load(|webview, payload| {
            // 配置层先隐藏主窗口，避免 WebView 尚未解析 index.html 时暴露空白底色。
            // 页面完成首次加载后，根 HTML 中不依赖 React 的启动画面已经可渲染，
            // 此时再显示窗口可同时覆盖冷启动和系统自启动场景。
            if webview.label() == "main"
                && payload.event() == PageLoadEvent::Finished
                && payload.url().scheme() != "about"
            {
                let window = webview.window();
                if let Err(error) = window.show() {
                    eprintln!("[startup] show main window after page load failed: {error}");
                }
            }
        })
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&directory)?;
            let database = Database::open(&directory.join("cervical-guard.sqlite3"))
                .map_err(std::io::Error::other)?;
            let runtime = RuntimeState::load(&database);
            let vision = Arc::new(VisionService::new());
            app.manage(AppContext {
                core: Mutex::new(runtime),
                database: Mutex::new(database),
                vision,
                island_ui: Mutex::new(IslandUiState::default()),
            });
            build_tray(app)?;
            set_reminder_island_visible(app.handle(), false, false)?;

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(Duration::from_secs(1));
                let mut last_behavior = BehaviorState::Unknown;
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
                    let behavior_changed = snapshot.behavior != last_behavior;
                    last_behavior = snapshot.behavior;
                    if behavior_changed
                        && snapshot.monitoring_mode == MonitoringMode::Camera
                        && matches!(snapshot.lifecycle, MonitoringLifecycle::Monitoring)
                        && snapshot.behavior == BehaviorState::HeadDown
                    {
                        present_behavior_notice(&handle, &snapshot);
                    }
                    // —— 离开检测提示 ——
                    // 灵动岛仅在所有内容窗口均隐藏或最小化时展示。
                    let content_windows_hidden = all_content_windows_hidden(&handle);
                    let camera_tracking = matches!(snapshot.lifecycle, MonitoringLifecycle::Monitoring)
                        && snapshot.monitoring_mode == MonitoringMode::Camera;
                    let confirmed_away = camera_tracking
                        && !snapshot.person_present
                        && matches!(snapshot.behavior, model::BehaviorState::NoPerson)
                        && snapshot.seated_seconds > 0;
                    let mut ui = match context.island_ui.lock() {
                        Ok(ui) => ui,
                        Err(_) => continue,
                    };
                    if snapshot.current_reminder.is_some() {
                        // 提醒展示期间离开提示让位。
                        ui.away_notice = false;
                        ui.behavior_notice_until = None;
                    } else if camera_tracking && content_windows_hidden {
                        // 使用“已确认离座”的稳定状态，而不是单帧 present 跳变。
                        // 因此即使用户先离座、随后才最小化主窗口，也能显示正确状态。
                        if confirmed_away && !ui.away_notice {
                            ui.away_notice = true;
                            ui.detail_expanded = false;
                            drop(ui);
                            present_away_notice(&handle, &snapshot);
                        } else if snapshot.person_present && ui.away_notice {
                            ui.away_notice = false;
                            drop(ui);
                            let _ = handle.emit_to("reminder-island", "island://returned", &snapshot);
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
                let mut interval = tokio::time::interval(Duration::from_millis(120));
                let mut hover_inside = false;
                let mut expanded_at: Option<Instant> = None;
                let mut hot_zone_hits: u32 = 0; // 展开防抖：连续命中计数
                let mut was_in_hot_zone = false;
                let mut content_windows_were_hidden = false;
                let mut action_buttons_capturing = false;
                let mut pointer_peeking: Option<(f64, f64)> = None;
                loop {
                    interval.tick().await;
                    let Some(context) = hover_handle.try_state::<AppContext>() else {
                        continue;
                    };
                    let Some(window) = hover_handle.get_webview_window("reminder-island") else {
                        continue;
                    };
                    let behavior_notice_active = context
                        .island_ui
                        .lock()
                        .map(|ui| ui.behavior_notice_active())
                        .unwrap_or(false);
                    let content_windows_hidden = all_content_windows_hidden(&hover_handle);
                    if !content_windows_hidden && !behavior_notice_active {
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
                        hover_inside = false;
                        expanded_at = None;
                        hot_zone_hits = 0;
                        was_in_hot_zone = false;
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
                    let reminder_active = context
                        .core
                        .lock()
                        .ok()
                        .is_some_and(|core| core.current_reminder().is_some());
                    if behavior_notice_active && !reminder_active {
                        if action_buttons_capturing {
                            let _ = window.set_ignore_cursor_events(true);
                            action_buttons_capturing = false;
                        }
                        update_island_peek_state(
                            &hover_handle,
                            &mut pointer_peeking,
                            pointer_in_island,
                        );
                        hover_inside = false;
                        expanded_at = None;
                        hot_zone_hits = 0;
                        continue;
                    }
                    if reminder_active {
                        let over_action = pointer_in_island
                            .is_some_and(|(x, y)| island_action_hit(x, y));
                        if over_action != action_buttons_capturing {
                            let _ = window.set_ignore_cursor_events(!over_action);
                            action_buttons_capturing = over_action;
                        }
                        update_island_peek_state(
                            &hover_handle,
                            &mut pointer_peeking,
                            pointer_in_island.filter(|_| !over_action),
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
                        pointer_in_island,
                    );
                    // 热区命中判断（物理坐标）：优先使用窗口实际位置计算热区，
                    // 确保热区与窗口真实位置对齐；窗口位置不可用时回退到显示器中心。
                    let in_hot_zone = {
                        let scale = window.scale_factor().unwrap_or(1.0);
                        let (center_x, top) = match window.outer_position() {
                            Ok(pos) => {
                                // 以窗口中心为热区中心，热区顶部延伸到窗口上方 32px。
                                let win_w = window.outer_size().map(|s| s.width as f64).unwrap_or(ISLAND_COMPACT_WIDTH * scale);
                                (pos.x as f64 + win_w / 2.0, pos.y as f64 - 32.0 * scale)
                            }
                            _ => match hover_handle.primary_monitor() {
                                Ok(Some(monitor)) => {
                                    (monitor.position().x as f64 + monitor.size().width as f64 / 2.0, monitor.position().y as f64)
                                }
                                _ => (0.0, 0.0),
                            },
                        };
                        let half = ISLAND_HOT_ZONE_HALF_WIDTH * scale;
                        let bottom = top + ISLAND_HOT_ZONE_HEIGHT * scale;
                        let x = cursor.x as f64;
                        let y = cursor.y as f64;
                        let hit = x >= center_x - half && x <= center_x + half && y >= top && y <= bottom;
                        if hit != was_in_hot_zone {
                            eprintln!("[island] poll: cursor=({x:.0},{y:.0}) zone=[{:.0}..{:.0}, {:.0}..{:.0}] hit={hit} detail_expanded={detail_expanded} hover_inside={hover_inside}",
                                center_x - half, center_x + half, top, bottom);
                            was_in_hot_zone = hit;
                        }
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
                            eprintln!("[island] debounce: hot_zone_hits={hot_zone_hits}, waiting for confirmation");
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
                            eprintln!("[island] state mismatch: inside=true but detail_expanded=false, resetting hover_inside");
                            continue;
                        }
                        continue;
                    }
                    // 离开时若仍在宽限期内，跳过本轮不触发收起。
                    if !inside && in_grace {
                        eprintln!("[island] inside->false but in_grace, skipping collapse");
                        // 保留上一次的“仍在热区”状态。这样宽限期结束后，若光标
                        // 依然在外部，inside != hover_inside，轮询会补发 hover-left。
                        // 若此处提前写成 false，后续两者会一直相等，详情窗口将
                        // 永久停留在展开状态。
                        continue;
                    }
                    hover_inside = inside;
                    eprintln!("[island] STATE CHANGE: inside={inside} in_grace={in_grace}");
                    if inside {
                        let Ok(mut core) = context.core.lock() else {
                            continue;
                        };
                        let snapshot = core.snapshot();
                        drop(core);
                        let eligible = snapshot.current_reminder.is_none()
                            && matches!(
                                snapshot.lifecycle,
                                MonitoringLifecycle::Monitoring
                                    | MonitoringLifecycle::Degraded
                                    | MonitoringLifecycle::Paused
                                    | MonitoringLifecycle::Break
                            );
                        eprintln!("[island] inside=true: eligible={eligible} lifecycle={:?} has_reminder={} detail_expanded={}",
                            snapshot.lifecycle, snapshot.current_reminder.is_some(), detail_expanded);
                        let Ok(mut ui) = context.island_ui.lock() else {
                            continue;
                        };
                        if eligible && !ui.away_notice {
                            // 收起冷却期：刚收起后的一小段时间内不重新展开，
                            // 防止 collapse_island_detail → 轮询立即检测到光标在热区 → 重新展开 的闪现循环。
                            let in_collapse_cooldown = ui
                                .last_collapsed_at
                                .is_some_and(|t| t.elapsed() < Duration::from_millis(ISLAND_COLLAPSE_COOLDOWN_MS));
                            if in_collapse_cooldown {
                                eprintln!("[island] in_collapse_cooldown, skipping expand");
                                drop(ui);
                                continue;
                            }
                            let newly_expanded = !ui.detail_expanded;
                            ui.detail_expanded = true;
                            ui.last_collapsed_at = None;
                            drop(ui);
                            if newly_expanded {
                                eprintln!("[island] EXPANDING: calling present_island_detail");
                                expanded_at = Some(Instant::now());
                                present_island_detail(&hover_handle, &snapshot);
                            } else {
                                // 展开期间光标重新进入：仅刷新数据并取消前端的收起计时。
                                eprintln!("[island] RE-ENTER: emitting island://detail to cancel pending collapse");
                                let _ = hover_handle.emit_to(
                                    "reminder-island",
                                    "island://detail",
                                    &snapshot,
                                );
                            }
                        }
                    } else {
                        eprintln!("[island] LEAVE: emitting island://hover-left");
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
                let should_hide = window
                    .app_handle()
                    .try_state::<AppContext>()
                    .and_then(|context| {
                        context
                            .core
                            .lock()
                            .ok()
                            .map(|core| core.settings().run_in_background)
                    })
                    .unwrap_or(false);
                api.prevent_close();
                if should_hide {
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
            export_statistics,
            delete_local_data,
            list_cameras,
            start_vision,
            stop_vision,
            collapse_island_detail,
            dismiss_behavior_notice,
        ])
        .run(tauri::generate_context!())
        .expect("健康提醒应用启动失败");
}

#[cfg(test)]
mod island_ui_tests {
    use super::{
        guard_protocol_response, island_action_hit, reminder_sound_enabled, IslandUiState,
    };
    use crate::model::AppSettings;

    #[test]
    fn reminder_island_is_served_inside_the_guard_protocol() {
        let response = guard_protocol_response("/reminder-island");
        assert_eq!(response.status(), tauri::http::StatusCode::OK);
        assert_eq!(
            response.headers()[tauri::http::header::CONTENT_TYPE],
            "text/html; charset=utf-8"
        );
        assert!(!response.body().is_empty());
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
    fn reminder_action_requires_cursor_exit_before_hover_can_expand_again() {
        let mut ui = IslandUiState::default();
        ui.detail_expanded = true;
        ui.away_notice = true;
        ui.behavior_notice_until =
            Some(std::time::Instant::now() + std::time::Duration::from_secs(6));

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
    fn meeting_mode_keeps_notifications_silent() {
        let mut settings = AppSettings::default();
        assert!(!reminder_sound_enabled(&settings));

        settings.sound_enabled = true;
        assert!(reminder_sound_enabled(&settings));

        settings.meeting_mode = true;
        assert!(!reminder_sound_enabled(&settings));
    }
}
