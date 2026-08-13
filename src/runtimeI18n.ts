import { useLayoutEffect } from "react";
import type { Language } from "./i18n";

// Source-copy catalog for legacy screens. New components should use keyed copy from i18n.ts;
// this bridge keeps the existing dashboard/calibration/weather surfaces fully bilingual without
// coupling product state to a third-party localization runtime.
const zhToEn: Record<string, string> = {
  "健康提醒": "Health Reminder", "姿态与久坐": "Posture & Sitting",
  "今日概览": "Today", "习惯趋势": "Trends", "天气与活动": "Weather & activity", "偏好设置": "Preferences",
  "关闭导航": "Close navigation", "打开导航": "Open navigation", "主导航": "Main navigation", "空间": "Workspace",
  "结束休息": "End break", "暂停检测": "Pause detection", "暂停 30 分钟": "Pause for 30 minutes", "暂停 1 小时": "Pause for 1 hour",
  "暂停到手动恢复": "Pause until resumed", "恢复检测": "Resume detection", "本地隐私模式": "Local privacy mode",
  "画面不保存、不上传": "Frames are neither saved nor uploaded", "使用帮助": "Help", "健康提醒 v0.1.0 · 行为提醒工具": "Health Reminder v0.1.0 · Behavior reminder",
  "今天": "Today", "照顾好当下的姿势": "Take care of your posture", "保持专注即可，健康提醒只在需要时出现。": "Stay focused. Health Reminder appears only when needed.",
  "主动休息": "Take a break", "摄像头检测暂不可用，已保留普通定时提醒": "Camera detection is unavailable; timer reminders remain active",
  "请检查系统摄像头权限或设备占用情况。": "Check camera permission and whether another app is using the device.", "检查设置": "Check settings",
  "当前会话": "Current session", "摄像头低功耗检测": "Low-power camera detection", "普通定时模式": "Timer mode",
  "连续坐姿": "Continuous sitting", "当前姿态": "Current posture", "头肩稳定度": "Head stability", "多帧确认 · 画面仅在本机处理": "Multi-frame confirmation · processed locally",
  "当前不在工作提醒时段": "Outside reminder work hours", "提醒计划已暂停": "Reminder schedule paused",
  "普通定时提醒": "Timer reminders", "检测状态": "Detection status", "静默中": "Paused", "检测中": "Detecting", "待确认": "Confirming",
  "摄像头实时预览": "Live camera preview", "正在请求摄像头权限…": "Requesting camera access…", "正在加载姿态模型…": "Loading the local posture model…",
  "正在连接视频流…": "Connecting to camera preview…", "重试预览": "Retry preview", "摄像头未启用": "Camera not enabled", "正在实时检测": "Detecting live",
  "正在连接视频流": "Connecting to camera preview", "正在连接检测": "Starting detection", "定时提醒模式": "Timer reminder mode",
  "恢复后继续本地姿态识别": "Local posture detection resumes with monitoring", "仅根据启用时间提供久坐提醒": "Sitting reminders use elapsed time only",
  "隐私与设备": "Privacy & devices", "画面仅在本机处理，不保存，不上传": "Processed locally; never saved or uploaded", "检测设置": "Detection settings",
  "调整摄像头与识别选项": "Adjust camera and recognition options", "今日坐姿": "Sitting today", "累计低头": "Head-down time",
  "完成休息": "Completed breaks", "忽略提醒": "Dismissed reminders", "离座活动": "Away activity", "主动休息也会被记录": "Manual breaks are recorded too",
  "我们会控制提醒频率": "Reminder frequency stays controlled", "起身接水也算活动": "Getting up for water counts as activity",
  "已离座 · 计时已暂停": "Away · timer paused", "回来后会继续判断当前会话": "The current session continues when you return",
  "正在确认姿态": "Confirming posture", "多帧稳定后才会开始累计": "Timing begins only after stable frames", "姿态自然": "Natural posture",
  "保持现在这样，很不错": "Keep it up", "持续低头中": "Head-down posture", "系统正在累计持续时间": "Duration is being tracked",
  "你站起来了": "You stood up", "保持一会儿即可完成有效休息": "Stay up briefly to complete an effective break", "等待稳定画面": "Waiting for stable frames",
  "低置信度不会触发明确提醒": "Low-confidence frames do not trigger reminders", "休息进行中": "Break in progress", "倒计时与结束操作已显示在灵动岛": "Countdown and controls are shown in the Dynamic Island",
  "定时提醒已开启": "Timer reminders are active", "达到阈值后会提醒你起身活动": "You will be reminded when the threshold is reached",
  "光线与取景适合识别": "Lighting and framing are suitable", "当前光线较暗，明确判断已暂停": "The frame is dark; classification is paused",
  "头部暂时被遮挡，请让鼻尖、双眼和双耳尽量清晰可见": "Your head is occluded. Keep your nose, eyes, and ears visible.",
  "画面中有多人，明确判断已暂停": "Multiple people are visible; classification is paused", "正在等待稳定的多帧结果": "Waiting for stable multi-frame results",
  "仅保存在本机": "Stored on this device only", "你的习惯趋势": "Your habit trends", "看变化即可，不给身体表现打分。": "Notice change without scoring your body.",
  "近 7 天": "Last 7 days", "近 30 天": "Last 30 days", "日均坐姿": "Average sitting", "最长连续": "Longest session", "逐步缩短即可": "Reduce it gradually",
  "每日行为": "Daily behavior", "坐姿与低头变化": "Sitting and head-down trends",
  "坐姿": "Sitting", "低头": "Head down", "本期观察": "Observation", "你正在主动打断久坐，继续保持自己的节奏。": "You are actively interrupting long sitting. Keep your rhythm.",
  "今天可以从一次主动休息开始。": "Start today with one intentional break.", "行为历史": "Behavior history", "最近记录": "Recent activity", "行为发生后会记录在这里": "Behavior events will appear here",
  "离开座位": "Away from seat", "持续低头": "Head down", "提醒后休息": "Break after reminder", "提前休息": "Early break", "主动暂停": "Manual pause", "提醒操作": "Reminder action",
  "已返回": "Returned", "已恢复": "Recovered", "已开始": "Started", "已完成": "Completed", "定时暂停": "Timed pause", "手动恢复": "Manual resume", "稍后提醒": "Snoozed", "已忽略": "Dismissed", "即时": "Instant",
  "本地处理，数据由你掌控": "Local processing. Your data stays yours.", "这里说明摄像头和本地统计的边界；检测参数请前往偏好设置。": "Review camera and local-statistics boundaries here; detection options are in Preferences.",
  "原始画面不落盘": "Raw frames are never stored", "姿态模型在本机内存中处理画面，数据库只保存结构化行为事件、每日汇总和设置。": "The posture model processes frames in local memory. Only structured events, daily totals, and settings are stored.",
  "不进行身份识别": "No identity recognition", "不保存视频或截图": "No video or screenshots are saved", "不上传摄像头数据": "Camera data is not uploaded", "当前设备": "Current device",
  "摄像头本地检测": "Local camera detection", "导出本地 CSV": "Export local CSV", "删除全部统计和行为历史": "Delete statistics and behavior history",
  "偏好与隐私": "Preferences & privacy", "让提醒适合你的节奏": "Make reminders fit your rhythm", "切换分类不会丢失修改；保存后立即作用于当前监测。": "Switching sections keeps edits. Saving applies them immediately.",
  "有未保存的更改": "Unsaved changes", "正在保存…": "Saving…", "已保存并生效": "Saved and applied", "保存并应用": "Save and apply", "设置分类": "Settings sections", "统一保存": "Save together", "切换分类不会丢失当前修改。": "Switching sections keeps current edits.",
  "检测": "Detection", "摄像头、识别灵敏度与行为阈值": "Camera, sensitivity, and behavior thresholds", "提醒": "Reminders", "久坐节奏、午间静默与通知方式": "Sitting cadence, quiet hours, and notifications",
  "灵动岛": "Dynamic Island", "顶部状态、行为提醒与窗口协同": "Top status, behavior alerts, and window coordination", "运行": "Runtime", "工作时段、后台运行与开机启动": "Work hours, background operation, and autostart", "数据与隐私": "Data & privacy", "本地统计、导出与数据清理": "Local statistics, export, and cleanup",
  "使用摄像头进行姿态检测": "Use camera posture detection", "关闭后自动切换到普通定时久坐提醒": "Turning this off switches to timer reminders", "检测灵敏度": "Detection sensitivity", "低头提醒阈值": "Head-down threshold",
  "较低 · 减少误报": "Low · fewer false alerts", "平衡 · 推荐": "Balanced · recommended", "较高 · 更早识别": "High · earlier detection", "重新校准正常坐姿": "Recalibrate natural posture",
  "重复提醒": "Repeat reminder", "有效休息": "Effective break", "上午 / 下午模式（午间静默）": "Morning / afternoon mode (quiet at noon)", "关闭为连续工作；开启后午间暂停提醒": "Off means continuous work; on pauses reminders at noon",
  "午间静默开始": "Quiet period starts", "午间静默结束": "Quiet period ends", "持续行为重复提醒": "Repeat ongoing behavior reminders", "遵守同类提醒冷却时间": "Respects reminder cooldown", "会议模式": "Meeting mode", "仅显示安静通知": "Show quiet notifications only", "通知声音": "Notification sound", "会议模式下仍保持静音": "Remains silent in meeting mode",
  "启用灵动岛": "Enable Dynamic Island", "总开关；关闭后保留下面的行为偏好": "Master switch; behavior preferences are retained", "久坐提醒": "Sitting reminder", "显示休息、稍后和忽略操作": "Show break, snooze, and dismiss actions",
  "离座状态": "Away status", "确认无人后保持显示计时暂停": "Show paused timing after absence is confirmed", "低头状态": "Head-down status", "持续确认低头后显示提示": "Show after head-down posture is confirmed", "休息倒计时": "Break countdown", "休息期间显示倒计时与操作": "Show countdown and controls during breaks",
  "持续检测状态": "Persistent detection status", "检测中常驻紧凑状态，悬停查看详情": "Keep a compact status while monitoring; hover for details", "暂停状态": "Paused status", "暂停检测时显示恢复时间与暂停状态": "Show the pause state and resume time while monitoring is paused", "鼠标放大镜效果": "Pointer magnifier", "鼠标经过灵动岛时显示局部放大镜；关闭后仅隐藏放大镜": "Show a local magnifier while hovering over Dynamic Island; disabling it only hides the magnifier", "与普通窗口同时显示": "Show with main window", "主窗口可见时也显示灵动岛": "Show Dynamic Island while the main window is visible", "允许从灵动岛彻底关闭": "Allow permanent close from Dynamic Island", "开启后关闭菜单才显示彻底关闭选项": "Adds a permanent-close option to its menu",
  "工作开始": "Work starts", "工作结束": "Work ends", "关闭窗口后在后台运行": "Run in background after closing", "隐藏后继续低功耗监测": "Continue low-power monitoring while hidden", "开机自动启动": "Start at login", "登录系统后自动守护工作节奏": "Start automatically after sign-in", "周末启用": "Enable on weekends", "周六和周日也执行工作时段规则": "Apply work-hour rules on weekends",
  "摄像头画面仅在本机内存中处理。": "Camera frames are processed only in local memory.", "保存本地行为统计": "Save local behavior statistics", "关闭后停止累计，已有数据不自动删除": "Turning off stops collection without deleting existing data", "本地数据管理": "Local data management",
  "导出内容仅包含日期、时长、次数与结构化行为历史，不含图片。": "Exports include dates, durations, counts, and structured history—never images.", "导出 CSV": "Export CSV", "删除全部统计与行为历史": "Delete statistics and history", "健康提醒用于日常行为提醒，不用于疾病诊断或替代医生建议。": "Health Reminder supports daily habits and does not diagnose disease or replace medical advice.",
  "设置没有保存": "Settings were not saved", "请检查输入范围后重试，原有设置仍保持有效。": "Check the input range and try again. Existing settings remain active.",
  "返回": "Back", "第 1 步，共 1 步": "Step 1 of 1", "调整好你的坐姿": "Set up your posture", "请自然坐直并正对屏幕。摄像头只需拍到完整、清晰的头部；肩膀和手臂不会参与识别。": "Sit naturally upright and face the screen. Only your clearly visible head is needed; shoulders and arms are not analyzed.",
  "摄像头已连接": "Camera connected", "正在准备": "Preparing", "摄像头校准预览": "Camera calibration preview", "正在连接画面…": "Connecting preview…", "正在加载本地姿态模型…": "Loading local posture model…", "画面仅在此设备内存中处理": "Frames are processed in this device's memory only", "摄像头": "Camera",
  "校准检查": "Calibration checks", "保持自然坐姿": "Keep a natural posture", "我们只使用鼻尖、双眼和双耳记录自然坐姿基线。无需拍到肩部、胸部或下半身。": "We use the nose, eyes, and ears to record a natural-posture baseline. Shoulders, torso, and lower body are not needed.",
  "头部完整清晰可见": "Full head clearly visible", "头部位置保持稳定": "Head position is stable", "光线适合识别": "Lighting is suitable", "基线采集": "Baseline capture", "请让完整头部在画面中稳定保持几秒": "Keep your full head stable in frame for a few seconds", "已获得稳定的头部位置基线": "A stable head-position baseline is ready",
  "摄像头暂时不可用": "Camera unavailable", "视频预览暂时不可用": "Video preview unavailable", "重试": "Retry", "完成并开始检测": "Finish and start detection", "使用普通定时提醒": "Use timer reminders", "本应用提供健康行为提醒，不用于疾病诊断或治疗。": "This app provides behavior reminders and does not diagnose or treat disease.",
  "今天适合怎么动一动": "How to move today", "刷新全部": "Refresh all", "搜索中国城市": "Search Chinese cities", "搜索": "Search", "搜索并选择城市，不读取设备位置": "Search and select a city; device location is never read", "城市搜索结果": "City search results", "城市": "City",
  "关注地点": "Saved places", "还没有地点": "No places yet", "输入城市名称并搜索添加": "Search for a city to add it", "点击地点会设为今日概览和灵动岛的首选天气。": "Selecting a place makes it the preferred weather for Today and Dynamic Island.", "添加第一个城市": "Add your first city", "天气详情、今日概览和休息建议会共用你选择的首选地点。": "Weather details, Today, and break advice share your preferred place.",
  "天气加载失败": "Weather failed to load", "离线缓存": "Offline cache", "体感": "Feels like", "云量": "Cloud cover", "湿度": "Humidity", "紫外线": "UV index", "今日降水量": "Rain today", "降水概率": "Rain chance", "结合天气的休息建议": "Weather-aware break advice", "今日环境范围": "Today's range", "雨": "Rain", "UV 峰值": "Peak UV", "模型预报仅供生活参考，不参与医疗判断或自动修改提醒。": "Forecasts are for daily reference only and do not affect medical judgment or reminder settings.",
  "晴": "Clear", "大部晴朗": "Mostly clear", "局部多云": "Partly cloudy", "阴": "Overcast", "有雾": "Foggy", "毛毛雨": "Drizzle", "有雨": "Rain", "有雪": "Snow", "阵雨": "Showers", "阵雪": "Snow showers", "雷暴": "Thunderstorm", "天气变化中": "Changing weather",
  "尚未启用": "Not enabled", "正在启动": "Starting", "正在校准": "Calibrating", "检测进行中": "Monitoring", "检测已暂停": "Monitoring paused", "休息中": "On break", "定时中": "Timer", "开启姿势检测": "Enable posture detection",
  "休息时间到": "Break time complete", "准备好了就继续吧": "Continue when you're ready", "起来走动，放松一下肩颈": "Walk around and relax your neck and shoulders", "休息": "Break", "稍后": "Later", "暂停一小时": "Pause for one hour", "忽略本次": "Dismiss this reminder",
};

