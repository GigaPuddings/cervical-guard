mod core;
mod database;
mod model;
mod vision;

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use core::RuntimeState;
use database::Database;
use model::{
    AppSettings, AppSnapshot, BehaviorHistoryEvent, BehaviorState, CalibrationResult,
    DailyStatistics, MonitoringLifecycle, MonitoringMode, PermissionState, VisionObservation,
};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
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
const ISLAND_MENU_HEIGHT: f64 = 166.0;
const MAIN_TRAY_ID: &str = "main-tray";
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
/// 已确认离座后，需要连续检测到人物一段时间才发布“已返回”。
/// 这能过滤摄像头噪声造成的单帧误检，避免离座状态卡片自行消失。
const ISLAND_RETURN_CONFIRMATION: Duration = Duration::from_secs(2);
/// 检测到低头后，状态灵动岛的展示时长。
const BEHAVIOR_NOTICE_DURATION: Duration = Duration::from_secs(6);
/// 紧凑提醒中三个按钮的逻辑像素命中矩形。窗口其余区域保持原生鼠标穿透。
/// 数值与 public/island.html 的 360×76 布局保持一致。
const ISLAND_ACTION_RECTS: [(f64, f64, f64, f64); 3] = [
    (239.0, 24.0, 277.0, 52.0),
    (281.0, 24.0, 319.0, 52.0),
    (323.0, 24.0, 350.0, 52.0),
];
/// 休息灵动岛只有一个结束按钮，命中区域与页面右侧按钮保持一致。
const BREAK_ACTION_RECT: (f64, f64, f64, f64) = (282.0, 24.0, 350.0, 52.0);

fn island_action_hit(logical_x: f64, logical_y: f64) -> bool {
    ISLAND_ACTION_RECTS
        .iter()
        .any(|(left, top, right, bottom)| {
            logical_x >= *left && logical_x <= *right && logical_y >= *top && logical_y <= *bottom
        })
}

fn break_action_hit(logical_x: f64, logical_y: f64) -> bool {
    let (left, top, right, bottom) = BREAK_ACTION_RECT;
    logical_x >= left && logical_x <= right && logical_y >= top && logical_y <= bottom
}

/// 灵动岛当前展示的界面状态（由 Rust 侧各循环协同维护）。
pub struct IslandUiState {
    /// 悬停详情卡片是否处于展开状态。
    detail_expanded: bool,
    /// “用户已离开”提示是否正展示在灵动岛上。
    away_notice: bool,
    /// 离座提示展示期间，首次重新检测到人物的时间。
    away_return_candidate_since: Option<Instant>,
    /// 低头状态卡片的有效期。状态卡片没有操作按钮，到期后自动关闭。
    behavior_notice_until: Option<Instant>,
    /// 详情卡片上次收起时间，用于防止收起后立即被轮询循环重新展开（闪现循环）。
    last_collapsed_at: Option<Instant>,
    /// 用户点击提醒操作后，在光标真正离开顶部热区前禁止再次展开详情。
    /// 否则提醒状态刚被清空，仍停在按钮上的光标会立刻触发详情窗口，
    /// 与前端关闭动画竞争并造成窗口跳动。
    hover_suppressed_until_exit: bool,
    /// 进入休息前主窗口是否可见且未最小化。
    restore_main_after_break: bool,
    /// 临时关闭截止时间；None 表示未临时关闭。
    muted_until: Option<Instant>,
    /// 本次运行内彻底关闭。持久开关仍由 AppSettings 控制是否允许该操作。
    muted_permanently: bool,
    /// 启动恢复出的 Paused 只是安全的初始状态，不应被当成本次用户操作弹出。
    /// 只有本次运行里用户主动暂停后，才允许展示暂停状态灵动岛。
    pause_status_requested: bool,
    menu_open: bool,
    active_break_event: Option<(String, Instant)>,
}

