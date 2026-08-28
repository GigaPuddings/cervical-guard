//! 提醒提示音播放。
//!
//! 三种内置提示音以 WAV 资源随仓库维护(`assets/sounds/`,由
//! `scripts/generate_reminder_sounds.mjs` 生成)并通过 `include_bytes!` 嵌入
//! 二进制,用 winmm `PlaySoundW` 异步播放;`System` 选项保留旧的
//! `MessageBeep` 行为(播放 Windows 当前声音方案中的“信息”提示音,尊重系统静音)。

use crate::model::{AppSettings, ReminderLevel};

/// 用户可选的提示音。`Auto` 按提醒级别自动匹配。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReminderSound {
    Auto,
    System,
    Chime,
    Soft,
    Alert,
    Off,
}

impl ReminderSound {
    pub const ALL: [&'static str; 6] = ["auto", "system", "chime", "soft", "alert", "off"];

    pub fn from_setting(value: &str) -> Self {
        match value {
            "system" => Self::System,
            "chime" => Self::Chime,
            "soft" => Self::Soft,
            "alert" => Self::Alert,
            "off" => Self::Off,
            _ => Self::Auto,
        }
    }
}

/// 声音开关与会议模式的统一闸门：会议模式承诺“安静通知”，优先级最高。
pub fn reminder_sound_enabled(settings: &AppSettings) -> bool {
    settings.sound_enabled && !settings.meeting_mode
}

/// 解析出本次提醒实际要播放的声音；返回 `None` 表示保持静音。
pub fn resolve_reminder_sound(
    settings: &AppSettings,
    level: ReminderLevel,
) -> Option<ReminderSound> {
    if !reminder_sound_enabled(settings) {
        return None;
    }
    match ReminderSound::from_setting(&settings.reminder_sound) {
        ReminderSound::Off => None,
        ReminderSound::System => Some(ReminderSound::System),
        ReminderSound::Chime => Some(ReminderSound::Chime),
        ReminderSound::Soft => Some(ReminderSound::Soft),
        ReminderSound::Alert => Some(ReminderSound::Alert),
        ReminderSound::Auto => Some(match level {
            // 级别由状态机决定：会议模式已是 Gentle 且静音；强化条件升级 Strong。
            ReminderLevel::Gentle => ReminderSound::Soft,
            ReminderLevel::Noticeable => ReminderSound::Chime,
            ReminderLevel::Strong => ReminderSound::Alert,
        }),
    }
}

const SOFT_WAV: &[u8] = include_bytes!("../assets/sounds/soft.wav");
const CHIME_WAV: &[u8] = include_bytes!("../assets/sounds/chime.wav");
const ALERT_WAV: &[u8] = include_bytes!("../assets/sounds/alert.wav");

/// 播放解析出的提示音。播放是异步的，不会阻塞提醒展示。
pub fn play_reminder_sound(sound: Option<ReminderSound>) {
    let Some(sound) = sound else {
        return;
    };
    match sound {
        ReminderSound::System => play_system_beep(),
        ReminderSound::Soft => play_wav(SOFT_WAV),
        ReminderSound::Chime => play_wav(CHIME_WAV),
        ReminderSound::Alert => play_wav(ALERT_WAV),
        ReminderSound::Auto | ReminderSound::Off => {}
    }
}

#[cfg(target_os = "windows")]
fn play_system_beep() {
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

#[cfg(target_os = "windows")]
fn play_wav(bytes: &'static [u8]) {
    #[link(name = "winmm")]
    extern "system" {
        fn PlaySoundW(psz_sound: *const u16, hmod: isize, fdw_sound: u32) -> i32;
    }

    const SND_ASYNC: u32 = 0x0001;
    const SND_MEMORY: u32 = 0x0004;
    const SND_NODEFAULT: u32 = 0x0002;
    // SND_ASYNC + SND_MEMORY 要求内存在整个播放期间保持有效；
    // include_bytes! 产生的 &'static [u8] 与进程同生命周期，满足该要求。
    unsafe {
        let _ = PlaySoundW(
            bytes.as_ptr().cast(),
            0,
            SND_ASYNC | SND_MEMORY | SND_NODEFAULT,
        );
    }
}

#[cfg(not(target_os = "windows"))]
fn play_system_beep() {}

#[cfg(not(target_os = "windows"))]
fn play_wav(_bytes: &'static [u8]) {}

#[cfg(test)]
mod tests;
