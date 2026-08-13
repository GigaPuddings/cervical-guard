export type Language = "zh-CN" | "en-US";

export const copy = {
  "zh-CN": {
    appName: "健康提醒",
    appSubtitle: "姿态与久坐",
    onboarding: {
      tagline: "温和一点，照顾久坐的自己",
      headline: ["抬起头，", "也给身体一点余地。"],
      description: "健康提醒通过摄像头在本地识别久坐和持续低头，在恰当的时候轻轻提醒你。它只关注行为，不做任何医疗诊断。",
      camera: "开启姿势检测",
      timer: "暂时使用定时提醒",
      permission: "点击后才会申请摄像头权限，不会申请麦克风权限",
      privacyLabel: "隐私说明",
      postureOnly: "只分析姿态，不识别身份",
      checking: "正在检查摄像头和系统权限…",
      fallback: "仍可使用不读取摄像头的定时提醒。",
      points: [
        ["断网也能工作", "姿态识别与提醒均在本机完成"],
        ["画面不会留存", "不保存、不上传摄像头视频或截图"],
        ["你始终可控", "随时暂停检测、撤销权限或清空数据"],
      ],
    },
    camera: {
      unsupported: "当前设备不支持摄像头姿态检测",
      retry: "重新检测",
    },
    settings: { language: "界面语言", chinese: "简体中文", english: "English" },
    updater: {
      title: "应用更新",
      description: "通过 GitHub Releases 检查并安装签名更新。",
      check: "检查更新",
      checking: "正在检查…",
      latest: "已是最新版本",
      available: (version: string) => `发现新版本 ${version}`,
      install: "下载并安装",
      downloading: (progress: number) => `正在下载 ${progress}%`,
      restart: "更新已安装，正在重启…",
      browserOnly: "仅生产版桌面应用支持更新检查。",
      failed: "更新检查失败",
      currentVersion: "当前版本",
      latestVersion: "最新版本",
      releaseNotes: "本次更新内容",
      noReleaseNotes: "此版本没有提供更新日志。",
      loadingReleaseNotes: "正在渲染更新日志…",
      downloadProgress: "下载进度",
      preparingDownload: "正在准备下载…",
      later: "稍后处理",
      backgroundDownload: "转入后台下载",
      backgroundHint: "可以关闭此弹窗或主窗口，下载会在托盘后台继续。",
      speed: "下载速度",
      badge: "有新版本",
    },
  },
  "en-US": {
    appName: "Health Reminder",
    appSubtitle: "Posture & Sitting",
    onboarding: {
      tagline: "A gentler way to care for your body",
      headline: ["Lift your head.", "Give your body room to move."],
      description: "Health Reminder detects prolonged sitting and head-down posture locally with your camera, then nudges you at the right time. It observes behavior only and does not provide medical diagnosis.",
      camera: "Start posture detection",
      timer: "Use timer reminders",
      permission: "Camera access is requested only after you click. Microphone access is never requested.",
      privacyLabel: "Privacy information",
      postureOnly: "Posture only. No identity recognition.",
      checking: "Checking the camera and system permission…",
      fallback: "You can still use timer reminders without camera access.",
      points: [
        ["Works offline", "Posture detection and reminders run on this device"],
        ["Frames are never stored", "Camera video and screenshots are neither saved nor uploaded"],
        ["You stay in control", "Pause detection, revoke access, or erase data at any time"],
      ],
    },
    camera: {
      unsupported: "Camera posture detection is unavailable on this device",
      retry: "Check again",
    },
    settings: { language: "Interface language", chinese: "简体中文", english: "English" },
    updater: {
      title: "App updates",
      description: "Check and install signed updates from GitHub Releases.",
      check: "Check for updates",
      checking: "Checking…",
      latest: "You’re up to date",
      available: (version: string) => `Version ${version} is available`,
      install: "Download and install",
      downloading: (progress: number) => `Downloading ${progress}%`,
      restart: "Update installed. Restarting…",
      browserOnly: "Update checks are available in production desktop builds only.",
      failed: "Update check failed",
      currentVersion: "Current version",
      latestVersion: "Latest version",
      releaseNotes: "What’s new",
      noReleaseNotes: "No release notes were provided for this version.",
      loadingReleaseNotes: "Rendering release notes…",
      downloadProgress: "Download progress",
      preparingDownload: "Preparing download…",
      later: "Later",
      backgroundDownload: "Continue in background",
      backgroundHint: "You can close this dialog or the main window; the download will continue in the tray.",
      speed: "Download speed",
      badge: "Update available",
    },
  },
} as const;

export function languageOf(value: unknown): Language {
  return value === "en-US" ? "en-US" : "zh-CN";
}

const cameraErrorTranslations: Array<[prefix: string, translation: string]> = [
  ["摄像头权限已关闭。", "Camera access is turned off. Allow desktop apps to access the camera in Windows Settings > Privacy & security > Camera."],
  ["摄像头访问已被 Windows 或组织策略禁用。", "Camera access is blocked by Windows or an organization policy. Check the camera privacy policy or contact your administrator."],
  ["当前应用未声明摄像头能力。", "This installation does not declare camera access. Reinstall the complete application and try again."],
  ["未检测到可用摄像头。", "No available camera was detected. Check that the device is connected and enabled in Device Manager."],
  ["摄像头正被其他应用独占。", "Another application has exclusive access to the camera. Close video-meeting, streaming, or recording apps and try again."],
  ["摄像头不支持当前视频格式。", "The camera does not support the required video format. Try another camera or update its driver."],
  ["摄像头驱动或硬件资源异常。", "The camera driver or hardware resource failed. Reconnect the device or update its driver."],
  ["摄像头连接已中断，", "The camera connection was interrupted. Check the device connection and try again."],
  ["摄像头启动失败。", "The camera could not start. Check the device, its driver, and other applications, then try again."],
];

export function localizeBackendMessage(value: string | null, language: Language): string | null {
  if (!value || language === "zh-CN") return value;
  const match = cameraErrorTranslations.find(([prefix]) => value.startsWith(prefix));
  if (!match) return value;
  const diagnostic = value.match(/错误码\s+(0x[0-9A-Fa-f]{8})/)?.[1];
  return `${match[1]}${diagnostic ? ` (error code ${diagnostic})` : ""}`;
}
