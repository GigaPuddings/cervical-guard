import { Activity, Armchair, Camera, CameraOff, ChevronRight, CircleCheck, CirclePause, Clock3, Download, Eye, HeartPulse, LockKeyhole, PanelTop, Power, RotateCcw, ShieldCheck, Sparkles, Trash2, UserCheck, ZoomIn } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { SelectField } from '../../../components/SelectField'
import { SettingItem } from '../../../components/SettingItem'
import { languageOf } from '../../../i18n'
import { defineMessages, localizeMessages } from '../../../runtimeI18n'
import type { AppSettings, AppSnapshot } from '../../../types'
import { cn, compactDuration } from '../../../utils'

const settingsMessages = defineMessages({
  firstReminder: { zh: '久坐首次提醒', en: 'First sitting reminder' },
  healthReference: { zh: '建议用轻活动打断连续久坐；45 分钟是兼顾专注的产品参考，并非医疗处方。', en: 'Break up prolonged sitting with light activity. The 45-minute reference balances focus and movement; it is not medical advice.' },
  customDuration: { zh: '自定义时长', en: 'Custom duration' },
  customDurationAria: { zh: '自定义久坐提醒时长', en: 'Custom sitting reminder duration' },
  unit: { zh: '单位', en: 'Unit' },
  seconds: { zh: '秒', en: 'seconds' },
  minutes: { zh: '分钟', en: 'minutes' },
  unitAria: { zh: '久坐提醒时间单位', en: 'Sitting reminder time unit' },
  quickDuration: { zh: '快速时长', en: 'Quick durations' },
  active30: { zh: '30 分钟 · 积极', en: '30 minutes · active' },
  recommended45: { zh: '45 分钟 · 推荐', en: '45 minutes · recommended' },
  gentle60: { zh: '60 分钟 · 温和', en: '60 minutes · gentle' },
  testMode: { zh: '测试模式：不受工作与静默时段限制', en: 'Test mode: ignores work and quiet hours' },
  tooLong: { zh: '连续时长较长，建议优先选择 30–60 分钟', en: 'This duration is long; prefer 30–60 minutes' },
  referenceRange: { zh: '当前处于 30–60 分钟参考范围', en: 'Within the recommended 30–60 minute range' },
  frequentReminder: { zh: '提醒较频繁，可按工作节奏调整', en: 'Frequent reminders; adjust them to your work rhythm' },
  detection: { zh: '检测', en: 'Detection' },
  detectionDescription: { zh: '摄像头、识别灵敏度与行为阈值', en: 'Camera, sensitivity, and behavior thresholds' },
  reminder: { zh: '提醒', en: 'Reminders' },
  reminderDescription: { zh: '久坐节奏与通知方式', en: 'Sitting cadence and notifications' },
  island: { zh: '灵动岛', en: 'Dynamic Island' },
  islandDescription: { zh: '顶部状态、行为提醒与窗口协同', en: 'Top status, behavior alerts, and window coordination' },
  runtime: { zh: '运行', en: 'Runtime' },
  runtimeDescription: { zh: '静默时段、工作时段与后台运行', en: 'Quiet hours, work hours, and background operation' },
  privacy: { zh: '数据与隐私', en: 'Data & privacy' },
  privacyDescription: { zh: '本地统计、导出与数据清理', en: 'Local statistics, export, and cleanup' },
  saving: { zh: '正在保存…', en: 'Saving…' },
  saved: { zh: '已保存并生效', en: 'Saved and applied' },
  saveApply: { zh: '保存并应用', en: 'Save and apply' },
  eyebrow: { zh: '偏好与隐私', en: 'Preferences & privacy' },
  title: { zh: '让提醒适合你的节奏', en: 'Make reminders fit your rhythm' },
  subtitle: { zh: '切换分类不会丢失修改；保存后立即作用于当前监测。', en: 'Switching sections keeps edits. Saving applies them immediately.' },
  unsaved: { zh: '有未保存的更改', en: 'Unsaved changes' },
  categoriesAria: { zh: '偏好设置分类', en: 'Preference sections' },
  categories: { zh: '设置分类', en: 'Settings sections' },
  unifiedSave: { zh: '统一保存', en: 'Save together' },
  switchKeepsChanges: { zh: '切换分类不会丢失当前修改。', en: 'Switching sections keeps current edits.' },
  cameraDetection: { zh: '使用摄像头进行姿态检测', en: 'Use camera posture detection' },
  cameraDetectionDescription: { zh: '关闭后自动切换到普通定时久坐提醒', en: 'Turning this off switches to timer reminders' },
  sensitivity: { zh: '检测灵敏度', en: 'Detection sensitivity' },
  sensitivityLow: { zh: '较低 · 减少误报', en: 'Low · fewer false alerts' },
  sensitivityBalanced: { zh: '平衡 · 推荐', en: 'Balanced · recommended' },
  sensitivityHigh: { zh: '较高 · 更早识别', en: 'High · earlier detection' },
  headDownThreshold: { zh: '低头提醒阈值', en: 'Head-down threshold' },
  headDownConfirmation: { zh: '低头识别确认', en: 'Head-down confirmation' },
  confirmationAria: { zh: '低头识别确认时长', en: 'Head-down confirmation duration' },
  fasterResponse: { zh: '更快响应', en: 'Faster response' },
  recommended: { zh: '推荐', en: 'recommended' },
  robust: { zh: '更稳健', en: 'More robust' },
  fewerMistakes: { zh: '减少误判', en: 'Reduce false detections' },
  recalibrate: { zh: '重新校准正常坐姿', en: 'Recalibrate natural posture' },
  reenablePosture: { zh: '重新启用姿势检测', en: 'Re-enable posture detection' },
  enableCalibrate: { zh: '开启姿势检测并校准', en: 'Enable and calibrate posture detection' },
  cadence: { zh: '久坐节奏', en: 'Sitting cadence' },
  cadenceDescription: { zh: '设置首次提醒、重复间隔和休息时长', en: 'Configure the first reminder, repeat interval, and break duration' },
  repeatReminder: { zh: '重复提醒', en: 'Repeat reminder' },
  followTestThreshold: { zh: '秒 · 跟随测试阈值', en: 'seconds · follows the test threshold' },
  validBreak: { zh: '有效休息', en: 'Effective break' },
  quickActivity: { zh: '快速活动', en: 'quick activity' },
  lightBreak: { zh: '轻量休息', en: 'light break' },
  dailyCadence: { zh: '日常节奏', en: 'daily rhythm' },
  healthyRecommendation: { zh: '健康推荐', en: 'healthy recommendation' },
  fullBreak: { zh: '充分休息', en: 'full break' },
  quietHours: { zh: '静默时段', en: 'Quiet hours' },
  quietDescription: { zh: '需要安静工作时，暂停午间提醒', en: 'Pause noon reminders when you need uninterrupted work' },
  splitDayMode: { zh: '上午 / 下午模式（午间静默）', en: 'Morning / afternoon mode (quiet at noon)' },
  splitDayDescription: { zh: '关闭为连续工作；开启后午间暂停提醒', en: 'Off means continuous work; on pauses reminders at noon' },
  quietStart: { zh: '午间静默开始', en: 'Quiet period starts' },
  quietEnd: { zh: '午间静默结束', en: 'Quiet period ends' },
  notificationStyle: { zh: '通知方式', en: 'Notification behavior' },
  notificationDescription: { zh: '选择提醒是否重复、静音或播放声音', en: 'Choose repetition, quiet delivery, and sound' },
  repeatBehavior: { zh: '持续行为重复提醒', en: 'Repeat ongoing behavior reminders' },
  testRepeatPrefix: { zh: '测试时每', en: 'Repeat every' },
  repeatSuffix: { zh: '秒重复', en: 'seconds during testing' },
  cooldown: { zh: '遵守同类提醒冷却时间', en: 'Respects reminder cooldown' },
  meetingMode: { zh: '会议模式', en: 'Meeting mode' },
  quietNotifications: { zh: '仅显示安静通知', en: 'Show quiet notifications only' },
  notificationSound: { zh: '通知声音', en: 'Notification sound' },
  mutedInMeeting: { zh: '会议模式下仍保持静音', en: 'Remains silent in meeting mode' },
  soundStyle: { zh: '提示音', en: 'Reminder sound' },
  soundAuto: { zh: '按提醒级别自动匹配', en: 'Match the reminder level automatically' },
  soundChime: { zh: '双音 · 常规提醒', en: 'Chime · standard reminders' },
  soundSoft: { zh: '轻声 · 安静提醒', en: 'Soft · quiet reminders' },
  soundAlert: { zh: '三连音 · 强化提醒', en: 'Triple beep · strong reminders' },
  soundSystem: { zh: '系统提示音', en: 'System sound' },
  soundOff: { zh: '静音', en: 'Silent' },
  enableIsland: { zh: '启用灵动岛', en: 'Enable Dynamic Island' },
  islandMasterDescription: { zh: '总开关；关闭后保留下面的行为偏好', en: 'Master switch; behavior preferences are retained' },
  sedentaryReminder: { zh: '久坐提醒', en: 'Sitting reminder' },
  sedentaryReminderDescription: { zh: '显示休息、稍后和关闭操作', en: 'Show break, snooze, and close actions' },
  awayStatus: { zh: '离座状态', en: 'Away status' },
  awayStatusDescription: { zh: '确认无人后保持显示计时暂停', en: 'Show paused timing after absence is confirmed' },
  headDownDetection: { zh: '低头检测', en: 'Head-down detection' },
  headDownDetectionDescription: { zh: '控制模型低头识别、状态累计、提醒与灵动岛提示', en: 'Controls head-down analysis, tracking, reminders, and Dynamic Island notices' },
  breakCountdown: { zh: '休息倒计时', en: 'Break countdown' },
  breakCountdownDescription: { zh: '休息期间显示倒计时与操作', en: 'Show countdown and controls during breaks' },
  persistentStatus: { zh: '持续检测状态', en: 'Persistent detection status' },
  persistentStatusDescription: { zh: '控制紧凑状态是否常驻；关闭后仍可悬停查看详情', en: 'Keep the compact status visible; when off, hover still opens details' },
  pausedStatus: { zh: '暂停状态', en: 'Paused status' },
  pausedStatusDescription: { zh: '暂停检测时显示恢复时间与暂停状态', en: 'Show the pause state and resume time while monitoring is paused' },
  magnifier: { zh: '鼠标放大镜效果', en: 'Pointer magnifier' },
  magnifierDescription: { zh: '鼠标经过灵动岛时显示局部放大镜；关闭后仅隐藏放大镜', en: 'Show a local magnifier while hovering over Dynamic Island; disabling it only hides the magnifier' },
  showWithWindow: { zh: '与普通窗口同时显示', en: 'Show with main window' },
  showWithWindowDescription: { zh: '主窗口可见时也显示灵动岛', en: 'Show Dynamic Island while the main window is visible' },
  allowPermanentClose: { zh: '允许从灵动岛彻底关闭', en: 'Allow permanent close from Dynamic Island' },
  allowPermanentCloseDescription: { zh: '开启后关闭菜单才显示彻底关闭选项', en: 'Adds a permanent-close option to its menu' },
  workStart: { zh: '工作开始', en: 'Work starts' },
  workEnd: { zh: '工作结束', en: 'Work ends' },
  workSchedule: { zh: '工作时段', en: 'Work hours' },
  workScheduleDescription: { zh: '设置每天允许提醒生效的时间范围', en: 'Set the daily time range when reminders may run' },
  backgroundAndStartup: { zh: '后台与启动', en: 'Background & startup' },
  backgroundAndStartupDescription: { zh: '管理窗口关闭、登录启动与周末运行规则', en: 'Manage window closing, login startup, and weekend rules' },
  background: { zh: '关闭窗口后在后台运行', en: 'Run in background after closing' },
  backgroundDescription: { zh: '隐藏后继续低功耗监测', en: 'Continue low-power monitoring while hidden' },
  autostart: { zh: '开机自动启动', en: 'Start at login' },
  autostartDescription: { zh: '登录系统后自动守护工作节奏', en: 'Start automatically after sign-in' },
  silentAutostart: { zh: '自启动时静默运行', en: 'Launch silently at login' },
  silentAutostartDescription: { zh: '登录后仅显示托盘图标，不主动打开主窗口', en: 'Show only the tray icon after sign-in without opening the main window' },
  weekend: { zh: '周末启用', en: 'Enable on weekends' },
  weekendDescription: { zh: '周六和周日也执行工作时段规则', en: 'Apply work-hour rules on weekends' },
  noRawFrames: { zh: '原始画面不落盘', en: 'Raw frames are never stored' },
  inMemoryOnly: { zh: '摄像头画面仅在本机内存中处理。', en: 'Camera frames are processed only in local memory.' },
  noIdentity: { zh: '不进行身份识别', en: 'No identity recognition' },
  noVideo: { zh: '不保存视频或截图', en: 'No video or screenshots are saved' },
  noUpload: { zh: '不上传摄像头数据', en: 'Camera data is not uploaded' },
  saveStatistics: { zh: '保存本地行为统计', en: 'Save local behavior statistics' },
  saveStatisticsDescription: { zh: '关闭后停止累计，已有数据不自动删除', en: 'Turning off stops collection without deleting existing data' },
  dataManagement: { zh: '本地数据管理', en: 'Local data management' },
  exportDescription: { zh: '导出内容仅包含日期、时长、次数与结构化行为历史，不含图片。', en: 'Exports include dates, durations, counts, and structured history—never images.' },
  exportCsv: { zh: '导出 CSV', en: 'Export CSV' },
  deleteHistory: { zh: '删除全部统计与行为历史', en: 'Delete statistics and history' },
  medicalDisclaimer: { zh: '健康提醒用于日常行为提醒，不用于疾病诊断或替代医生建议。', en: 'Health Reminder supports daily habits and does not diagnose disease or replace medical advice.' },
  saveFailed: { zh: '设置没有保存', en: 'Settings were not saved' },
  saveFailedHint: { zh: '请检查输入范围后重试，原有设置仍保持有效。', en: 'Check the input range and try again. Existing settings remain active.' },
  islandPageTitle: { zh: '灵动岛显示与交互设置', en: 'Dynamic Island display and interaction settings' },
  islandPageSubtitle: { zh: '自定义灵动岛的显示行为与交互方式，打造更贴合你的使用体验。', en: 'Customize how Dynamic Island appears and behaves for a better experience.' },
  changesApply: { zh: '所有更改将立即生效', en: 'All changes take effect immediately' }
})

