//! 面向用户的 Rust 侧文案消息表（键值单一来源）。
//!
//! 每条消息由 `zh` / `en` 两个字段组成，语言只来自 `AppSettings.language`。
//! 提醒文案、摄像头与模型错误、托盘菜单、设置校验错误和 CSV 表头都从这里
//! 取文案；前端只展示后端给定的字符串，不再做任何二次翻译或前缀匹配。

use tauri::Manager;

use crate::model::AppSettings;

/// 界面语言。来源只有 `AppSettings.language`，解析失败时回落到中文。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Language {
    ZhCn,
    EnUs,
}

impl Language {
    pub fn from_setting(value: &str) -> Self {
        if value == "en-US" {
            Language::EnUs
        } else {
            Language::ZhCn
        }
    }

    pub fn of_settings(settings: &AppSettings) -> Self {
        Self::from_setting(&settings.language)
    }
}

/// 一条双语消息。`zh` 与现有中文文案逐字一致，`en` 为英文界面文案。
pub struct Message {
    pub zh: &'static str,
    pub en: &'static str,
}

impl Message {
    pub fn get(&self, language: Language) -> &'static str {
        match language {
            Language::ZhCn => self.zh,
            Language::EnUs => self.en,
        }
    }

    /// 用 `format` 把模板中的 `{name}` 占位符替换为参数值。
    pub fn format(&self, language: Language, params: &[(&str, &str)]) -> String {
        params
            .iter()
            .fold(self.get(language).to_string(), |text, (key, value)| {
                text.replace(&format!("{{{key}}}"), value)
            })
    }
}

/// 从应用状态读取当前界面语言；状态尚未就绪时回落到中文。
pub fn current_language(app: &tauri::AppHandle) -> Language {
    app.try_state::<crate::AppContext>()
        .and_then(|context| {
            context
                .core
                .lock()
                .ok()
                .map(|core| Language::of_settings(core.settings()))
        })
        .unwrap_or(Language::ZhCn)
}

pub mod msg {
    use super::Message;

    // ── 提醒文案（core.rs 状态机） ──
    pub const REMINDER_COMBINED_TITLE: Message = Message {
        zh: "该舒展一下了",
        en: "Time to stretch",
    };
    pub const REMINDER_COMBINED_BODY: Message = Message {
        zh: "你已经连续坐了一段时间，也有持续低头的迹象。建议站起来活动 2～5 分钟。",
        en:
            "You have been sitting and looking down for a while. Stand up and move for 2–5 minutes.",
    };
    pub const REMINDER_SEDENTARY_TITLE: Message = Message {
        zh: "起来走一走吧",
        en: "Take a short walk",
    };
    pub const REMINDER_SEDENTARY_BODY: Message = Message {
        zh: "你已经连续坐了一段时间，建议站起来活动 2～5 分钟。",
        en: "You have been sitting for a while. Stand up and move for 2–5 minutes.",
    };
    pub const REMINDER_HEAD_DOWN_TITLE: Message = Message {
        zh: "试着抬起头",
        en: "Lift your head",
    };
    pub const REMINDER_HEAD_DOWN_BODY: Message = Message {
        zh: "检测到你已经低头一段时间，可以抬高视线并放松颈肩。",
        en: "You have been looking down for a while. Raise your gaze and relax your neck and shoulders.",
    };

