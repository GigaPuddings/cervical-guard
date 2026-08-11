//! 后端摄像头与姿态检测服务。
//!
//! 相机枚举 / 打开 / 取帧由 [nokhwa](https://lib.rs/crates/nokhwa)(Windows Media Foundation)
//! 负责,姿态估计由 onnxruntime([ort](https://lib.rs/crates/ort))运行随应用打包的
//! MoveNet SinglePose Lightning 模型(TensorFlow 转 ONNX 格式输出)。
//!
//! 帧管线拆分为两个独立线程，预览帧通过 Tauri 事件低频推送:
//!
//! - **捕获线程**(≈15 FPS):排空相机缓冲区,取出原始 MJPEG 字节(零解码零编码),
//!   存入共享最新帧供推理线程读取，并按约 7.5 FPS 推送预览事件。
//! - **推理线程**(≈5 FPS):只处理最新帧,解码 JPEG → letterbox → MoveNet 推理 →
//!   emit `vision://frame` 事件(观测值)。
//! - **预览事件**:`vision://preview` 携带 JPEG data URL，不经过回环网络、随机端口、
//!   自定义资源协议或防火墙，也不会触发 WebView Local Network Access。
//!
//! 预览仅用于本地视觉反馈，姿态推理仍保持独立运行。

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use image::{imageops, DynamicImage, ImageBuffer, Rgb};
use nokhwa::pixel_format::RgbFormat;
use nokhwa::utils::{
    ApiBackend, CameraFormat, CameraIndex, FrameFormat, RequestedFormat, RequestedFormatType,
    Resolution,
};
use nokhwa::{query, Camera};
use ort::session::builder::GraphOptimizationLevel;
use ort::session::Session;
use ort::value::Tensor;
use serde::Serialize;
use tauri::{Emitter, Manager};

use crate::model::{
    FrameQuality, HeadObservation, PersonObservation, PostureObservation, PostureState,
    VisionMetrics, VisionObservation, SCHEMA_VERSION,
};

/// 内置模型文件名(bundle.resources 会保留 `resources/` 目录结构拷贝)。
/// MoveNet SinglePose Lightning: Google 训练的轻量级姿态估计模型,CPU ~50ms/帧。
const MODEL_NAME: &str = "movenet_singlepose_lightning.onnx";
/// 模型输入尺寸(方形输入)。
const INPUT_SIZE: u32 = 192;
const INPUT_NAME: &str = "input";
const PRESENCE_THRESHOLD: f64 = 0.35;

/// 本产品关注持续数秒到数十分钟的姿态行为,不需要视频会议级帧率。
/// 15 FPS 足够提供设置页预览,同时降低相机传输与浏览器 JPEG 解码开销。
const CAMERA_FPS: u32 = 15;
const CAPTURE_INTERVAL: Duration = Duration::from_millis(67);
/// 每两个捕获帧发送一次预览，约 7.5 FPS；姿态推理仍按自己的节奏运行。
const PREVIEW_FRAME_DIVISOR: u64 = 2;
/// MoveNet 后台推理限制为 5 FPS。核心状态机使用单调时间和多秒门控,
/// 200ms 的观测粒度不会改变提醒语义,却能显著减少持续 CPU/功耗。
const INFERENCE_INTERVAL: Duration = Duration::from_millis(200);
/// 连续捕获失败上限。
const MAX_CONSECUTIVE_FAILURES: u32 = 30;
// COCO 17 关键点索引(MoveNet 使用 COCO 标注顺序)。
const NOSE: usize = 0;
const LEFT_EYE: usize = 1;
const RIGHT_EYE: usize = 2;
const LEFT_EAR: usize = 3;
const RIGHT_EAR: usize = 4;
const KEYPOINT_COUNT: usize = 17;

/// EMA 平滑因子:新帧权重。0.5 = 平衡平滑性与响应速度。
const EMA_ALPHA: f64 = 0.5;
/// 判定关键点是否参与质心计算的最低 score 阈值。
const KEYPOINT_TRUST_THRESHOLD: f64 = 0.25;
/// 头部点的最大几何展开范围。抬手遮挡时，模型偶尔会把面部点
/// 漂移到手臂上；不成簇的点只能视为遮挡，不参与低头判断。
const HEAD_CLUSTER_MAX_WIDTH: f64 = 0.34;
const HEAD_CLUSTER_MAX_HEIGHT: f64 = 0.24;
/// 低头几何链的最小绝对间距。关键点坐标已归一化到 0..1；该下限用于
/// 避免 EMA 后几乎重合的耳/眼/鼻因亚像素级抖动偶然满足排列顺序。
const HEAD_DOWN_MIN_VERTICAL_GAP: f64 = 0.003;
const HEAD_DOWN_MIN_INWARD_GAP: f64 = 0.002;
/// 帧质量门控:低于此 visibility 归为 Occluded。
const VISIBILITY_OCCLUDED_THRESHOLD: f64 = 0.50;
/// 帧质量门控:低于此 brightness 归为 Dark。
const BRIGHTNESS_DARK_THRESHOLD: f64 = 35.0;
/// 头部关键点索引集合(鼻尖+双眼+双耳),用于置信度加权质心计算。
const HEAD_KEYPOINTS: [usize; 5] = [NOSE, LEFT_EYE, RIGHT_EYE, LEFT_EAR, RIGHT_EAR];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CameraDevice {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LandmarkPoint {
    pub x: f64,
    pub y: f64,
    pub score: f64,
}

/// 推理结果事件载荷(小 JSON,不含图像数据)。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VisionFrame {
    pub observation: VisionObservation,
    pub head_ratio: Option<f64>,
    pub landmarks: Vec<LandmarkPoint>,
}

#[derive(Debug, Clone, Copy)]
struct Keypoint {
    x: f64,
    y: f64,
    score: f64,
}

#[derive(Debug, Default, Clone)]
struct PoseResult {
    keypoints: Vec<Keypoint>,
    max_score: f64,
}

/// 捕获线程写入、推理线程读取的共享帧数据(原始 JPEG 字节)。
struct CapturedFrame {
    jpeg: Vec<u8>,
    captured_at_ms: f64,
    /// 单调递增帧序号,推理线程据此跳过已处理帧。
    seq: u64,
}