type SettingsMessages = { [K in keyof typeof settingsMessages]: string }

function intervalLabel(seconds: number, language: 'zh-CN' | 'en-US'): string {
  return compactDuration(seconds, language)
}

function Toggle({ checked, onChange, label, description, className, disabled = false }: { checked: boolean; onChange: (checked: boolean) => void; label: string; description: string; className?: string; disabled?: boolean }) {
  return (
    <label className={cn('setting-toggle relative flex min-h-15 cursor-pointer items-center gap-4 border-b border-edge-soft py-2', disabled && 'cursor-not-allowed opacity-50', className)}>
      <div className="flex flex-1 flex-col gap-1">
        <strong className="text-sm leading-5 2xl:text-base">{label}</strong>
        <small className="text-[11px] leading-4 text-muted 2xl:text-[13px]">{description}</small>
      </div>
      <input className="peer sr-only" type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />
      <span className="relative h-5.5 w-9.5 shrink-0 rounded-full bg-edge transition after:absolute after:left-0.75 after:top-0.75 after:size-4 after:rounded-full after:bg-panel after:shadow-sm after:transition after:content-[''] peer-checked:bg-accent peer-checked:after:translate-x-4" />
    </label>
  )
}

const primaryButtonClass = 'inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg bg-accent px-5 text-sm font-bold text-inverse shadow-control transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50'
const settingsPanelClass = 'rounded-2xl border border-edge bg-panel p-6 shadow-panel'
const sectionTitleClass = 'mb-1 flex items-center gap-4 border-b border-edge-soft pb-5 [&_h2]:mb-1 [&_h2]:text-xl [&_h2]:font-black [&_p]:m-0 [&_p]:text-xs [&_p]:leading-5 [&_p]:text-muted'
const fieldGridClass =
  'grid grid-cols-1 gap-4 border-b border-edge-soft py-5 sm:grid-cols-2 [&_label]:flex [&_label]:flex-col [&_label]:gap-2.5 [&_label>span]:text-xs [&_label>span]:font-bold [&_label>span]:text-muted [&_input]:h-11 [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-edge [&_input]:bg-field [&_input]:px-4 [&_input]:text-[13px] disabled:[&_input]:cursor-not-allowed'