    // ── 摄像头与姿态模型错误（vision.rs） ──
    pub const CAMERA_PERMISSION_DENIED_BY_USER: Message = Message {
        zh: "摄像头权限已关闭。请在 Windows“设置 > 隐私和安全性 > 相机”中允许桌面应用访问摄像头。",
        en: "Camera access is turned off. Allow desktop apps to access the camera in Windows Settings > Privacy & security > Camera.",
    };
    pub const CAMERA_PERMISSION_DENIED_BY_SYSTEM: Message = Message {
        zh: "摄像头访问已被 Windows 或组织策略禁用。请联系系统管理员或检查摄像头隐私设置。",
        en: "Camera access is blocked by Windows or an organization policy. Check the camera privacy policy or contact your administrator.",
    };
    pub const CAMERA_CAPABILITY_NOT_DECLARED: Message = Message {
        zh: "当前应用未声明摄像头能力。请重新安装完整版本后重试。",
        en: "This installation does not declare camera access. Reinstall the complete application and try again.",
    };
    pub const CAMERA_NO_DEVICE: Message = Message {
        zh: "未检测到可用摄像头。请确认设备已连接且未在设备管理器中禁用。",
        en: "No available camera was detected. Check that the device is connected and enabled in Device Manager.",
    };
    pub const CAMERA_BUSY: Message = Message {
        zh: "摄像头正被其他应用独占。请关闭视频会议、直播或录屏软件后重试。",
        en: "Another application has exclusive access to the camera. Close video-meeting, streaming, or recording apps and try again.",
    };
    pub const CAMERA_UNSUPPORTED_FORMAT: Message = Message {
        zh: "摄像头不支持当前视频格式。请切换摄像头或更新设备驱动后重试。{code}",
        en: "The camera does not support the required video format. Try another camera or update its driver. {code}",
    };
    pub const CAMERA_DRIVER_FAILURE: Message = Message {
        zh: "摄像头驱动或硬件资源异常。请重新连接设备或更新驱动后重试。{code}",
        en: "The camera driver or hardware resource failed. Reconnect the device or update its driver. {code}",
    };
    pub const CAMERA_READ_INTERRUPTED: Message = Message {
        zh: "摄像头连接已中断，无法继续读取画面。请检查设备连接后重试。{code}",
        en: "The camera connection was interrupted. Check the device connection and try again. {code}",
    };
    pub const CAMERA_START_FAILED: Message = Message {
        zh: "摄像头启动失败。请检查设备连接、驱动和其他应用后重试。{code}",
        en: "The camera could not start. Check the device, its driver, and other applications, then try again. {code}",
    };
    pub const CAMERA_DEVICE_LABEL: Message = Message {
        zh: "摄像头 {index}",
        en: "Camera {index}",
    };
    /// `（错误码 0x…）` 诊断后缀。中文全角括号、英文半角括号。
    pub const DIAGNOSTIC_CODE: Message = Message {
        zh: "（错误码 {code}）",
        en: " (error code {code})",
    };

    // ── 姿态模型错误 ──
    pub const MODEL_RESOURCE_DIR: Message = Message {
        zh: "无法定位应用资源目录:{error}",
        en: "Could not locate the application resources directory: {error}",
    };
    pub const MODEL_MISSING: Message = Message {
        zh: "本地姿态模型缺失,已检查:{paths}",
        en: "The local posture model is missing. Checked: {paths}",
    };
    pub const MODEL_SESSION_LOCK: Message = Message {
        zh: "姿态模型会话锁已损坏",
        en: "The posture model session lock is corrupted",
    };
    pub const MODEL_NOT_LOADED: Message = Message {
        zh: "姿态模型尚未加载",
        en: "The posture model is not loaded yet",
    };
    pub const MODEL_ENGINE_CREATE: Message = Message {
        zh: "创建推理引擎失败:{error}",
        en: "Failed to create the inference engine: {error}",
    };
    pub const MODEL_ENGINE_CONFIG: Message = Message {
        zh: "配置推理引擎失败:{error}",
        en: "Failed to configure the inference engine: {error}",
    };
    pub const MODEL_ENGINE_LOAD: Message = Message {
        zh: "加载本地姿态模型失败:{error}",
        en: "Failed to load the local posture model: {error}",
    };
    pub const MODEL_INPUT_BUILD: Message = Message {
        zh: "构造推理输入失败:{error}",
        en: "Failed to build the inference input: {error}",
    };
    pub const MODEL_INFER_FAILED: Message = Message {
        zh: "姿态推理失败:{error}",
        en: "Posture inference failed: {error}",
    };
    pub const MODEL_OUTPUT_READ: Message = Message {
        zh: "读取推理输出失败:{error}",
        en: "Failed to read the inference output: {error}",
    };