fn clamp01(value: f64) -> f64 {
    value.clamp(0.0, 1.0)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CameraFailureKind {
    PermissionDenied,
    NoDevice,
    Busy,
    Unsupported,
    Driver,
    Read,
    Unknown,
}

fn contains_any(text: &str, markers: &[&str]) -> bool {
    markers.iter().any(|marker| text.contains(marker))
}

fn classify_camera_failure(detail: &str, fallback: CameraFailureKind) -> CameraFailureKind {
    let detail = detail.to_ascii_lowercase();

    if contains_any(
        &detail,
        &[
            "0x80070005",
            "-2147024891",
            "e_accessdenied",
            "access is denied",
            "access denied",
            "permission denied",
            "permission",
            "unauthorized",
        ],
    ) {
        return CameraFailureKind::PermissionDenied;
    }
    // 只把 Windows 共享冲突、Media Foundation 抢占错误或明确的独占文本
    // 判定为“其他应用占用”；不根据模糊的 open failure 推测。
    if contains_any(
        &detail,
        &[
            "0x80070020",
            "0xc00d3ea3",
            "sharing violation",
            "exclusive access",
            "exclusive control",
            "another process",
            "another application",
            "another app",
            "already in use",
            "device is in use",
            "device busy",
            "resource busy",
            "preempted",
        ],
    ) {
        return CameraFailureKind::Busy;
    }
    if contains_any(
        &detail,
        &[
            "0xc00d3ea2",
            "no device",
            "device not found",
            "not found",
            "no longer present",
            "device removed",
            "device disconnected",
        ],
    ) {
        return CameraFailureKind::NoDevice;
    }
    if contains_any(
        &detail,
        &[
            "0xc00dafc8",
            "unsupported capture device",
            "unsupported format",
            "format is not supported",
            "not supported",
        ],
    ) {
        return CameraFailureKind::Unsupported;
    }
    if contains_any(
        &detail,
        &[
            "0xc00d3704",
            "hardware mft",
            "hardware resources",
            "device driver",
            "driver failure",
        ],
    ) {
        return CameraFailureKind::Driver;
    }
    fallback
}

fn diagnostic_code(detail: &str) -> Option<String> {
    let bytes = detail.as_bytes();
    for start in 0..bytes.len().saturating_sub(2) {
        if bytes[start] != b'0' || !matches!(bytes[start + 1], b'x' | b'X') {
            continue;
        }
        let digits = bytes[start + 2..]
            .iter()
            .take_while(|byte| byte.is_ascii_hexdigit())
            .take(8)
            .copied()
            .collect::<Vec<_>>();
        if digits.len() == 8 {
            return String::from_utf8(digits)
                .ok()
                .map(|value| format!("0x{}", value.to_ascii_uppercase()));
        }
    }
    None
}

fn camera_failure_message(kind: CameraFailureKind, detail: &str) -> String {
    let diagnostic = diagnostic_code(detail)
        .map(|code| format!("（错误码 {code}）"))
        .unwrap_or_default();
    match kind {
        CameraFailureKind::PermissionDenied => {
            "摄像头权限已关闭。请在 Windows“设置 > 隐私和安全性 > 相机”中允许桌面应用访问摄像头。"
                .to_string()
        }
        CameraFailureKind::NoDevice => {
            "未检测到可用摄像头。请确认设备已连接且未在设备管理器中禁用。".to_string()
        }
        CameraFailureKind::Busy => {
            "摄像头正被其他应用独占。请关闭视频会议、直播或录屏软件后重试。".to_string()
        }
        CameraFailureKind::Unsupported => {
            format!("摄像头不支持当前视频格式。请切换摄像头或更新设备驱动后重试。{diagnostic}")
        }
        CameraFailureKind::Driver => {
            format!("摄像头驱动或硬件资源异常。请重新连接设备或更新驱动后重试。{diagnostic}")
        }
        CameraFailureKind::Read => {
            format!("摄像头连接已中断，无法继续读取画面。请检查设备连接后重试。{diagnostic}")
        }
        CameraFailureKind::Unknown => {
            format!("摄像头启动失败。请检查设备连接、驱动和其他应用后重试。{diagnostic}")
        }
    }
}

fn camera_message(error: &nokhwa::NokhwaError) -> String {
    use nokhwa::NokhwaError;
    let (detail, fallback) = match error {
        NokhwaError::OpenDeviceError(_, detail) | NokhwaError::OpenStreamError(detail) => {
            (detail.as_str(), CameraFailureKind::Unknown)
        }
        NokhwaError::ReadFrameError(detail) => (detail.as_str(), CameraFailureKind::Read),
        NokhwaError::ProcessFrameError { error, .. } => (error.as_str(), CameraFailureKind::Read),
        NokhwaError::GeneralError(detail) => (detail.as_str(), CameraFailureKind::Unknown),
        _ => return camera_failure_message(CameraFailureKind::Unknown, &error.to_string()),
    };
    camera_failure_message(classify_camera_failure(detail, fallback), detail)
}

#[cfg(target_os = "windows")]
fn ensure_camera_permission() -> Result<(), String> {
    use windows::core::HSTRING;
    use windows::Security::Authorization::AppCapabilityAccess::{
        AppCapability, AppCapabilityAccessStatus,
    };
    use windows::Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED};

    // AppCapability 是 Windows 官方的隐私权限查询通道。查询不可用时不
    // 阻断摄像头，交给 Media Foundation 实际打开结果分类。
    let initialized = unsafe { RoInitialize(RO_INIT_MULTITHREADED) }.is_ok();
    let status = AppCapability::Create(&HSTRING::from("Webcam"))
        .and_then(|capability| capability.CheckAccess());
    if initialized {
        unsafe { RoUninitialize() };
    }

    match status {
        Ok(value) if value == AppCapabilityAccessStatus::DeniedByUser => Err(
            "摄像头权限已关闭。请在 Windows“设置 > 隐私和安全性 > 相机”中允许桌面应用访问摄像头。"
                .to_string(),
        ),
        Ok(value) if value == AppCapabilityAccessStatus::DeniedBySystem => Err(
            "摄像头访问已被 Windows 或组织策略禁用。请联系系统管理员或检查摄像头隐私设置。"
                .to_string(),
        ),
        Ok(value) if value == AppCapabilityAccessStatus::NotDeclaredByApp => {
            Err("当前应用未声明摄像头能力。请重新安装完整版本后重试。".to_string())
        }
        Ok(_) => Ok(()),
        Err(error) => {
            eprintln!("[vision] Windows 摄像头权限预检失败，继续尝试打开设备: {error}");
            Ok(())
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn ensure_camera_permission() -> Result<(), String> {
    Ok(())
}

/// 判断原始字节是否为有效 JPEG(检查 SOI 标记 0xFF 0xD8)。
fn is_jpeg(bytes: &[u8]) -> bool {
    bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xD8
}

fn preview_data_url(jpeg: &[u8]) -> String {
    format!("data:image/jpeg;base64,{}", BASE64_STANDARD.encode(jpeg))
}

// ════════════════════════════════════════════════════════════════════════════
//  VisionService
// ════════════════════════════════════════════════════════════════════════════

/// 全局摄像头 + 姿态检测服务。
///
/// 管线拆分为捕获线程 + 推理线程，两者通过 `latest_capture` 共享数据。
/// 捕获线程同时低频发送预览事件，不做重复解码或编码。
pub struct VisionService {
    model: Arc<Mutex<Option<Session>>>,
    pipeline: Mutex<Option<PipelineHandle>>,
    latest_capture: Arc<Mutex<Option<CapturedFrame>>>,
    epoch: Instant,
}

struct PipelineHandle {
    stop_flag: Arc<AtomicBool>,
    capture_thread: Option<JoinHandle<()>>,
    inference_thread: Option<JoinHandle<()>>,
}

impl Default for VisionService {
    fn default() -> Self {
        Self::new()
    }
}

impl VisionService {
    pub fn new() -> Self {
        Self {
            model: Arc::new(Mutex::new(None)),
            pipeline: Mutex::new(None),
            latest_capture: Arc::new(Mutex::new(None)),
            epoch: Instant::now(),
        }
    }

    fn model_path(&self, app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
        let dir = app
            .path()
            .resource_dir()
            .map_err(|error| format!("无法定位应用资源目录:{error}"))?;
        let candidates = [
            dir.join("resources").join("models").join(MODEL_NAME),
            dir.join("models").join(MODEL_NAME),
        ];
        for candidate in &candidates {
            if candidate.exists() {
                return Ok(candidate.clone());
            }
        }
        let checked = candidates
            .iter()
            .map(|path| path.display().to_string())
            .collect::<Vec<_>>()
            .join("、");
        Err(format!("本地姿态模型缺失,已检查:{checked}"))
    }

    fn ensure_session(&self, app: &tauri::AppHandle) -> Result<(), String> {
        let mut guard = self
            .model
            .lock()
            .map_err(|_| "姿态模型会话锁已损坏".to_string())?;
        if guard.is_some() {
            return Ok(());
        }
        let path = self.model_path(app)?;
        let session = Session::builder()
            .map_err(|error| format!("创建推理引擎失败:{error}"))?
            .with_optimization_level(GraphOptimizationLevel::Level3)
            .map_err(|error| format!("配置推理引擎失败:{error}"))?
            .commit_from_file(path)
            .map_err(|error| format!("加载本地姿态模型失败:{error}"))?;
        *guard = Some(session);
        Ok(())
    }

    pub fn list_cameras(&self) -> Result<Vec<CameraDevice>, String> {
        ensure_camera_permission()?;
        let infos = query(ApiBackend::Auto).map_err(|error| camera_message(&error))?;
        if infos.is_empty() {
            return Err(camera_failure_message(CameraFailureKind::NoDevice, ""));
        }
        Ok(infos
            .iter()
            .enumerate()
            .map(|(index, info)| {
                let id = match info.index() {
                    CameraIndex::Index(value) => value.to_string(),
                    CameraIndex::String(value) => value.clone(),
                };
                let name = info.human_name();
                let label = if name.trim().is_empty() {
                    format!("摄像头 {}", index + 1)
                } else {
                    name
                };
                CameraDevice { id, label }
            })
            .collect())
    }

    /// 打开摄像头并加载姿态模型,随后启动捕获线程和推理线程。
    pub fn start(
        &self,
        app: &tauri::AppHandle,
        camera_id: &str,
        baseline: Option<f64>,
    ) -> Result<(), String> {
        self.stop_pipeline();
        if let Ok(mut guard) = self.latest_capture.lock() {
            *guard = None;
        }
        // 权限可能在设备枚举后被用户关闭，因此启动管线前再检查一次。
        ensure_camera_permission()?;
        self.ensure_session(app)?;

        let index = camera_id.parse::<u32>().unwrap_or(0);
        let requested = RequestedFormat::new::<RgbFormat>(RequestedFormatType::Closest(
            CameraFormat::new(Resolution::new(640, 480), FrameFormat::MJPEG, CAMERA_FPS),
        ));
        let mut camera = Camera::new(CameraIndex::Index(index), requested)
            .map_err(|error| camera_message(&error))?;
        camera
            .open_stream()
            .map_err(|error| camera_message(&error))?;

        let baseline = baseline.unwrap_or(-0.9);
        let stop_flag = Arc::new(AtomicBool::new(false));
        let model = Arc::clone(&self.model);
        let latest_capture = Arc::clone(&self.latest_capture);
        let epoch = self.epoch;

        let app_handle = app.clone();
        let stop_flag_capture = Arc::clone(&stop_flag);
        let stop_flag_inference = Arc::clone(&stop_flag);
        let latest_capture_inference = Arc::clone(&latest_capture);
        let model_inference = Arc::clone(&model);
        let app_inference = app.clone();

        // ── 捕获线程:取原始 JPEG 字节 → 存入共享缓冲 ──
        let capture_thread = thread::spawn(move || {
            run_capture_loop(app_handle, camera, latest_capture, stop_flag_capture, epoch);
        });

        // ── 推理线程:解码 JPEG → MoveNet 推理 → emit 观测值 ──
        let inference_thread = thread::spawn(move || {
            run_inference_loop(
                app_inference,
                model_inference,
                latest_capture_inference,
                baseline,
                stop_flag_inference,
                epoch,
            );
        });

        let mut guard = self
            .pipeline
            .lock()
            .map_err(|_| "管线锁已损坏".to_string())?;
        *guard = Some(PipelineHandle {
            stop_flag,
            capture_thread: Some(capture_thread),
            inference_thread: Some(inference_thread),
        });
        Ok(())
    }

    pub fn stop(&self) -> Result<(), String> {
        self.stop_pipeline();
        if let Ok(mut guard) = self.latest_capture.lock() {
            *guard = None;
        }
        Ok(())
    }

    fn stop_pipeline(&self) {
        let mut guard = match self.pipeline.lock() {
            Ok(guard) => guard,
            Err(_) => return,
        };
        if let Some(mut handle) = guard.take() {
            handle.stop_flag.store(true, Ordering::Relaxed);
            if let Some(thread) = handle.capture_thread.take() {
                let _ = thread.join();
            }
            if let Some(thread) = handle.inference_thread.take() {
                let _ = thread.join();
            }
        }
    }
}

// ════════════════════════════════════════════════════════════════════════════
//  捕获线程
// ════════════════════════════════════════════════════════════════════════════

/// 捕获线程主循环:取帧 → 提取原始 JPEG 字节 → 存入共享缓冲。
///
/// **零解码零编码**:相机输出的 MJPEG 字节直接用于本地预览事件。
/// 推理线程负责将 JPEG 解码为 RGB。
fn run_capture_loop(
    app: tauri::AppHandle,
    mut camera: Camera,
    latest_capture: Arc<Mutex<Option<CapturedFrame>>>,
    stop_flag: Arc<AtomicBool>,
    epoch: Instant,
) {
    let mut consecutive_failures: u32 = 0;
    let mut frame_seq: u64 = 0;

    while !stop_flag.load(Ordering::Relaxed) {
        let frame_start = Instant::now();

        // ── 1. 捕获帧(排空相机缓冲区) ──
        let buffer = match camera.frame() {
            Ok(buf) => {
                consecutive_failures = 0;
                buf
            }
            Err(error) => {
                consecutive_failures += 1;
                if consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
                    let _ = app.emit("vision://error", camera_message(&error));
                    break;
                }
                thread::sleep(Duration::from_millis(50));
                continue;
            }
        };

        let captured_at = epoch.elapsed().as_secs_f64() * 1000.0;

        // ── 2. 提取原始 JPEG 字节(零解码零编码) ──
        // 相机格式为 MJPEG 时,buffer() 返回的就是完整 JPEG 数据。
        // 极少数摄像头不支持 MJPEG 时,回退到解码+编码。
        let raw = buffer.buffer().to_vec();
        let jpeg_bytes = if is_jpeg(&raw) {
            // 原始 MJPEG 字节直接使用(零 CPU 开销)。
            raw
        } else {
            // 回退:解码 RGB → 编码 JPEG。
            match buffer.decode_image::<RgbFormat>() {
                Ok(rgb) => encode_jpeg_fallback(&rgb),
                Err(error) => {
                    consecutive_failures += 1;
                    if consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
                        let _ = app.emit("vision://error", camera_message(&error));
                        break;
                    }
                    continue;
                }
            }
        };

        // ── 3. 推送低频预览事件，再存入共享缓冲供推理线程读取 ──
        frame_seq += 1;
        if frame_seq % PREVIEW_FRAME_DIVISOR == 0 {
            let _ = app.emit("vision://preview", preview_data_url(&jpeg_bytes));
        }
        if let Ok(mut guard) = latest_capture.lock() {
            *guard = Some(CapturedFrame {
                jpeg: jpeg_bytes,
                captured_at_ms: captured_at,
                seq: frame_seq,
            });
        }

        // ── 4. 节流到目标帧率 ──
        let elapsed = frame_start.elapsed();
        if elapsed < CAPTURE_INTERVAL {
            thread::sleep(CAPTURE_INTERVAL - elapsed);
        }
    }

    let _ = camera.stop_stream();
}

// ════════════════════════════════════════════════════════════════════════════
//  推理线程
// ════════════════════════════════════════════════════════════════════════════

/// 推理线程主循环:取原始 JPEG → 解码 RGB → letterbox → MoveNet 推理 → emit 观测值。
fn run_inference_loop(
    app: tauri::AppHandle,
    model: Arc<Mutex<Option<Session>>>,
    latest_capture: Arc<Mutex<Option<CapturedFrame>>>,
    baseline: f64,
    stop_flag: Arc<AtomicBool>,
    _epoch: Instant,
) {
    let mut sequence: u64 = 0;
    let dropped_frames: u64 = 0;
    let mut last_processed_seq: u64 = 0;
    // EMA 平滑后的关键点历史,用于抑制逐帧波动。
    let mut smoothed: Option<PoseResult> = None;

    while !stop_flag.load(Ordering::Relaxed) {
        // ── 1. 取最新 JPEG 帧(跳过已处理帧) ──
        let (jpeg, captured_at, frame_seq) = {
            let Ok(guard) = latest_capture.lock() else {
                thread::sleep(Duration::from_millis(10));
                continue;
            };
            let Some(frame) = guard.as_ref() else {
                thread::sleep(Duration::from_millis(10));
                continue;
            };
            if frame.seq <= last_processed_seq {
                // 已处理过此帧,等待新帧到达。
                thread::sleep(Duration::from_millis(5));
                continue;
            }
            (frame.jpeg.clone(), frame.captured_at_ms, frame.seq)
        };
        last_processed_seq = frame_seq;

        // ── 2. 解码 JPEG → RGB ──
        let rgb = match image::load_from_memory(&jpeg) {
            Ok(img) => img.to_rgb8(),
            Err(_) => {
                // 跳过无法解码的帧。
                thread::sleep(Duration::from_millis(5));
                continue;
            }
        };

        // ── 3. 姿态推理 ──
        let pose_started = Instant::now();
        let raw_pose = match run_pose(&model, &rgb) {
            Ok(p) => p,
            Err(error) => {
                let _ = app.emit("vision://error", error);
                break;
            }
        };
        let pose_ms = pose_started.elapsed().as_secs_f64() * 1000.0;

        // ── 3b. EMA 时间域平滑(抑制逐帧波动) ──
        let pose = smooth_pose(&raw_pose, &smoothed, EMA_ALPHA);
        smoothed = Some(pose.clone());

        // ── 4. 观测融合 ──
        let brightness = mean_brightness(&rgb);
        let observation = create_observation(&pose, baseline, brightness, pose_ms);
        let head_ratio = head_ratio_of(&pose);

        sequence += 1;

        let landmarks = pose
            .keypoints
            .iter()
            .take(HEAD_KEYPOINTS.len())
            .map(|keypoint| LandmarkPoint {
                x: keypoint.x,
                y: keypoint.y,
                score: keypoint.score,
            })
            .collect();

        let frame = VisionFrame {
            observation: VisionObservation {
                sequence,
                captured_at_monotonic_ms: captured_at,
                metrics: VisionMetrics {
                    pose_ms,
                    dropped_frames,
                },
                ..observation
            },
            head_ratio,
            landmarks,
        };

        // ── 5. emit 观测值事件 ──
        let _ = app.emit("vision://frame", &frame);

        // 姿态行为以秒为单位判断;仅处理最新帧并保持 5 FPS 的观测节奏。
        let elapsed = pose_started.elapsed();
        if elapsed < INFERENCE_INTERVAL {
            thread::sleep(INFERENCE_INTERVAL - elapsed);
        }
    }
}

/// EMA 时间域平滑:对新帧关键点与历史关键点做指数加权平均。
///
/// 平滑 score 以稳定置信度,平滑 (x, y) 以稳定头部位置。
/// 首帧( `history` 为 None)直接返回原始结果。
/// `alpha` 为新帧权重(0~1),值越小越平滑。
fn smooth_pose(raw: &PoseResult, history: &Option<PoseResult>, alpha: f64) -> PoseResult {
    let history = match history {
        Some(h) => h,
        None => return raw.clone(),
    };
    let beta = 1.0 - alpha;
    let mut smoothed = PoseResult::default();
    smoothed.keypoints.reserve(raw.keypoints.len());
    for (new, old) in raw.keypoints.iter().zip(history.keypoints.iter()) {
        smoothed.keypoints.push(Keypoint {
            x: new.x * alpha + old.x * beta,
            y: new.y * alpha + old.y * beta,
            score: new.score * alpha + old.score * beta,
        });
    }
    smoothed.max_score = smoothed
        .keypoints
        .iter()
        .map(|k| k.score)
        .fold(0.0_f64, f64::max);
    smoothed
}

/// 运行 MoveNet SinglePose Lightning 推理:预处理 → ONNX 推理 → 关键点解码。
///
/// MoveNet 输出单个张量 [1, 1, 17, 3],每个关键点为 (y, x, score)。
/// y, x 为归一化坐标 [0, 1](相对于输入图像),score 为置信度 [0, 1]。
fn run_pose(
    model: &Mutex<Option<Session>>,
    rgb: &ImageBuffer<Rgb<u8>, Vec<u8>>,
) -> Result<PoseResult, String> {
    let mut guard = model
        .lock()
        .map_err(|_| "姿态模型会话锁已损坏".to_string())?;
    let session = guard
        .as_mut()
        .ok_or_else(|| "姿态模型尚未加载".to_string())?;

    // ── 预处理:letterbox → NHWC int32 [0,255] ──
    let (pixels, lb) = letterbox_rgb(rgb, INPUT_SIZE);
    let shape = vec![1i64, i64::from(INPUT_SIZE), i64::from(INPUT_SIZE), 3];
    let tensor =
        Tensor::from_array((shape, pixels)).map_err(|error| format!("构造推理输入失败:{error}"))?;

    // ── ONNX 推理 ──
    let outputs = session
        .run(ort::inputs![INPUT_NAME => tensor])
        .map_err(|error| format!("姿态推理失败:{error}"))?;

    // ── 提取输出张量 [1, 1, 17, 3] ──
    let (_, data) = outputs[0]
        .try_extract_tensor::<f32>()
        .map_err(|error| format!("读取推理输出失败:{error}"))?;
    let flat = data.to_vec();

    // ── 解码 17 个关键点 ──
    let mut result = PoseResult::default();
    result.keypoints.reserve(KEYPOINT_COUNT);
    for k in 0..KEYPOINT_COUNT {
        let base = k * 3;
        let y_norm = f64::from(flat[base]);
        let x_norm = f64::from(flat[base + 1]);
        let score = f64::from(flat[base + 2]);

        // MoveNet 输出坐标是相对于输入图像的归一化坐标 [0, 1]
        // letterbox 逆变换:从输入图像坐标映射回原始图像归一化坐标 [0, 1]
        let x_pixel = x_norm * INPUT_SIZE as f64;
        let y_pixel = y_norm * INPUT_SIZE as f64;
        let x = if lb.resized_w > 0 {
            clamp01((x_pixel - lb.offset_x) / lb.resized_w as f64)
        } else {
            0.5
        };
        let y = if lb.resized_h > 0 {
            clamp01((y_pixel - lb.offset_y) / lb.resized_h as f64)
        } else {
            0.5
        };

        let keypoint = Keypoint { x, y, score };
        result.max_score = result.max_score.max(keypoint.score);
        result.keypoints.push(keypoint);
    }
    Ok(result)
}

/// Letterbox 参数:用于输出坐标到原始图像坐标的逆变换。
struct LetterboxInfo {
    offset_x: f64,
    offset_y: f64,
    resized_w: u32,
    resized_h: u32,
}

/// MoveNet 预处理:letterbox 到 target_size × target_size,NHWC int32 [0,255]。
///
/// MoveNet 使用 NHWC 布局(channel-last),int32 数据类型,像素值范围 [0, 255]。
/// 不做 mean/std 归一化,直接传入原始像素值。
fn letterbox_rgb(
    rgb: &ImageBuffer<Rgb<u8>, Vec<u8>>,
    target_size: u32,
) -> (Vec<i32>, LetterboxInfo) {
    let (width, height) = (rgb.width(), rgb.height());
    let scale = (target_size as f32 / width as f32).min(target_size as f32 / height as f32);
    let resized_width = ((width as f32 * scale).round() as u32)
        .max(1)
        .min(target_size);
    let resized_height = ((height as f32 * scale).round() as u32)
        .max(1)
        .min(target_size);
    let resized = imageops::resize(
        rgb,
        resized_width,
        resized_height,
        imageops::FilterType::Triangle,
    );
    let offset_x = (target_size - resized_width) / 2;
    let offset_y = (target_size - resized_height) / 2;

    // NHWC: [height, width, channel] — 先按行列再按通道排列
    let mut output = vec![0i32; (target_size * target_size * 3) as usize];
    for y in 0..resized_height {
        for x in 0..resized_width {
            let pixel = resized.get_pixel(x, y);
            let dst_x = offset_x + x;
            let dst_y = offset_y + y;
            // NHWC 索引: [h][w][c] = (dst_y * target_size + dst_x) * 3 + c
            let base = ((dst_y * target_size + dst_x) * 3) as usize;
            output[base] = pixel[0] as i32;
            output[base + 1] = pixel[1] as i32;
            output[base + 2] = pixel[2] as i32;
        }
    }

    let lb = LetterboxInfo {
        offset_x: offset_x as f64,
        offset_y: offset_y as f64,
        resized_w: resized_width,
        resized_h: resized_height,
    };
    (output, lb)
}

/// 亮度估算:用 Nearest 滤波快速缩放到极小尺寸后采样。
fn mean_brightness(rgb: &ImageBuffer<Rgb<u8>, Vec<u8>>) -> f64 {
    let small = imageops::resize(rgb, 32, 18, imageops::FilterType::Nearest);
    let mut sum = 0.0;
    let mut count = 0.0;
    for (index, pixel) in small.pixels().enumerate() {
        if index % 8 == 0 {
            sum += f64::from(pixel[0]) * 0.2126
                + f64::from(pixel[1]) * 0.7152
                + f64::from(pixel[2]) * 0.0722;
            count += 1.0;
        }
    }
    if count == 0.0 {
        0.0
    } else {
        sum / count
    }
}

/// 回退编码:当相机不输出 MJPEG 时,将 RGB 编码为 JPEG。
fn encode_jpeg_fallback(rgb: &ImageBuffer<Rgb<u8>, Vec<u8>>) -> Vec<u8> {
    use image::codecs::jpeg::JpegEncoder;
    let (width, height) = (rgb.width(), rgb.height());
    // 缩小到 480px 宽以减小体积。
    let max_width = 480u32;
    let (preview_width, preview_height) = if width > max_width {
        (max_width, (height * max_width / width).max(1))
    } else {
        (width, height)
    };
    let small = imageops::resize(
        rgb,
        preview_width,
        preview_height,
        imageops::FilterType::Triangle,
    );
    let mut buffer = Vec::with_capacity(8 * 1024);
    let mut encoder = JpegEncoder::new_with_quality(&mut buffer, 65);
    let _ = encoder.encode_image(&DynamicImage::ImageRgb8(small));
    buffer
}

// ════════════════════════════════════════════════════════════════════════════
//  纯头部识别:肩膀、手臂及身体关键点不参与任何判断
// ════════════════════════════════════════════════════════════════════════════

/// 头部质心:鼻尖+双眼+双耳可信点的中位数位置。
///
/// 自动适应遮挡:若鼻尖被手遮挡但双眼可见,仍能估算头部位置。
/// 若转头导致一侧耳朵消失,另一侧耳朵+双眼仍可补偿。
///
/// 至少需要三个可信且聚集的头部点,避免手臂遮挡时散落的错误关键点被误认为头部。
/// 返回 `(x, y, 平均置信度)` 或 `None`。
fn head_centroid(pose: &PoseResult) -> Option<(f64, f64, f64)> {
    let points: Vec<&Keypoint> = HEAD_KEYPOINTS
        .iter()
        .filter_map(|&i| {
            pose.keypoints
                .get(i)
                .filter(|k| k.score >= KEYPOINT_TRUST_THRESHOLD)
        })
        .collect();
    if points.len() < 3 {
        return None;
    }

    let mut xs: Vec<f64> = points.iter().map(|point| point.x).collect();
    let mut ys: Vec<f64> = points.iter().map(|point| point.y).collect();
    xs.sort_by(f64::total_cmp);
    ys.sort_by(f64::total_cmp);
    let x_span = xs.last()? - xs.first()?;
    let y_span = ys.last()? - ys.first()?;
    if x_span > HEAD_CLUSTER_MAX_WIDTH || y_span > HEAD_CLUSTER_MAX_HEIGHT {
        return None;
    }

    let middle = points.len() / 2;
    let cx = xs[middle];
    let cy = ys[middle];
    let avg_score = points.iter().map(|point| point.score).sum::<f64>() / points.len() as f64;
    Some((cx, cy, avg_score))
}

/// 兼容既有事件字段名 `head_ratio`,实际返回 0..1 归一化画面中的头部 y 位置。
/// 相机固定时,它比头肩比更适合笔记本近距离取景:肩部完全不入镜仍能完成校准和低头判断。
fn head_ratio_of(pose: &PoseResult) -> Option<f64> {
    let (_, head_y, _) = head_centroid(pose)?;
    Some(head_y)
}

/// 判断单侧的耳 -> 眼 -> 鼻是否形成低头时的向下、向脸中心收拢的折线。
///
/// 图像坐标的 y 轴向下，因此真实低头应满足 `ear.y < eye.y < nose.y`。
/// 不依赖 MoveNet 左右标签在预览镜像中的显示方向，只比较耳和眼到鼻子的距离。
fn side_forms_head_down_chain(nose: &Keypoint, eye: &Keypoint, ear: &Keypoint) -> bool {
    let ear_offset_x = ear.x - nose.x;
    let eye_offset_x = eye.x - nose.x;
    let side_width = ear_offset_x.abs();
    if side_width <= HEAD_DOWN_MIN_INWARD_GAP {
        return false;
    }

    // 耳和眼必须位于鼻子的同一侧，并且耳比眼更远离脸部中心。
    let same_side = ear_offset_x * eye_offset_x > 0.0;
    let inward_gap = side_width - eye_offset_x.abs();

    // 间距阈值随当前人脸宽度缩放，同时保留绝对下限以抑制关键点抖动。
    let vertical_gap = (side_width * 0.04).max(HEAD_DOWN_MIN_VERTICAL_GAP);
    let horizontal_gap = (side_width * 0.03).max(HEAD_DOWN_MIN_INWARD_GAP);

    same_side
        && inward_gap > horizontal_gap
        && eye.y - ear.y > vertical_gap
        && nose.y - eye.y > vertical_gap
}

/// 低头必须同时具备可校验的耳-眼-鼻几何证据。
///
/// 一侧被可靠遮挡时允许用另一侧判断；两侧都达到可信阈值时，两侧必须都符合，
/// 防止单侧漂移或错误关键点触发低头。鼻尖是两条折线的公共锚点，缺失时不作肯定判断。
fn has_head_down_geometry(pose: &PoseResult) -> bool {
    let Some(nose) = pose
        .keypoints
        .get(NOSE)
        .filter(|point| point.score >= KEYPOINT_TRUST_THRESHOLD)
    else {
        return false;
    };

    let mut visible_sides = 0;
    let mut matching_sides = 0;
    for (eye_index, ear_index) in [(LEFT_EYE, LEFT_EAR), (RIGHT_EYE, RIGHT_EAR)] {
        let Some(eye) = pose
            .keypoints
            .get(eye_index)
            .filter(|point| point.score >= KEYPOINT_TRUST_THRESHOLD)
        else {
            continue;
        };
        let Some(ear) = pose
            .keypoints
            .get(ear_index)
            .filter(|point| point.score >= KEYPOINT_TRUST_THRESHOLD)
        else {
            continue;
        };

        visible_sides += 1;
        if side_forms_head_down_chain(nose, eye, ear) {
            matching_sides += 1;
        }
    }

    visible_sides > 0 && matching_sides == visible_sides
}

/// 头部证据取五个头部关键点中最高三个的平均值。
/// 固定除以 3 意味着只有一个高分点时不会被当成完整头部。
/// MoveNet score 不是校准后的概率；0.15 以下通常是噪声，0.80 已是稳定证据。
/// 显示和状态机使用映射后的产品质量值，原始阈值仍用于关键点可信性筛选。
fn model_score_quality(score: f64) -> f64 {
    clamp01((score - 0.15) / 0.65)
}

fn head_visibility_of(pose: &PoseResult) -> f64 {
    let mut scores: Vec<f64> = HEAD_KEYPOINTS
        .iter()
        .filter_map(|&index| pose.keypoints.get(index).map(|keypoint| keypoint.score))
        .collect();
    scores.sort_by(|a, b| b.partial_cmp(a).unwrap_or(std::cmp::Ordering::Equal));
    scores
        .iter()
        .take(3)
        .map(|score| model_score_quality(*score))
        .sum::<f64>()
        / 3.0
}

/// 产品场景只接受头部证据。肩膀、手臂和身体关键点即使置信度很高也被忽略。
fn visibility_of(pose: &PoseResult) -> f64 {
    clamp01(head_visibility_of(pose))
}

fn posture_of(pose: &PoseResult) -> (PostureState, f64) {
    let Some(_) = head_centroid(pose) else {
        return (PostureState::Unknown, 0.0);
    };
    let confidence = visibility_of(pose);
    if confidence < VISIBILITY_OCCLUDED_THRESHOLD {
        return (PostureState::Unknown, confidence);
    }

    // 移除肩部后，头部上移无法可靠区分站立、坐直、前后移动和模型漂移。
    // 因此视觉层不再自动发布 Standing，避免手臂遮挡触发站立休息。
    (PostureState::Sitting, confidence)
}

fn create_observation(
    pose: &PoseResult,
    baseline: f64,
    brightness: f64,
    pose_ms: f64,
) -> VisionObservation {
    let head_position = head_centroid(pose);
    let visibility = visibility_of(pose);
    let presence_confidence = visibility;
    if presence_confidence < PRESENCE_THRESHOLD {
        return VisionObservation {
            schema_version: SCHEMA_VERSION,
            sequence: 0,
            captured_at_monotonic_ms: 0.0,
            person: PersonObservation {
                present: false,
                confidence: 0.0,
            },
            posture: PostureObservation {
                state: PostureState::Unknown,
                confidence: 0.0,
            },
            head: HeadObservation {
                down_score: 0.0,
                confidence: 0.0,
            },
            frame_quality: if brightness < BRIGHTNESS_DARK_THRESHOLD {
                FrameQuality::Dark
            } else {
                FrameQuality::Unstable
            },
            metrics: VisionMetrics {
                pose_ms,
                dropped_frames: 0,
            },
        };
    }

    if head_position.is_none() {
        return VisionObservation {
            schema_version: SCHEMA_VERSION,
            sequence: 0,
            captured_at_monotonic_ms: 0.0,
            person: PersonObservation {
                present: true,
                confidence: presence_confidence,
            },
            posture: PostureObservation {
                state: PostureState::Unknown,
                confidence: 0.0,
            },
            head: HeadObservation {
                down_score: 0.0,
                confidence: 0.0,
            },
            frame_quality: if brightness < BRIGHTNESS_DARK_THRESHOLD {
                FrameQuality::Dark
            } else {
                FrameQuality::Occluded
            },
            metrics: VisionMetrics {
                pose_ms,
                dropped_frames: 0,
            },
        };
    }

    let frame_quality = if brightness < BRIGHTNESS_DARK_THRESHOLD {
        FrameQuality::Dark
    } else if visibility < VISIBILITY_OCCLUDED_THRESHOLD {
        FrameQuality::Occluded
    } else {
        FrameQuality::Good
    };
    let ratio = head_ratio_of(pose);
    let delta = if (0.0..=1.0).contains(&baseline) {
        ratio.map(|value| value - baseline).unwrap_or(0.0)
    } else {
        0.0
    };
    // 只有“相对校准位置下移”和“耳-眼-鼻低头折线”同时成立才输出低头分数。
    // 这样整个人下沉、靠近镜头或五点整体漂移不会单独累积成低头提醒。
    let down_score = if frame_quality == FrameQuality::Good && has_head_down_geometry(pose) {
        clamp01(clamp01((delta - 0.025) / 0.12) * 0.85)
    } else {
        0.0
    };
    let (state, posture_confidence) = posture_of(pose);

    VisionObservation {
        schema_version: SCHEMA_VERSION,
        sequence: 0,
        captured_at_monotonic_ms: 0.0,
        person: PersonObservation {
            present: true,
            confidence: presence_confidence,
        },
        posture: PostureObservation {
            state,
            confidence: posture_confidence,
        },
        head: HeadObservation {
            down_score,
            confidence: visibility,
        },
        frame_quality,
        metrics: VisionMetrics {
            pose_ms,
            dropped_frames: 0,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preview_event_uses_an_embeddable_jpeg_data_url() {
        assert_eq!(
            preview_data_url(&[0xff, 0xd8, 0xff, 0xd9]),
            "data:image/jpeg;base64,/9j/2Q=="
        );
    }

    #[test]
    fn camera_permission_error_is_not_reported_as_external_occupancy() {
        let error = nokhwa::NokhwaError::OpenDeviceError(
            "0".to_string(),
            "Access is denied. (0x80070005)".to_string(),
        );
        let message = camera_message(&error);
        assert!(message.contains("权限已关闭"), "{message}");
        assert!(!message.contains("其他应用"), "{message}");
    }

    #[test]
    fn only_an_explicit_sharing_violation_is_reported_as_busy() {
        let error = nokhwa::NokhwaError::OpenStreamError(
            "The process cannot access the device because it is being used by another process. (0x80070020)"
                .to_string(),
        );
        let message = camera_message(&error);
        assert!(message.contains("其他应用独占"), "{message}");
    }

    #[test]
    fn missing_camera_has_a_distinct_message() {
        let error = nokhwa::NokhwaError::OpenDeviceError("0".to_string(), "No device".to_string());
        let message = camera_message(&error);
        assert!(message.contains("未检测到可用摄像头"), "{message}");
    }

    #[test]
    fn driver_resource_failure_is_not_reported_as_busy() {
        let error = nokhwa::NokhwaError::OpenStreamError(
            "Hardware MFT failed to start streaming due to lack of hardware resources. (0xC00D3704)"
                .to_string(),
        );
        let message = camera_message(&error);
        assert!(message.contains("驱动或硬件资源异常"), "{message}");
        assert!(message.contains("0xC00D3704"), "{message}");
        assert!(!message.contains("其他应用"), "{message}");
    }

    #[test]
    fn unknown_open_failure_stays_neutral_and_keeps_hresult() {
        let error = nokhwa::NokhwaError::OpenDeviceError(
            "0".to_string(),
            "Unspecified failure. (0x80004005)".to_string(),
        );
        let message = camera_message(&error);
        assert!(message.contains("摄像头启动失败"), "{message}");
        assert!(message.contains("0x80004005"), "{message}");
        assert!(!message.contains("其他应用独占"), "{message}");
    }

    fn keypoint(x: f64, y: f64, score: f64) -> Keypoint {
        Keypoint { x, y, score }
    }

    fn seated(nose_y: f64) -> PoseResult {
        let mut points = vec![keypoint(0.5, 0.5, 0.0); KEYPOINT_COUNT];
        points[NOSE] = keypoint(0.5, nose_y, 0.95);
        points[LEFT_EYE] = keypoint(0.48, nose_y - 0.02, 0.9);
        points[RIGHT_EYE] = keypoint(0.52, nose_y - 0.02, 0.9);
        points[LEFT_EAR] = keypoint(0.44, nose_y + 0.02, 0.3);
        points[RIGHT_EAR] = keypoint(0.56, nose_y + 0.02, 0.3);
        let max_score = points.iter().map(|point| point.score).fold(0.0, f64::max);
        PoseResult {
            keypoints: points,
            max_score,
        }
    }

    fn head_down(nose_y: f64) -> PoseResult {
        let mut points = vec![keypoint(0.5, 0.5, 0.0); KEYPOINT_COUNT];
        points[NOSE] = keypoint(0.5, nose_y, 0.95);
        points[LEFT_EYE] = keypoint(0.47, nose_y - 0.04, 0.9);
        points[RIGHT_EYE] = keypoint(0.53, nose_y - 0.04, 0.9);
        points[LEFT_EAR] = keypoint(0.41, nose_y - 0.08, 0.8);
        points[RIGHT_EAR] = keypoint(0.59, nose_y - 0.08, 0.8);
        let max_score = points.iter().map(|point| point.score).fold(0.0, f64::max);
        PoseResult {
            keypoints: points,
            max_score,
        }
    }

    #[test]
    fn uses_calibrated_head_position_and_face_geometry() {
        let normal = seated(0.4);
        let down = head_down(0.56);
        let baseline = head_ratio_of(&normal).expect("normal ratio");
        let observation = create_observation(&down, baseline, 120.0, 20.0);
        assert!(observation.head.down_score > 0.5);
    }

    #[test]
    fn downward_translation_without_face_geometry_is_not_head_down() {
        let normal = seated(0.4);
        let shifted_normal = seated(0.52);
        let baseline = head_ratio_of(&normal).expect("normal ratio");

        let observation = create_observation(&shifted_normal, baseline, 120.0, 20.0);

        assert_eq!(observation.head.down_score, 0.0);
    }

    #[test]
    fn gates_low_light_frames() {
        let observation = create_observation(&seated(0.4), -1.0, 10.0, 20.0);
        assert_eq!(observation.frame_quality, FrameQuality::Dark);
    }

    #[test]
    fn recognizes_seated_person_from_head_only() {
        let pose = seated(0.45);
        let observation = create_observation(&pose, 0.45, 120.0, 20.0);
        assert_eq!(observation.frame_quality, FrameQuality::Good);
        assert!(observation.person.confidence > 0.85);
        assert_eq!(observation.posture.state, PostureState::Sitting);
        assert!(observation.posture.confidence > 0.8);
    }

    #[test]
    fn body_keypoints_do_not_change_head_quality() {
        let pose = seated(0.45);
        let expected = visibility_of(&pose);
        let mut with_body = pose.clone();
        for index in HEAD_KEYPOINTS.len()..KEYPOINT_COUNT {
            with_body.keypoints[index] = keypoint(0.5, 0.7, 0.99);
        }

        assert_eq!(visibility_of(&with_body), expected);
        let observation = create_observation(&with_body, 0.45, 120.0, 20.0);
        assert_eq!(observation.posture.state, PostureState::Sitting);
    }

    #[test]
    fn typical_movenet_scores_are_calibrated_to_product_quality() {
        let mut pose = seated(0.45);
        for &index in &HEAD_KEYPOINTS {
            pose.keypoints[index].score = 0.6;
        }
        let quality = visibility_of(&pose);
        assert!(quality > 0.65 && quality < 0.72, "quality = {quality}");
    }

    #[test]
    fn visibility_stable_when_head_turned() {
        // 模拟转头:鼻尖+左眼+左耳 score 突降
        let mut turned = seated(0.4);
        turned.keypoints[NOSE].score = 0.3;
        turned.keypoints[LEFT_EYE].score = 0.3;
        turned.keypoints[LEFT_EAR].score = 0.1;
        let observation = create_observation(&turned, 0.4, 120.0, 20.0);
        assert!(observation.person.present);
        assert_eq!(observation.frame_quality, FrameQuality::Occluded);
        assert_eq!(observation.posture.state, PostureState::Unknown);
        assert_eq!(observation.head.down_score, 0.0);
    }

    #[test]
    fn visibility_stable_when_hand_covers_face() {
        // 模拟手摸脸:双眼被遮挡
        let mut hand_on_face = seated(0.4);
        hand_on_face.keypoints[LEFT_EYE].score = 0.1;
        hand_on_face.keypoints[RIGHT_EYE].score = 0.1;
        let observation = create_observation(&hand_on_face, 0.4, 120.0, 20.0);
        assert!(observation.person.present);
        assert_eq!(observation.frame_quality, FrameQuality::Occluded);
        assert_eq!(observation.posture.state, PostureState::Unknown);
        assert_eq!(observation.head.down_score, 0.0);
    }

    #[test]
    fn head_centroid_works_without_nose() {
        // 鼻尖被手遮挡,但双眼可见
        let mut pose = seated(0.4);
        pose.keypoints[NOSE].score = 0.1;
        let centroid = head_centroid(&pose);
        assert!(centroid.is_some(), "head_centroid should work without nose");
        let (_, _, conf) = centroid.unwrap();
        assert!(conf > 0.5, "head confidence = {conf}");
    }

    #[test]
    fn head_centroid_fails_when_all_head_keypoints_low() {
        let mut pose = seated(0.4);
        for &i in &HEAD_KEYPOINTS {
            pose.keypoints[i].score = 0.1;
        }
        assert!(head_centroid(&pose).is_none());
    }

    #[test]
    fn body_keypoints_cannot_assert_presence_without_a_head() {
        let mut pose = seated(0.4);
        for &index in &HEAD_KEYPOINTS {
            pose.keypoints[index].score = 0.1;
        }
        for index in HEAD_KEYPOINTS.len()..KEYPOINT_COUNT {
            pose.keypoints[index] = keypoint(0.5, 0.7, 0.99);
        }

        let observation = create_observation(&pose, 0.4, 120.0, 20.0);

        assert!(!observation.person.present);
    }

    #[test]
    fn scattered_head_points_are_rejected_as_occlusion() {
        let mut pose = seated(0.4);
        pose.keypoints[RIGHT_EAR].x = 0.95;

        let observation = create_observation(&pose, 0.4, 120.0, 20.0);

        assert!(observation.person.present);
        assert_eq!(observation.posture.state, PostureState::Unknown);
        assert_eq!(observation.frame_quality, FrameQuality::Occluded);
        assert_eq!(observation.head.down_score, 0.0);
    }

    #[test]
    fn head_position_works_without_shoulders() {
        let pose = seated(0.4);
        let ratio = head_ratio_of(&pose);
        assert!(
            ratio.is_some(),
            "head position should not require shoulders"
        );
        assert!((ratio.unwrap() - 0.4).abs() < 0.03);
    }

    #[test]
    fn head_down_geometry_works_with_one_reliably_visible_side() {
        let normal = seated(0.4);
        let baseline = head_ratio_of(&normal).expect("normal ratio");
        // 一侧耳朵被遮挡时，另一侧完整的耳-眼-鼻链仍可提供几何证据。
        let mut occluded = head_down(0.56);
        occluded.keypoints[LEFT_EAR].score = 0.1;
        let ratio = head_ratio_of(&occluded);
        assert!(
            ratio.is_some(),
            "head_ratio should work with one visible side"
        );
        let observation = create_observation(&occluded, baseline, 120.0, 20.0);
        assert!(
            observation.head.down_score > 0.5,
            "down_score = {}",
            observation.head.down_score
        );
    }

    #[test]
    fn missing_nose_cannot_assert_head_down_geometry() {
        let normal = seated(0.4);
        let baseline = head_ratio_of(&normal).expect("normal ratio");
        let mut occluded = head_down(0.56);
        occluded.keypoints[NOSE].score = 0.1;

        let observation = create_observation(&occluded, baseline, 120.0, 20.0);

        assert_eq!(observation.head.down_score, 0.0);
    }

    #[test]
    fn head_rise_is_not_interpreted_as_standing() {
        let normal = seated(0.43);
        let baseline = head_ratio_of(&normal).expect("normal position");
        let mut raised = seated(0.30);
        for index in HEAD_KEYPOINTS.len()..KEYPOINT_COUNT {
            raised.keypoints[index] = keypoint(0.5, 0.7, 0.99);
        }
        let observation = create_observation(&raised, baseline, 120.0, 20.0);
        assert_eq!(observation.posture.state, PostureState::Sitting);
        assert!(observation.posture.confidence > 0.8);
    }

    #[test]
    fn smooth_pose_reduces_score_fluctuation() {
        // 模拟 MoveNet 逐帧 score 波动: 0.95 → 0.5
        let frame_a = seated(0.4);
        let frame_b = {
            let mut p = seated(0.4);
            // 模拟鼻尖 score 突降
            p.keypoints[NOSE].score = 0.5;
            p
        };
        // 无平滑: frame_b 鼻尖 score = 0.5
        assert_eq!(frame_b.keypoints[NOSE].score, 0.5);
        // 有 EMA 平滑: 0.5 * 0.5 + 0.95 * 0.5 = 0.725
        let smoothed = smooth_pose(&frame_b, &Some(frame_a), 0.5);
        assert!(smoothed.keypoints[NOSE].score > 0.6);
        assert!(smoothed.keypoints[NOSE].score < 0.8);
    }

    #[test]
    fn smooth_pose_first_frame_returns_raw() {
        let raw = seated(0.4);
        let smoothed = smooth_pose(&raw, &None, 0.5);
        assert_eq!(smoothed.keypoints[NOSE].score, raw.keypoints[NOSE].score);
    }

    #[test]
    fn no_person_when_all_scores_low() {
        let empty = PoseResult {
            keypoints: vec![keypoint(0.5, 0.5, 0.01); KEYPOINT_COUNT],
            max_score: 0.01,
        };
        let observation = create_observation(&empty, -0.9, 120.0, 20.0);
        assert!(!observation.person.present);
        assert_eq!(observation.frame_quality, FrameQuality::Unstable);
    }

    #[test]
    fn is_jpeg_detects_soi_marker() {
        assert!(is_jpeg(&[0xFF, 0xD8, 0x00]));
        assert!(!is_jpeg(&[0x00, 0x00]));
        assert!(!is_jpeg(&[]));
    }

    #[test]
    fn letterbox_rgb_produces_correct_layout() {
        // 创建 2x2 红色图像
        let img = ImageBuffer::from_raw(2, 2, vec![200, 0, 0, 200, 0, 0, 200, 0, 0, 200, 0, 0])
            .expect("create image");
        let (pixels, lb) = letterbox_rgb(&img, 4);
        // 2x2 图像缩放到 4x4:scale = min(4/2, 4/2) = 2, resized = 4x4, offset = 0
        assert_eq!(lb.resized_w, 4);
        assert_eq!(lb.resized_h, 4);
        assert_eq!(lb.offset_x, 0.0);
        assert_eq!(lb.offset_y, 0.0);
        // NHWC 布局:4*4*3 = 48 个 int32
        assert_eq!(pixels.len(), 48);
        // NHWC:第一个像素的 R 通道在 pixels[0]
        assert_eq!(pixels[0], 200, "R channel = {}", pixels[0]);
        // G 通道在 pixels[1]
        assert_eq!(pixels[1], 0, "G channel = {}", pixels[1]);
        // B 通道在 pixels[2]
        assert_eq!(pixels[2], 0, "B channel = {}", pixels[2]);
    }

    #[test]
    fn letterbox_rgb_preserves_aspect() {
        // 640x480 图像缩放到 192x192:scale = min(192/640, 192/480) = 0.3
        let img = ImageBuffer::from_raw(640, 480, vec![128; 640 * 480 * 3]).expect("create image");
        let (_, lb) = letterbox_rgb(&img, INPUT_SIZE);
        assert_eq!(lb.resized_w, 192); // 640 * 0.3 = 192
        assert_eq!(lb.resized_h, 144); // 480 * 0.3 = 144
                                       // offset_x = (192 - 192) / 2 = 0
        assert_eq!(lb.offset_x, 0.0);
        // offset_y = (192 - 144) / 2 = 24
        assert_eq!(lb.offset_y, 24.0);
    }
}