const timeFieldGridClass = 'grid grid-cols-1 gap-4 sm:grid-cols-2 [&_label]:flex [&_label]:flex-col [&_label]:gap-2.5 [&_label>span]:text-xs [&_label>span]:font-bold [&_label>span]:text-muted [&_input]:h-11 [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-edge [&_input]:bg-field [&_input]:px-4 [&_input]:text-[13px] disabled:[&_input]:cursor-not-allowed'
const selectFieldClass = 'flex min-w-0 flex-col gap-2.5 [&>span]:text-xs [&>span]:font-bold [&>span]:text-muted'
const eyebrowClass = 'text-xs font-extrabold tracking-[.14em] text-accent'

type DurationUnit = 'seconds' | 'minutes'

export function sedentaryDurationInputValue(seconds: number, unit: DurationUnit): string {
  return unit === 'seconds' ? String(seconds) : String(Number((seconds / 60).toFixed(1)))
}

export function parseSedentaryDurationInput(raw: string, unit: DurationUnit): number | null {
  if (!raw.trim()) return null
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return null
  const seconds = unit === 'seconds' ? value : value * 60
  return Math.min(14_400, Math.max(5, Math.round(seconds)))
}

export function canConfigureReminderSound(settings: Pick<AppSettings, 'soundEnabled' | 'meetingMode'>): boolean {
  return settings.soundEnabled
}