    // ── 设置校验与领域错误（model.rs / core.rs / commands.rs） ──
    pub const ERR_SCHEMA_VERSION: Message = Message {
        zh: "设置协议版本不兼容",
        en: "Incompatible settings protocol version",
    };
    pub const ERR_LANGUAGE: Message = Message {
        zh: "不支持的界面语言",
        en: "Unsupported interface language",
    };
    pub const ERR_REMINDER_THRESHOLDS: Message = Message {
        zh: "提醒阈值超出允许范围",
        en: "Reminder thresholds are outside the allowed range",
    };
    pub const ERR_SENSITIVITY: Message = Message {
        zh: "无效的检测灵敏度",
        en: "Invalid detection sensitivity",
    };
    pub const ERR_REMINDER_SOUND: Message = Message {
        zh: "无效的提示音选项",
        en: "Invalid reminder sound option",
    };
    pub const ERR_WORKDAY_START: Message = Message {
        zh: "工作开始时间格式无效",
        en: "Invalid work start time",
    };
    pub const ERR_WORKDAY_END: Message = Message {
        zh: "工作结束时间格式无效",
        en: "Invalid work end time",
    };
    pub const ERR_QUIET_START: Message = Message {
        zh: "静默开始时间格式无效",
        en: "Invalid quiet period start time",
    };
    pub const ERR_QUIET_END: Message = Message {
        zh: "静默结束时间格式无效",
        en: "Invalid quiet period end time",
    };
    pub const ERR_OBSERVATION_VERSION: Message = Message {
        zh: "不支持的观察值协议版本：{version}",
        en: "Unsupported observation protocol version: {version}",
    };
    pub const ERR_OBSERVATION_CONFIDENCE: Message = Message {
        zh: "观察值置信度必须位于 0 到 1 之间",
        en: "Observation confidence must be between 0 and 1",
    };
    pub const ERR_OBSERVATION_PERSON: Message = Message {
        zh: "人物观察值不能同时标记为在场和不确定",
        en: "A person observation cannot be both present and uncertain",
    };
    pub const ERR_OBSERVATION_NUMBERS: Message = Message {
        zh: "观察值包含无效数值",
        en: "The observation contains invalid numbers",
    };
    pub const ERR_CALIBRATION_BASELINE: Message = Message {
        zh: "校准基线无效",
        en: "Invalid calibration baseline",
    };
    pub const ERR_CAMERA_ID_TOO_LONG: Message = Message {
        zh: "摄像头标识过长",
        en: "The camera identifier is too long",
    };
    pub const ERR_CAMERA_NOT_AUTHORIZED: Message = Message {
        zh: "摄像头尚未授权或未完成校准",
        en: "The camera is not authorized or calibration is not complete",
    };
    pub const ERR_CAMERA_NOT_RUNNING: Message = Message {
        zh: "摄像头检测当前未运行",
        en: "Camera detection is not currently running",
    };
    pub const ERR_ISLAND_PERMANENT_CLOSE: Message = Message {
        zh: "请先在偏好设置中允许彻底关闭灵动岛",
        en: "Allow closing Dynamic Island permanently in Preferences first",
    };
    pub const ERR_AUTOSTART_UPDATE: Message = Message {
        zh: "无法更新开机启动设置：{error}",
        en: "Could not update the launch-at-login setting: {error}",
    };
    pub const ERR_CAMERA_QUERY_THREAD: Message = Message {
        zh: "摄像头设备查询线程异常:{error}",
        en: "The camera device query thread failed: {error}",
    };
    pub const ERR_VISION_SESSION_THREAD: Message = Message {
        zh: "摄像头会话线程异常:{error}",
        en: "The camera session thread failed: {error}",
    };
    pub const ERR_STATE_LOCK: Message = Message {
        zh: "状态锁已损坏",
        en: "The app state lock is corrupted",
    };
    pub const ERR_DATABASE_LOCK: Message = Message {
        zh: "数据库锁已损坏",
        en: "The database lock is corrupted",
    };
    pub const ERR_UPDATE_STATE_LOCK: Message = Message {
        zh: "更新状态锁已损坏",
        en: "The update state lock is corrupted",
    };
    pub const ERR_PIPELINE_LOCK: Message = Message {
        zh: "管线锁已损坏",
        en: "The camera pipeline lock is corrupted",
    };
    pub const ERR_APP_STATE_NOT_READY: Message = Message {
        zh: "应用状态尚未就绪",
        en: "The app state is not ready yet",
    };
    pub const ERR_TRAY_NOT_READY: Message = Message {
        zh: "系统托盘尚未就绪",
        en: "The system tray is not ready yet",
    };
    pub const ERR_EVENT_DATE: Message = Message {
        zh: "行为记录日期格式无效",
        en: "Invalid behavior event date",
    };