const enToZh = Object.fromEntries(Object.entries(zhToEn).map(([zh, en]) => [en, zh]));

export function translateDynamic(value: string, language: Language): string {
  if (language === "zh-CN") return (enToZh[value] ?? value)
    .replace(/^Continuous:\s+/, "已连续 ")
    .replace(/^Break remaining:\s+/, "休息剩余 ")
    .replace(/^Remaining:\s+/, "剩余 ")
    .replace(/^Today · /, "今天 · ")
    .replace(/^Longest session:\s+/, "最长连续 ")
    .replace(/\s+gentle reminders$/, " 次温和提醒")
    .replace(/\s+reminders$/, " 次提醒")
    .replace(/\s+away events$/, " 次离座")
    .replace(/\s+times$/, " 次")
    .replace(/^Device:\s*/, "设备：");
  const exact = zhToEn[value];
  if (exact) return exact;
  return value
    .replace(/^已连续\s+/, "Continuous: ")
    .replace(/^休息剩余\s+/, "Break remaining: ")
    .replace(/^剩余\s+/, "Remaining: ")
    .replace(/^还需\s+/, "Needs ")
    .replace(/\s+次温和提醒$/, " gentle reminders")
    .replace(/\s+次提醒$/, " reminders")
    .replace(/\s+次离座$/, " away events")
    .replace(/\s+次$/, " times")
    .replace(/^设备：/, "Device: ")
    .replace(/^正在获取(.+)天气…$/, "Loading weather for $1…")
    .replace(/^刷新(.+)天气$/, "Refresh $1 weather")
    .replace(/^移除(.+)$/, "Remove $1")
    .replace(/^(今日|今天) · /, "Today · ")
    .replace(/^已选 /, "Selected ")
    .replace(/^连续坐姿 /, "Continuous sitting: ")
    .replace(/^最长连续\s+/, "Longest session: ");
}

function translateElement(root: ParentNode, language: Language) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
  for (const node of textNodes) {
    if (node.parentElement?.closest("script,style")) continue;
    const raw = node.data;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const translated = translateDynamic(trimmed, language);
    if (translated !== trimmed) node.data = raw.replace(trimmed, translated);
  }
  for (const element of root.querySelectorAll<HTMLElement>("[aria-label],[title],[placeholder]")) {
    for (const attr of ["aria-label", "title", "placeholder"] as const) {
      const value = element.getAttribute(attr);
      if (value) element.setAttribute(attr, translateDynamic(value, language));
    }
  }
}

export function translateNow(value: string, language: Language): string {
  return translateDynamic(value, language);
}

export function useRuntimeI18n(language: Language) {
  useLayoutEffect(() => {
    translateElement(document.body, language);
    const observer = new MutationObserver((records) => {
      observer.disconnect();
      for (const record of records) {
        if (record.type === "characterData" && record.target.parentNode) translateElement(record.target.parentNode, language);
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) translateElement(node as Element, language);
          else if (node.parentNode) translateElement(node.parentNode, language);
        }
      }
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [language]);
}
