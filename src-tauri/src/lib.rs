mod app_runtime;
mod commands;
mod core;
mod database;
mod island;
mod model;
mod tray;
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

use commands::*;
use island::*;
use tray::*;

pub struct AppContext {
    core: Mutex<RuntimeState>,
    database: Mutex<Database>,
    vision: Arc<VisionService>,
    island_ui: Mutex<IslandUiState>,
    update_ui: Mutex<UpdateUiState>,
}

pub fn run() {
    app_runtime::run();
}