    // ── CSV 导出表头（commands.rs） ──
    pub const CSV_STATISTICS_HEADER: Message = Message {
        zh: "日期,坐姿秒数,最长连续坐姿秒数,低头秒数,疑似手机秒数,休息次数,提醒次数,稍后提醒次数,关闭提醒次数,延后或关闭提醒次数,离座秒数,离座次数",
        en: "Date,Seated seconds,Longest seated seconds,Head-down seconds,Suspected phone seconds,Breaks,Reminders,Snoozed,Dismissed,Deferred,Away seconds,Away events",
    };
    pub const CSV_EVENTS_HEADER: Message = Message {
        zh: "行为时间,行为类型,持续秒数,操作",
        en: "Started at,Event type,Duration seconds,Action",
    };

    // ── 系统托盘（tray.rs） ──
    pub const TRAY_STATUS_MONITORING: Message = Message {
        zh: "健康提醒 · 正在检测",
        en: "Health Reminder · Monitoring",
    };
    pub const TRAY_STATUS_PAUSED: Message = Message {
        zh: "健康提醒 · 检测已暂停",
        en: "Health Reminder · Monitoring paused",
    };
    pub const TRAY_STATUS_BREAK: Message = Message {
        zh: "健康提醒 · 主动休息中",
        en: "Health Reminder · Break in progress",
    };
    pub const TRAY_STATUS_INITIALIZING: Message = Message {
        zh: "健康提醒 · 正在启动检测",
        en: "Health Reminder · Starting monitoring",
    };
    pub const TRAY_STATUS_CALIBRATING: Message = Message {
        zh: "健康提醒 · 正在校准",
        en: "Health Reminder · Calibrating",
    };
    pub const TRAY_STATUS_UNAVAILABLE: Message = Message {
        zh: "健康提醒 · 检测不可用",
        en: "Health Reminder · Monitoring unavailable",
    };
    pub const TRAY_SHOW_MAIN_WINDOW: Message = Message {
        zh: "打开主窗口",
        en: "Open main window",
    };
    pub const TRAY_PAUSE_MONITORING: Message = Message {
        zh: "暂停检测",
        en: "Pause monitoring",
    };
    pub const TRAY_RESUME_MONITORING: Message = Message {
        zh: "恢复检测",
        en: "Resume monitoring",
    };
    pub const TRAY_BREAK_HINT: Message = Message {
        zh: "请在主窗口结束休息",
        en: "Break controls are in the main window",
    };
    pub const TRAY_CONTROLS_UNAVAILABLE: Message = Message {
        zh: "检测操作暂不可用",
        en: "Monitoring controls unavailable",
    };
    pub const TRAY_QUIT: Message = Message {
        zh: "退出健康提醒",
        en: "Quit Health Reminder",
    };
    pub const TRAY_TOOLTIP: Message = Message {
        zh: "健康提醒 · 姿态与久坐",
        en: "Health Reminder · Posture & Sitting",
    };
    pub const TRAY_UPDATE_CHECKING: Message = Message {
        zh: "正在检查更新…",
        en: "Checking for updates…",
    };
    pub const TRAY_UPDATE_DOWNLOADING: Message = Message {
        zh: "↓ 正在下载 v{version} · {progress}%",
        en: "↓ Downloading v{version} · {progress}%",
    };
    pub const TRAY_UPDATE_DOWNLOADING_NO_VERSION: Message = Message {
        zh: "↓ 正在下载更新 · {progress}%",
        en: "↓ Downloading update · {progress}%",
    };
    pub const TRAY_UPDATE_RESTARTING: Message = Message {
        zh: "更新已安装 · 正在重启…",
        en: "Update installed · Restarting…",
    };
    pub const TRAY_UPDATE_ERROR: Message = Message {
        zh: "更新失败 · 点击重试",
        en: "Update failed · Click to retry",
    };
    pub const TRAY_UPDATE_LATEST: Message = Message {
        zh: "检查更新（当前已是最新）",
        en: "Check for updates (up to date)",
    };
    pub const TRAY_UPDATE_VIEW: Message = Message {
        zh: "查看新版本 v{version}",
        en: "View update v{version}",
    };
    pub const TRAY_UPDATE_CHECK: Message = Message {
        zh: "检查更新…",
        en: "Check for updates…",
    };
}

#[cfg(test)]
mod tests;