function SedentaryThresholdControl({ seconds, onChange, language, messages }: { seconds: number; onChange: (seconds: number) => void; language: 'zh-CN' | 'en-US'; messages: SettingsMessages }) {
  const [unit, setUnit] = useState<DurationUnit>(seconds < 60 ? 'seconds' : 'minutes')
  const [inputValue, setInputValue] = useState(() => sedentaryDurationInputValue(seconds, unit))
  const editingRef = useRef(false)
  useEffect(() => {
    if (!editingRef.current) setInputValue(sedentaryDurationInputValue(seconds, unit))
  }, [seconds, unit])
  const presets = [
    { label: messages.active30, seconds: 1_800 },
    { label: messages.recommended45, seconds: 2_700, recommended: true },
    { label: messages.gentle60, seconds: 3_600 }
  ]
  const commit = (raw: string) => {
    const next = parseSedentaryDurationInput(raw, unit)
    if (next === null) {
      setInputValue(sedentaryDurationInputValue(seconds, unit))
      return
    }
    onChange(next)
    setInputValue(sedentaryDurationInputValue(next, unit))
  }
  const changeUnit = (nextUnit: DurationUnit) => {
    setUnit(nextUnit)
    setInputValue(sedentaryDurationInputValue(seconds, nextUnit))
  }

  return (
    <div className="rounded-xl border border-warning/25 bg-warning-soft p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] font-bold text-muted">{messages.firstReminder}</span>
          <strong className="text-[17px] text-warning">{intervalLabel(seconds, language)}</strong>
        </div>
        <HeartPulse className="shrink-0 text-warning" size={16} />
      </div>
      <p className="mb-0 mt-1 text-[8px] leading-3.5 text-muted">{messages.healthReference}</p>
      <div className="mt-2.5 grid gap-3 sm:grid-cols-[minmax(180px,320px)_minmax(120px,140px)] sm:justify-start">
        <label className="grid min-w-0 gap-1.5">
          <span className="text-[9px] font-bold text-muted">{messages.customDuration}</span>
          <input
            className="h-10 w-full rounded-lg border border-edge bg-field px-3 text-[11px]"
            aria-label={messages.customDurationAria}
            type="number"
            min={unit === 'seconds' ? 5 : 0.1}
            max={unit === 'seconds' ? 14_400 : 240}
            step={unit === 'seconds' ? 1 : 0.1}
            value={inputValue}
            onFocus={() => {
              editingRef.current = true
            }}
            onChange={event => {
              const raw = event.target.value
              setInputValue(raw)
              const next = parseSedentaryDurationInput(raw, unit)
              if (next !== null) onChange(next)
            }}
            onBlur={event => {
              editingRef.current = false
              commit(event.target.value)
            }}
            onKeyDown={event => {
              if (event.key === 'Enter') event.currentTarget.blur()
              if (event.key === 'Escape') {
                setInputValue(sedentaryDurationInputValue(seconds, unit))
                event.currentTarget.blur()
              }
            }}
          />
        </label>
        <div className="grid gap-1.5">
          <span className="text-[9px] font-bold text-muted">{messages.unit}</span>
          <SelectField
            value={unit}
            options={[
              { value: 'seconds', label: messages.seconds },
              { value: 'minutes', label: messages.minutes }
            ]}
            ariaLabel={messages.unitAria}
            onChange={changeUnit}
          />
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5" aria-label={messages.quickDuration}>
        {presets.map(preset => (
          <button
            key={preset.seconds}
            className={cn('min-h-7 rounded-full border border-edge bg-panel/80 px-2.5 text-[9px] text-muted transition hover:border-warning hover:bg-warning-soft hover:text-warning', preset.recommended && 'border-warning/45 text-warning-foreground', seconds === preset.seconds && 'border-warning bg-warning-soft text-warning')}
            onClick={() => {
              setUnit('minutes')
              setInputValue(sedentaryDurationInputValue(preset.seconds, 'minutes'))
              onChange(preset.seconds)
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[8px] text-muted">
        <span className={cn('size-1.5 rounded-full', seconds > 3_600 ? 'bg-warning' : 'bg-accent')} /> {seconds <= 30 ? messages.testMode : seconds > 3_600 ? messages.tooLong : seconds >= 1_800 ? messages.referenceRange : messages.frequentReminder}
      </div>
    </div>
  )
}

type SettingsTab = 'detection' | 'reminder' | 'island' | 'runtime' | 'privacy'

function createSettingsTabs(messages: SettingsMessages): Array<{
  id: SettingsTab
  label: string
  description: string
  icon: typeof Camera
  tone: string
}> {
  return [
    {
      id: 'detection',
      label: messages.detection,
      description: messages.detectionDescription,
      icon: Camera,
      tone: 'bg-accent-soft text-accent'
    },
    {
      id: 'reminder',
      label: messages.reminder,
      description: messages.reminderDescription,
      icon: Clock3,
      tone: 'bg-warning-soft text-warning'
    },
    {
      id: 'island',
      label: messages.island,
      description: messages.islandDescription,
      icon: Sparkles,
      tone: 'bg-accent-soft text-accent'
    },
    {
      id: 'runtime',
      label: messages.runtime,
      description: messages.runtimeDescription,
      icon: Activity,
      tone: 'bg-info-soft text-info'
    },
    {
      id: 'privacy',
      label: messages.privacy,
      description: messages.privacyDescription,
      icon: ShieldCheck,
      tone: 'bg-neutral-soft text-muted'
    }
  ]
}

export function SettingsPage({ snapshot, error, onSave, onExport, onDeleteData, onEnableCamera, onRecalibrate }: { snapshot: AppSnapshot; error: string | null; onSave: (settings: AppSettings) => Promise<boolean>; onExport: () => void; onDeleteData: () => void; onEnableCamera: () => void; onRecalibrate: () => void }) {
  const language = languageOf(snapshot.settings.language)
  const messages = localizeMessages(settingsMessages, language)
  const settingsTabs = createSettingsTabs(messages)
  const [draft, setDraft] = useState(snapshot.settings)
  const [activeTab, setActiveTab] = useState<SettingsTab>('island')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const persistedKey = JSON.stringify(snapshot.settings)
  const lastSyncedKey = useRef(persistedKey)
  useEffect(() => {
    setDraft(current => (JSON.stringify(current) === lastSyncedKey.current ? snapshot.settings : current))
    lastSyncedKey.current = persistedKey
  }, [persistedKey, snapshot.settings])
  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSaveState('idle')
    setDraft(current => ({ ...current, [key]: value }))
  }
  const setSedentarySeconds = (seconds: number) => {
    setSaveState('idle')
    setDraft(current => ({
      ...current,
      sedentarySeconds: seconds,
      sedentaryMinutes: Math.min(120, Math.max(1, Math.ceil(seconds / 60)))
    }))
  }
  const changed = useMemo(() => JSON.stringify(draft) !== JSON.stringify(snapshot.settings), [draft, snapshot.settings])
  const save = async () => {
    setSaveState('saving')
    const ok = await onSave(draft)
    setSaveState(ok ? 'saved' : 'error')
    if (ok) window.setTimeout(() => setSaveState('idle'), 2_000)
  }
  const saveButton = (
    <button className={primaryButtonClass} disabled={saveState === 'saving'} onClick={() => void save()}>
      <CircleCheck size={16} /> {saveState === 'saving' ? messages.saving : saveState === 'saved' ? messages.saved : messages.saveApply}
    </button>
  )
  const activeMeta = settingsTabs.find(tab => tab.id === activeTab) ?? settingsTabs[0]!
  const ActiveIcon = activeMeta.icon

  return (
    <div className="settings-page-layout relative mx-auto grid h-full min-h-0 w-full max-w-375 grid-rows-[110px_minmax(0,1fr)] gap-4 overflow-hidden pb-7 pl-10.75 pr-7 pt-1">
      <header className="flex min-h-0 items-start justify-between gap-6 pt-1">
        <div className="min-w-0">
          <span className={eyebrowClass}>
            {messages.eyebrow} · {activeMeta.label}
          </span>
          <h1 className="mb-1 mt-2 truncate text-[30px] font-black leading-tight tracking-[-.04em]">{activeTab === 'island' ? messages.islandPageTitle : messages.title}</h1>
          <p className="m-0 truncate text-[12px] leading-5 text-muted">{activeTab === 'island' ? messages.islandPageSubtitle : messages.subtitle}</p>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-2 pt-5">
          {changed && (
            <span className="hidden items-center gap-1.5 text-xs font-bold text-warning sm:flex">
              <i className="size-1.5 rounded-full bg-warning" />
              {messages.unsaved}
            </span>
          )}
          {saveButton}
          <small className="text-[9px] text-muted">{messages.changesApply}</small>
        </div>
      </header>

      <div className="grid min-h-0 grid-cols-[194px_minmax(0,1fr)] gap-4">
        <nav className="flex min-h-0 flex-col gap-1.5 rounded-[16px] border border-edge bg-panel p-2" role="tablist" aria-label={messages.categoriesAria} aria-orientation="vertical">
          {settingsTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              id={`settings-tab-${id}`}
              title={label}
              className={cn('relative flex h-13 min-w-0 items-center justify-start gap-3 rounded-[11px] px-4 text-[13px] font-bold text-muted transition hover:bg-panel-muted hover:text-foreground', activeTab === id && 'bg-accent-soft text-accent before:absolute before:bottom-2 before:left-0 before:top-2 before:w-0.5 before:rounded-full before:bg-accent')}
              role="tab"
              aria-selected={activeTab === id}
              aria-controls={`settings-panel-${id}`}
              tabIndex={activeTab === id ? 0 : -1}
              onClick={() => setActiveTab(id)}
            >
              <Icon className="shrink-0" size={19} />
              <span className="max-w-full truncate">{label}</span>
              <ChevronRight className="ml-auto text-subtle" size={15} />
            </button>
          ))}
        </nav>

        <section className={cn(settingsPanelClass, 'settings-content-panel themed-scrollbar min-h-0 p-6', activeTab === 'island' ? 'overflow-hidden' : 'overflow-y-auto', activeTab === 'runtime' && 'settings-panel-runtime')} id={`settings-panel-${activeTab}`} role="tabpanel" aria-labelledby={`settings-tab-${activeTab}`}>
          <div className={cn(sectionTitleClass, 'settings-section-title')}>
            <span className={cn('grid size-12 place-items-center rounded-xl', activeMeta.tone)}>
              <ActiveIcon size={24} />
            </span>
            <div className="min-w-0">
              <h2>{activeMeta.label}</h2>
              <p>{activeMeta.description}</p>
            </div>
          </div>

          {activeTab === 'detection' && (
            <div>
              <Toggle checked={draft.cameraEnabled} onChange={value => set('cameraEnabled', value)} label={messages.cameraDetection} description={messages.cameraDetectionDescription} />
              <div className={cn(fieldGridClass, 'lg:grid-cols-3')}>
                <div className={selectFieldClass}>
                  <span>{messages.sensitivity}</span>
                  <SelectField
                    value={draft.sensitivity}
                    options={[
                      { value: 'low', label: messages.sensitivityLow },
                      { value: 'balanced', label: messages.sensitivityBalanced },
                      { value: 'high', label: messages.sensitivityHigh }
                    ]}
                    ariaLabel={messages.sensitivity}
                    onChange={value => set('sensitivity', value)}
                  />
                </div>
                <div className={selectFieldClass}>
                  <span>{messages.headDownThreshold}</span>
                  <SelectField value={draft.headDownMinutes} options={[1, 2, 3, 5, 10].map(value => ({ value, label: `${value} ${messages.minutes}` }))} ariaLabel={messages.headDownThreshold} onChange={value => set('headDownMinutes', value)} />
                </div>
                <div className={selectFieldClass}>
                  <span>{messages.headDownConfirmation}</span>
                  <SelectField
                    disabled={!draft.islandHeadDownEnabled}
                    value={draft.headDownConfirmationSeconds}
                    options={[
                      { value: 5, label: `5 ${messages.seconds} · ${messages.fasterResponse}` },
                      { value: 10, label: `10 ${messages.seconds} · ${messages.robust}` },
                      { value: 15, label: `15 ${messages.seconds} · ${messages.recommended}` },
                      { value: 30, label: `30 ${messages.seconds} · ${messages.fewerMistakes}` }
                    ]}
                    ariaLabel={messages.confirmationAria}
                    onChange={value => set('headDownConfirmationSeconds', value)}
                  />
                </div>
              </div>
              {snapshot.monitoringMode === 'camera' && snapshot.calibrated ? (
                <button className="inline-flex items-center gap-2 pt-4 text-sm font-bold text-accent hover:text-accent-strong" onClick={onRecalibrate}>
                  <RotateCcw size={18} /> {messages.recalibrate}
                </button>
              ) : (
                <button className="inline-flex items-center gap-2 pt-4 text-sm font-bold text-accent hover:text-accent-strong" onClick={onEnableCamera}>
                  <Camera size={18} /> {snapshot.calibrated ? messages.reenablePosture : messages.enableCalibrate}
                </button>
              )}
            </div>
          )}

          {activeTab === 'reminder' && (
            <div className="grid min-h-0 gap-4">
              <section className="min-w-0 rounded-xl border border-edge-soft bg-panel-muted/65 p-4" aria-labelledby="reminder-cadence-title">
                <div className="mb-4">
                  <h3 className="m-0 text-base font-black" id="reminder-cadence-title">
                    {messages.cadence}
                  </h3>
                  <p className="mb-0 mt-1 text-[11px] leading-5 text-muted">{messages.cadenceDescription}</p>
                </div>
                <SedentaryThresholdControl seconds={draft.sedentarySeconds} onChange={setSedentarySeconds} language={language} messages={messages} />
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className={selectFieldClass}>
                    <span>{messages.repeatReminder}</span>
                    <SelectField
                      disabled={draft.sedentarySeconds <= 30}
                      value={draft.repeatReminderMinutes}
                      options={
                        draft.sedentarySeconds <= 30
                          ? [
                              {
                                value: draft.repeatReminderMinutes,
                                label: `${draft.sedentarySeconds} ${messages.followTestThreshold}`
                              }
                            ]
                          : [5, 10, 15, 20, 30].map(value => ({ value, label: `${value} ${messages.minutes}` }))
                      }
                      ariaLabel={messages.repeatReminder}
                      onChange={value => set('repeatReminderMinutes', value)}
                    />
                  </div>
                  <div className={selectFieldClass}>
                    <span>{messages.validBreak}</span>
                    <SelectField
                      value={draft.breakMinutes}
                      options={[
                        { value: 1, label: `1 ${messages.minutes} · ${messages.quickActivity}` },
                        { value: 2, label: `2 ${messages.minutes} · ${messages.lightBreak}` },
                        { value: 3, label: `3 ${messages.minutes} · ${messages.dailyCadence}` },
                        { value: 5, label: `5 ${messages.minutes} · ${messages.healthyRecommendation}` },
                        { value: 10, label: `10 ${messages.minutes} · ${messages.fullBreak}` }
                      ]}
                      ariaLabel={messages.validBreak}
                      onChange={value => set('breakMinutes', value)}
                    />
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-edge-soft bg-panel-muted/65 p-4" aria-labelledby="notification-style-title">
                <div>
                  <h3 className="m-0 text-base font-black" id="notification-style-title">
                    {messages.notificationStyle}
                  </h3>
                  <p className="mb-0 mt-1 text-[11px] leading-5 text-muted">{messages.notificationDescription}</p>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-edge-soft bg-panel px-4 py-3">
                    <Toggle className="min-h-0 border-0 py-0" checked={draft.repeatReminders} onChange={value => set('repeatReminders', value)} label={messages.repeatBehavior} description={draft.sedentarySeconds <= 30 ? `${messages.testRepeatPrefix} ${draft.sedentarySeconds} ${messages.repeatSuffix}` : messages.cooldown} />
                  </div>
                  <div className="rounded-lg border border-edge-soft bg-panel px-4 py-3">
                    <Toggle className="min-h-0 border-0 py-0" checked={draft.meetingMode} onChange={value => set('meetingMode', value)} label={messages.meetingMode} description={messages.quietNotifications} />
                  </div>
                  <div className="rounded-lg border border-edge-soft bg-panel px-4 py-3">
                    <Toggle className="min-h-0 border-0 py-0" checked={draft.soundEnabled} onChange={value => set('soundEnabled', value)} label={messages.notificationSound} description={messages.mutedInMeeting} />
                    <div className="mt-3">
                      <SelectField
                        disabled={!canConfigureReminderSound(draft)}
                        value={draft.reminderSound}
                        options={[
                          { value: 'auto', label: messages.soundAuto },
                          { value: 'chime', label: messages.soundChime },
                          { value: 'soft', label: messages.soundSoft },
                          { value: 'alert', label: messages.soundAlert },
                          { value: 'system', label: messages.soundSystem },
                          { value: 'off', label: messages.soundOff }
                        ]}
                        ariaLabel={messages.soundStyle}
                        onChange={value => set('reminderSound', value)}
                      />
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'island' && (
            <div className="grid gap-3">
              <SettingItem icon={Sparkles} checked={draft.islandEnabled} onChange={value => set('islandEnabled', value)} title={messages.enableIsland} description={messages.islandMasterDescription} />
              <div className={cn('grid grid-cols-2 gap-3', !draft.islandEnabled && 'pointer-events-none opacity-50')}>
                <SettingItem icon={Armchair} checked={draft.islandReminderEnabled} onChange={value => set('islandReminderEnabled', value)} title={messages.sedentaryReminder} description={messages.sedentaryReminderDescription} />
                <SettingItem icon={UserCheck} checked={draft.islandAwayEnabled} onChange={value => set('islandAwayEnabled', value)} title={messages.awayStatus} description={messages.awayStatusDescription} />
                <SettingItem icon={Activity} checked={draft.islandHeadDownEnabled} onChange={value => set('islandHeadDownEnabled', value)} title={messages.headDownDetection} description={messages.headDownDetectionDescription} />
                <SettingItem icon={Clock3} checked={draft.islandBreakEnabled} onChange={value => set('islandBreakEnabled', value)} title={messages.breakCountdown} description={messages.breakCountdownDescription} />
                <SettingItem icon={Activity} checked={draft.islandPersistentStatusEnabled} onChange={value => set('islandPersistentStatusEnabled', value)} title={messages.persistentStatus} description={messages.persistentStatusDescription} />
                <SettingItem icon={CirclePause} checked={draft.islandPausedStatusEnabled} onChange={value => set('islandPausedStatusEnabled', value)} title={messages.pausedStatus} description={messages.pausedStatusDescription} />
                <SettingItem icon={ZoomIn} checked={draft.islandPeekThroughEnabled} onChange={value => set('islandPeekThroughEnabled', value)} title={messages.magnifier} description={messages.magnifierDescription} />
                <SettingItem icon={PanelTop} checked={draft.islandAllowWithMainWindow} onChange={value => set('islandAllowWithMainWindow', value)} title={messages.showWithWindow} description={messages.showWithWindowDescription} />
              </div>
              <SettingItem icon={Power} checked={draft.islandPermanentCloseEnabled} onChange={value => set('islandPermanentCloseEnabled', value)} title={messages.allowPermanentClose} description={messages.allowPermanentCloseDescription} className="max-w-[calc(50%-6px)]" />
            </div>
          )}

          {activeTab === 'runtime' && (
            <div className="settings-runtime-grid grid min-h-0 gap-4">
              <section className="settings-runtime-card min-w-0 rounded-xl border border-edge-soft bg-panel-muted/65 p-4" aria-labelledby="quiet-hours-title">
                <div className="grid gap-4 min-[1280px]:grid-cols-[minmax(280px,.85fr)_minmax(360px,1.15fr)] min-[1280px]:items-end">
                  <div className="min-w-0">
                    <div className="mb-4">
                      <h3 className="m-0 text-base font-black" id="quiet-hours-title">
                        {messages.quietHours}
                      </h3>
                      <p className="mb-0 mt-1 text-[11px] leading-5 text-muted">{messages.quietDescription}</p>
                    </div>
                    <Toggle className="min-h-0 border-0 py-0" checked={draft.quietHoursEnabled} onChange={value => set('quietHoursEnabled', value)} label={messages.splitDayMode} description={messages.splitDayDescription} />
                  </div>
                  <div className={cn(timeFieldGridClass, 'border-t border-edge-soft pt-4 min-[1280px]:border-l min-[1280px]:border-t-0 min-[1280px]:pl-5 min-[1280px]:pt-0', !draft.quietHoursEnabled && 'opacity-50')}>
                    <label>
                      <span>{messages.quietStart}</span>
                      <input type="time" disabled={!draft.quietHoursEnabled} value={draft.quietStart} onChange={event => set('quietStart', event.target.value)} />
                    </label>
                    <label>
                      <span>{messages.quietEnd}</span>
                      <input type="time" disabled={!draft.quietHoursEnabled} value={draft.quietEnd} onChange={event => set('quietEnd', event.target.value)} />
                    </label>
                  </div>
                </div>
              </section>

              <section className="settings-runtime-card min-w-0 rounded-xl border border-edge-soft bg-panel-muted/65 p-4" aria-labelledby="work-schedule-title">
                <div className="grid gap-4 min-[1280px]:grid-cols-[minmax(280px,.85fr)_minmax(360px,1.15fr)] min-[1280px]:items-end">
                  <div className="min-w-0">
                    <h3 className="m-0 text-base font-black" id="work-schedule-title">
                      {messages.workSchedule}
                    </h3>
                    <p className="mb-0 mt-1 text-[11px] leading-5 text-muted">{messages.workScheduleDescription}</p>
                  </div>
                  <div className={cn(timeFieldGridClass, 'border-t border-edge-soft pt-4 min-[1280px]:border-l min-[1280px]:border-t-0 min-[1280px]:pl-5 min-[1280px]:pt-0')}>
                    <label>
                      <span>{messages.workStart}</span>
                      <input type="time" value={draft.workdayStart} onChange={event => set('workdayStart', event.target.value)} />
                    </label>
                    <label>
                      <span>{messages.workEnd}</span>
                      <input type="time" value={draft.workdayEnd} onChange={event => set('workdayEnd', event.target.value)} />
                    </label>
                  </div>
                </div>
              </section>

              <section className="settings-runtime-card rounded-xl border border-edge-soft bg-panel-muted/65 p-4" aria-labelledby="background-startup-title">
                <div>
                  <h3 className="m-0 text-base font-black" id="background-startup-title">
                    {messages.backgroundAndStartup}
                  </h3>
                  <p className="mb-0 mt-1 text-[11px] leading-5 text-muted">{messages.backgroundAndStartupDescription}</p>
                </div>
                <div className="mt-3 grid gap-x-5 md:grid-cols-2">
                  <Toggle checked={draft.runInBackground} onChange={value => set('runInBackground', value)} label={messages.background} description={messages.backgroundDescription} />
                  <Toggle checked={draft.autostart} onChange={value => set('autostart', value)} label={messages.autostart} description={messages.autostartDescription} />
                  <Toggle checked={draft.silentAutostart} disabled={!draft.autostart} onChange={value => set('silentAutostart', value)} label={messages.silentAutostart} description={messages.silentAutostartDescription} />
                  <Toggle checked={draft.weekendEnabled} onChange={value => set('weekendEnabled', value)} label={messages.weekend} description={messages.weekendDescription} />
                </div>
              </section>
            </div>
          )}

          {activeTab === 'privacy' && (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="rounded-[14px] border border-edge-soft bg-panel-muted p-4">
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent">
                      <ShieldCheck size={18} />
                    </span>
                    <div>
                      <strong className="text-xs">{messages.noRawFrames}</strong>
                      <p className="m-0 mt-0.5 text-[8px] text-muted">{messages.inMemoryOnly}</p>
                    </div>
                  </div>
                  <ul className="mt-3 grid list-none gap-2 p-0 text-[9px] text-muted [&_li]:flex [&_li]:items-center [&_li]:gap-2 [&_svg]:text-accent">
                    <li>
                      <Eye size={14} /> {messages.noIdentity}
                    </li>
                    <li>
                      <CameraOff size={14} /> {messages.noVideo}
                    </li>
                    <li>
                      <LockKeyhole size={14} /> {messages.noUpload}
                    </li>
                  </ul>
                  <Toggle checked={draft.statisticsEnabled} onChange={value => set('statisticsEnabled', value)} label={messages.saveStatistics} description={messages.saveStatisticsDescription} />
                </div>
              </div>
              <div>
                <div className="rounded-[14px] border border-edge-soft bg-panel-muted p-4">
                  <strong className="text-xs">{messages.dataManagement}</strong>
                  <p className="mb-3 mt-1 text-[9px] leading-4 text-muted">{messages.exportDescription}</p>
                  <div className="grid gap-2">
                    <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-edge bg-panel px-4 text-[10px] font-bold text-muted hover:bg-panel-muted" onClick={onExport}>
                      <Download size={16} /> {messages.exportCsv}
                    </button>
                    <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-[10px] font-bold text-danger hover:bg-danger-soft" onClick={onDeleteData}>
                      <Trash2 size={16} /> {messages.deleteHistory}
                    </button>
                  </div>
                  <p className="mb-0 mt-3 text-[8px] leading-3.5 text-subtle">{messages.medicalDisclaimer}</p>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {saveState === 'error' && (
        <div className="absolute bottom-4 left-1/2 z-20 w-[min(520px,calc(100%-32px))] -translate-x-1/2 rounded-xl border border-warning/35 bg-warning-soft p-3 text-warning-foreground shadow-panel" role="alert">
          <strong className="text-xs">{messages.saveFailed}</strong>
          <span className="ml-2 text-[9px]">{error ?? messages.saveFailedHint}</span>
        </div>
      )}
    </div>
  )
}