impl Default for IslandUiState {
    fn default() -> Self {
        Self {
            detail_expanded: false,
            away_notice: false,
            away_return_candidate_since: None,
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
    fn island_available(&mut self, settings: &AppSettings) -> bool {
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
    fn remember_main_visibility_for_break(&mut self, visible: bool) {
        self.restore_main_after_break = visible;
    }

    fn take_main_restore_after_break(&mut self) -> bool {
        std::mem::take(&mut self.restore_main_after_break)
    }

    fn suppress_hover_until_cursor_exit(&mut self) {
        self.detail_expanded = false;
        self.away_notice = false;
        self.away_return_candidate_since = None;
        self.behavior_notice_until = None;
        self.menu_open = false;
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

    fn blocks_persistent_status(&self) -> bool {
        self.detail_expanded || self.away_notice || self.menu_open || self.behavior_notice_active()
    }

    fn request_pause_status(&mut self) {
        self.pause_status_requested = true;
    }

    fn clear_pause_status_request(&mut self) {
        self.pause_status_requested = false;
    }

    fn status_enabled(&self, settings: &AppSettings, lifecycle: MonitoringLifecycle) -> bool {
        island_status_enabled(settings, lifecycle)
            && (lifecycle != MonitoringLifecycle::Paused || self.pause_status_requested)
    }

    /// 离座提示只在连续确认人物返回后结束。返回 false 表示继续保留离座卡片。
    fn confirm_return_after_away(&mut self, person_confirmed: bool, now: Instant) -> bool {
        if !self.away_notice {
            self.away_return_candidate_since = None;
            return false;
        }
        if !person_confirmed {
            self.away_return_candidate_since = None;
            return false;
        }
        let started = *self.away_return_candidate_since.get_or_insert(now);
        if now.duration_since(started) < ISLAND_RETURN_CONFIRMATION {
            return false;
        }
        self.away_notice = false;
        self.away_return_candidate_since = None;
        true
    }
}

fn reminder_sound_enabled(settings: &AppSettings) -> bool {
    // 会议模式的产品承诺是“安静通知”，优先级高于声音开关。
    settings.sound_enabled && !settings.meeting_mode
}

fn island_feature_enabled(app: &AppHandle, feature: impl FnOnce(&AppSettings) -> bool) -> bool {
    let Some(context) = app.try_state::<AppContext>() else {
        return false;
    };
    let settings = match context.core.lock() {
        Ok(core) => core.settings().clone(),
        Err(_) => return false,
    };
    context
        .island_ui
        .lock()
        .is_ok_and(|mut ui| ui.island_available(&settings) && feature(&settings))
}

fn island_status_feature_enabled(app: &AppHandle, lifecycle: MonitoringLifecycle) -> bool {
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

fn island_status_enabled_for_context(
    context: &AppContext,
    settings: &AppSettings,
    lifecycle: MonitoringLifecycle,
) -> bool {
    context
        .island_ui
        .lock()
        .is_ok_and(|mut ui| ui.island_available(settings) && ui.status_enabled(settings, lifecycle))
}

fn island_may_overlay_content(app: &AppHandle) -> bool {
    app.try_state::<AppContext>()
        .and_then(|context| {
            context
                .core
                .lock()
                .ok()
                .map(|core| core.settings().island_allow_with_main_window)
        })
        .unwrap_or(false)
}

fn island_surface_needed(
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

fn island_status_enabled(settings: &AppSettings, lifecycle: MonitoringLifecycle) -> bool {
    match lifecycle {
        MonitoringLifecycle::Monitoring | MonitoringLifecycle::Degraded => {
            settings.island_persistent_status_enabled
        }
        MonitoringLifecycle::Paused => settings.island_paused_status_enabled,
        _ => false,
    }
}

fn island_height_for_menu(open: bool, detail_expanded: bool) -> f64 {
    if open {
        ISLAND_MENU_HEIGHT
    } else if detail_expanded {
        ISLAND_DETAIL_HEIGHT
    } else {
        ISLAND_COMPACT_HEIGHT
    }
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
    update_ui: Mutex<UpdateUiState>,
}

#[derive(Clone)]
struct UpdateUiState {
    stage: String,
    version: Option<String>,
    progress: u8,
    language: String,
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
    fn keeps_app_alive(&self) -> bool {
        matches!(self.stage.as_str(), "downloading" | "restarting")
    }
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
        let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(width, height)));
        let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(x, y)));
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

/// 显示并聚焦主窗口。窗口在后台隐藏或最小化时都恢复到可交互状态。
fn show_main_window(app: &AppHandle) {
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
        if !island_feature_enabled(&app_handle, |settings| settings.island_reminder_enabled) {
            let _ = set_reminder_island_visible(&app_handle, false, false);
            return;
        }
        // 只有所有内容窗口都隐藏/最小化后才使用
        // 独立的屏幕级灵动岛；内容窗口可见时只更新页面自身状态，不渲染
        // 任何页面内“伪灵动岛”。
        if !all_content_windows_hidden(&app_handle) && !island_may_overlay_content(&app_handle) {
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
fn present_break_island(app: &AppHandle, snapshot: &AppSnapshot) {
    let app_handle = app.clone();
    let payload = snapshot.clone();
    let _ = app.run_on_main_thread(move || {
        if !island_feature_enabled(&app_handle, |settings| settings.island_break_enabled) {
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
        if !island_may_overlay_content(&app_handle) {
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
fn present_behavior_notice(app: &AppHandle, snapshot: &AppSnapshot) {
    if snapshot.current_reminder.is_some() || snapshot.behavior != BehaviorState::HeadDown {
        return;
    }

    let app_handle = app.clone();
    let payload = snapshot.clone();
    let _ = app.run_on_main_thread(move || {
        if !island_feature_enabled(&app_handle, |settings| settings.island_head_down_enabled) {
            return;
        }
        if !all_content_windows_hidden(&app_handle) && !island_may_overlay_content(&app_handle) {
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
fn present_away_notice(app: &AppHandle, snapshot: &AppSnapshot) {
    let app_handle = app.clone();
    let payload = snapshot.clone();
    let _ = app.run_on_main_thread(move || {
        if !island_feature_enabled(&app_handle, |settings| settings.island_away_enabled) {
            return;
        }
        if !all_content_windows_hidden(&app_handle) && !island_may_overlay_content(&app_handle) {
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
fn island_status_payload_is_current(
    payload_lifecycle: MonitoringLifecycle,
    current_lifecycle: MonitoringLifecycle,
    has_reminder: bool,
) -> bool {
    payload_lifecycle == current_lifecycle
        && current_lifecycle != MonitoringLifecycle::Break
        && !has_reminder
}

fn current_status_payload_matches(app: &AppHandle, payload: &AppSnapshot) -> bool {
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
fn present_island_detail(app: &AppHandle, snapshot: &AppSnapshot) {
    let app_handle = app.clone();
    let payload = snapshot.clone();
    let schedule_result = app.run_on_main_thread(move || {
        if !current_status_payload_matches(&app_handle, &payload)
            || !island_status_feature_enabled(&app_handle, payload.lifecycle)
        {
            return;
        }
        if !all_content_windows_hidden(&app_handle) && !island_may_overlay_content(&app_handle) {
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
fn present_persistent_status(app: &AppHandle, snapshot: &AppSnapshot) {
    let app_handle = app.clone();
    let payload = snapshot.clone();
    let _ = app.run_on_main_thread(move || {
        if !current_status_payload_matches(&app_handle, &payload)
            || !island_status_feature_enabled(&app_handle, payload.lifecycle)
        {
            return;
        }
        if !all_content_windows_hidden(&app_handle) && !island_may_overlay_content(&app_handle) {
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
fn collapse_island_detail(app: AppHandle, context: State<'_, AppContext>) -> Result<(), String> {
    let (snapshot, has_reminder, break_active, away_notice) = {
        let mut core = context
            .core
            .lock()
            .map_err(|_| "状态锁已损坏".to_string())?;
        let ui = context
            .island_ui
            .lock()
            .map_err(|_| "状态锁已损坏".to_string())?;
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
            .map_err(|_| "状态锁已损坏".to_string())?;
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
    let snapshot = context
        .core
        .lock()
        .map_err(|_| "状态锁已损坏".to_string())?
        .snapshot();
    {
        let mut ui = context
            .island_ui
            .lock()
            .map_err(|_| "状态锁已损坏".to_string())?;
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
fn update_island_peek_state(
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

fn update_island_hover_state(app: &AppHandle, current: &mut bool, next: bool) {
    if *current == next {
        return;
    }
    *current = next;
    let _ = app.emit_to("reminder-island", "island://pointer-hover", next);
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
fn resume_monitoring(
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
fn start_break(app: AppHandle, context: State<'_, AppContext>) -> Result<AppSnapshot, String> {
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
fn end_break(app: AppHandle, context: State<'_, AppContext>) -> Result<AppSnapshot, String> {
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
fn get_behavior_history(
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
fn set_island_menu_open(
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
fn mute_island(
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
async fn list_cameras(context: State<'_, AppContext>) -> Result<Vec<vision::CameraDevice>, String> {
    // Windows 某些摄像头驱动在枚举设备/检查权限时会阻塞数秒。放入阻塞线程池，
    // 避免查询期间冻结 WebView 主线程，造成入口按钮“无法点击”的错觉。
    let service = Arc::clone(&context.vision);
    tauri::async_runtime::spawn_blocking(move || service.list_cameras())
        .await
        .map_err(|error| format!("摄像头设备查询线程异常:{error}"))?
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

fn normalized_proxy(value: &str) -> Option<String> {
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

fn proxy_from_environment() -> Option<String> {
    ["HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy"]
        .into_iter()
        .find_map(|name| {
            std::env::var(name)
                .ok()
                .and_then(|value| normalized_proxy(&value))
        })
}

#[cfg(target_os = "windows")]
fn proxy_from_system() -> Option<String> {
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
fn proxy_from_system() -> Option<String> {
    None
}

#[tauri::command]
fn get_update_proxy() -> Option<String> {
    proxy_from_environment().or_else(proxy_from_system)
}

fn tray_menu(
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

fn update_tray_text(english: bool, stage: &str, version: Option<&str>, progress: u8) -> String {
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

fn tray_update_badge_visible(stage: &str, version: Option<&str>) -> bool {
    version.is_some() && matches!(stage, "available" | "downloading" | "error")
}

fn tray_icon_with_update_badge(base: &tauri::image::Image<'_>) -> tauri::image::Image<'static> {
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

fn set_tray_update_badge(app: &AppHandle, visible: bool) -> Result<(), String> {
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

fn rebuild_tray_menu(app: &AppHandle) -> Result<(), String> {
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
fn set_update_tray_status(
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

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
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
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
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
                update_ui: Mutex::new(UpdateUiState::default()),
            });
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
                    let content_windows_hidden = all_content_windows_hidden(&handle);
                    let island_content_allowed =
                        content_windows_hidden || island_may_overlay_content(&handle);
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
                    } else if camera_tracking && island_content_allowed {
                        // 使用“已确认离座”的稳定状态，而不是单帧 present 跳变。
                        // 因此即使用户先离座、随后才最小化主窗口，也能显示正确状态。
                        if confirmed_away && !ui.away_notice {
                            ui.away_notice = true;
                            ui.away_return_candidate_since = None;
                            ui.detail_expanded = false;
                            drop(ui);
                            present_away_notice(&handle, &snapshot);
                        } else if ui.confirm_return_after_away(
                            snapshot.person_present
                                && matches!(
                                    snapshot.behavior,
                                    BehaviorState::SittingNormal | BehaviorState::HeadDown
                                ),
                            Instant::now(),
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
                    let surface_needed = island_surface_needed(
                        settings,
                        island_status_enabled_for_context(&context, settings, snapshot.lifecycle),
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
                    let content_windows_hidden = all_content_windows_hidden(&hover_handle);
                    let island_content_allowed =
                        content_windows_hidden || island_may_overlay_content(&hover_handle);
                    if hover_handle.get_webview_window("reminder-island").is_none() {
                        if island_content_allowed {
                            if let Some(reminder) = snapshot.current_reminder.clone() {
                                present_reminder_island(&hover_handle, reminder, false);
                            } else if break_active {
                                present_break_island(&hover_handle, &snapshot);
                            } else if island_status_enabled_for_context(
                                &context,
                                settings,
                                snapshot.lifecycle,
                            ) {
                                present_persistent_status(&hover_handle, &snapshot);
                            }
                        }
                        continue;
                    }
                    let Some(window) = hover_handle.get_webview_window("reminder-island") else {
                        continue;
                    };
                    if !island_content_allowed && !behavior_notice_active && !break_active {
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
                            && island_status_enabled_for_context(
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
mod island_ui_tests {
    use super::{
        break_action_hit, guard_protocol_response, island_action_hit, island_height_for_menu,
        island_status_enabled, island_status_payload_is_current, island_surface_needed,
        normalized_proxy, reminder_sound_enabled, tray_icon_with_update_badge,
        tray_update_badge_visible, update_tray_text, IslandUiState, UpdateUiState,
        ISLAND_COMPACT_HEIGHT, ISLAND_DETAIL_HEIGHT, ISLAND_MENU_HEIGHT,
        ISLAND_RETURN_CONFIRMATION,
    };
    use crate::model::{AppSettings, MonitoringLifecycle};

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
                false,
                &downloading.stage,
                downloading.version.as_deref(),
                37
            ),
            "↓ 正在下载 v0.2.0 · 37%"
        );
        assert!(!UpdateUiState::default().keeps_app_alive());
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
    fn away_notice_requires_continuous_confirmed_return_before_closing() {
        let mut ui = IslandUiState::default();
        ui.away_notice = true;
        let now = std::time::Instant::now();

        assert!(!ui.confirm_return_after_away(true, now));
        assert!(!ui.confirm_return_after_away(false, now + ISLAND_RETURN_CONFIRMATION));
        assert!(ui.away_notice);

        let restarted = now + ISLAND_RETURN_CONFIRMATION + std::time::Duration::from_millis(1);
        assert!(!ui.confirm_return_after_away(true, restarted));
        assert!(ui.confirm_return_after_away(true, restarted + ISLAND_RETURN_CONFIRMATION));
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
}
