import { Activity, BellOff, Camera, CameraOff, ChevronRight, Clock3, Coffee, Gauge, ScanFace, ShieldCheck, SlidersHorizontal, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { PoseCanvas } from '../../../components/PoseCanvas'
import { TodayWeatherHeader } from '../../weather/WeatherOverview'
import { languageOf } from '../../../i18n'
import { defineMessages, localizeMessages, translateNow } from '../../../runtimeI18n'
import type { AppSettings, AppSnapshot } from '../../../types'
import { cn, compactDuration, formatDuration, percent } from '../../../utils'
import type { DashboardProps } from '../dashboardTypes'

const todayMessages = defineMessages({
  today: '今天',
  title: '照顾好当下的姿势',
  subtitle: '保持专注即可，健康提醒只在需要时出现。',
  endBreak: '结束休息',
  proactiveBreak: '主动休息',
  cameraUnavailable: '摄像头检测暂不可用，已保留普通定时提醒',
  cameraHelp: '请检查系统摄像头权限或设备占用情况。',
  checkSettings: '检查设置',
  currentSession: '当前会话',
  testSeconds: '秒测试',
  cameraLowPower: '摄像头低功耗检测',
  timerMode: '普通定时模式',
  continuousSitting: '连续坐姿',
  currentPosture: '当前姿态',
  stability: '头肩稳定度',
  localMultiFrame: '多帧确认 · 画面仅在本机处理',
  timerReminder: '普通定时提醒',
  detectionStatus: '检测状态',
  silent: '静默中',
  timing: '定时中',
  detecting: '检测中',
  pendingConfirmation: '待确认',
  cameraPreview: '摄像头实时预览',
  enablePosture: '开启姿势检测',
  requestingCamera: '正在请求摄像头权限…',
  loadingModel: '正在加载姿态模型…',
  connectingStream: '正在连接视频流…',
  retryPreview: '重试预览',
  privacyDevice: '隐私与设备',
  localPrivate: '画面仅在本机处理，不保存，不上传',
  detectionSettings: '检测设置',
  adjustDetection: '调整摄像头与识别选项',
  sittingToday: '今日坐姿',
  longest: '最长连续',
  cumulativeHeadDown: '累计低头',
  gentleReminders: '次温和提醒',
  completedBreaks: '完成休息',
  times: '次',
  habitForming: '正在形成好习惯',
  proactiveRecorded: '主动休息也会被记录',
  ignoredReminders: '忽略提醒',
  controlFrequency: '我们会控制提醒频率',
  awayActivity: '离座活动',
  awayRecorded: '短暂离开也被记录',
  movementCounts: '起身接水也算活动',
  paused: '检测已暂停',
  breakActive: '休息进行中',
  realtimeDetection: '正在实时检测',
  connectingDetection: '正在连接检测',
  timerDetectionMode: '定时提醒模式',
  resumeCamera: '恢复后继续本地姿态识别',
  resumeTimer: '恢复后继续普通定时提醒',
  endBreakCamera: '结束休息后继续本地姿态识别',
  endBreakTimer: '结束休息后继续普通定时提醒',
  timerOnly: '仅根据启用时间提供久坐提醒',
  awayPaused: '已离座 · 计时已暂停',
  returnContinue: '回来后会继续判断当前会话',
  confirmingPosture: '正在确认姿态',
  stableBeforeCount: '多帧稳定后才会开始累计',
  naturalPosture: '姿态自然',
  keepPosture: '保持现在这样，很不错',
  headDownActive: '持续低头中',
  accumulating: '系统正在累计持续时间',
  standing: '你站起来了',
  validBreak: '保持一会儿即可完成有效休息',
  waitingStableFrame: '等待稳定画面',
  lowConfidence: '低置信度不会触发明确提醒',
  islandCountdown: '倒计时与结束操作已显示在灵动岛',
  timerEnabled: '定时提醒已开启',
  timerThresholdHint: '达到阈值后会提醒你起身活动',
  goodQuality: '光线与取景适合识别',
  darkQuality: '当前光线较暗，明确判断已暂停',
  occludedQuality: '头部暂时被遮挡，请让鼻尖、双眼和双耳尽量清晰可见',
  multiplePeople: '画面中有多人，明确判断已暂停',
  unstableQuality: '正在等待稳定的多帧结果',
  weekendPaused: '周末暂停提醒',
  outsideWorkHours: '当前不在工作提醒时段',
  quietUntil: '静默中 ·',
  resumeReminder: '恢复提醒',
  breakComplete: '休息时间到',
  awaitCompletion: '等待确认完成',
  confirmInIsland: '请在灵动岛确认完成',
  remaining: '剩余',
  breakRemaining: '休息剩余',
  reminderPlanPaused: '提醒计划已暂停',
  resumeContinue: '恢复后继续',
  resumeCounting: '恢复检测后继续累计',
  reminderSent: '本次提醒已发出',
  handleReminder: '请处理当前提醒',
  reminderIssued: '提醒已发出',
  soon: '即将提醒',
  nextReminder: '下次提醒',
  beforeFirst: '距离首次提醒还有',
  beforeNext: '距离下次提醒还有',
  needStableSitting: '还需稳定坐姿',
  waitingStableSitting: '等待稳定坐姿',
  countAfterStable: '识别稳定后开始计时',
  repeatsDisabled: '重复提醒已关闭',
  recountAfterBreak: '休息后重新计时',
  waitingForBreak: '等待你开始休息',
  every: '每',
  reminderSuffix: '提醒',
  calculatingNext: '正在计算下一次提醒'
})

type TodayMessages = { [K in keyof typeof todayMessages]: string }

export function TodayPage({ snapshot, visionStatus, streamUrl, previewError, landmarks, error, onStartBreak, onEndBreak, onPage, onRetryPreview, onEnableCamera }: DashboardProps) {
  const language = languageOf(snapshot.settings.language)
  const messages = localizeMessages(todayMessages, language)
  const thresholdSeconds = snapshot.settings.sedentarySeconds
  const isReminderTest = thresholdSeconds <= 30
  const schedulePause = reminderSchedulePause(snapshot.settings, messages)
  const progress = percent(snapshot.seatedSeconds, thresholdSeconds)
  const reminderTiming = reminderTimingCopy(snapshot, schedulePause, language, messages)
  const isCamera = snapshot.monitoringMode === 'camera'
  const canEnableCamera = !isCamera && (snapshot.lifecycle === 'monitoring' || snapshot.lifecycle === 'degraded')
  // 追踪应用内预览首帧是否已渲染,确保骨架不会在画面到达前出现。
  const [imgLoaded, setImgLoaded] = useState(false)
  const detectionPanelTitle = snapshot.lifecycle === 'paused' ? messages.paused : snapshot.lifecycle === 'break' ? messages.breakActive : isCamera ? (visionStatus === 'ready' ? (imgLoaded ? messages.realtimeDetection : messages.connectingStream) : messages.connectingDetection) : messages.timerDetectionMode
  const detectionPanelDescription = snapshot.lifecycle === 'paused' ? (isCamera ? messages.resumeCamera : messages.resumeTimer) : snapshot.lifecycle === 'break' ? (isCamera ? messages.endBreakCamera : messages.endBreakTimer) : isCamera ? qualityLabel(snapshot.frameQuality, messages) : messages.timerOnly
  const streamSession = streamUrl?.startsWith('data:image/') ? 'event-preview' : (streamUrl?.split('?', 1)[0] ?? null)
  useEffect(() => {
    // streamUrl 变化时重置加载状态,等待新一轮首帧到达。
    setImgLoaded(false)
  }, [streamSession])
  // 仅在请求权限和加载模型阶段显示遮罩;"ready" 阶段改用独立的视频流连接遮罩。
  const isVisionLoading = visionStatus === 'requesting' || visionStatus === 'loading_model'
  // 模型已就绪但应用内预览首帧尚未渲染时,显示视频流连接提示。
  const isStreamConnecting = isCamera && visionStatus === 'ready' && !imgLoaded
  const behaviorCopy: Record<AppSnapshot['behavior'], { title: string; text: string; tone: string }> = {
    no_person: { title: messages.awayPaused, text: messages.returnContinue, tone: 'muted' },
    present: { title: messages.confirmingPosture, text: messages.stableBeforeCount, tone: 'blue' },
    sitting_normal: { title: messages.naturalPosture, text: messages.keepPosture, tone: 'healthy' },
    head_down: { title: messages.headDownActive, text: messages.accumulating, tone: 'warning' },
    standing_break: { title: messages.standing, text: messages.validBreak, tone: 'blue' },
    unknown: { title: messages.waitingStableFrame, text: messages.lowConfidence, tone: 'muted' }
  }
  const behavior = snapshot.lifecycle === 'break' ? { title: messages.breakActive, text: messages.islandCountdown, tone: 'blue' } : isCamera ? behaviorCopy[snapshot.behavior] : { title: messages.timerEnabled, text: messages.timerThresholdHint, tone: 'healthy' }

  return (
    <div className="today-page-layout relative grid h-full min-h-0 grid-rows-[162px_12px_minmax(0,1fr)_23px_124px] overflow-hidden px-6 pb-14.5 pt-5">
      <header className="grid min-h-0 grid-cols-1 gap-5 min-[1180px]:grid-cols-[minmax(340px,1fr)_minmax(430px,514px)]">
        <div className="min-w-0 self-start pt-3">
          <span className="text-[11px] font-extrabold tracking-[.14em] text-accent">{messages.today} · {new Intl.DateTimeFormat(language, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())}</span>
          <h1 className="mt-5 text-[32px] font-black leading-none tracking-[-.04em]">{messages.title}</h1>
          <p className="mt-5 text-[13px] text-muted">{messages.subtitle}</p>
        </div>
        <div className="hidden h-full min-w-0 items-center justify-end gap-4 min-[1180px]:flex">
          <div className="w-55 shrink-0 translate-y-1.5 empty:hidden">
            <TodayWeatherHeader language={language} />
          </div>
          <button className="inline-flex h-11 w-42 shrink-0 translate-y-4 items-center justify-center gap-2 rounded-full bg-accent-soft px-5 text-[12px] font-bold text-foreground transition-colors hover:bg-accent-soft-strong" onClick={snapshot.lifecycle === 'break' ? onEndBreak : onStartBreak}>
            <Coffee size={17} /> {snapshot.lifecycle === 'break' ? messages.endBreak : messages.proactiveBreak} <ChevronRight size={15} />
          </button>
        </div>
      </header>

      {snapshot.lifecycle !== 'paused' && (error || (isCamera && visionStatus === 'error')) && (
        <div className="absolute inset-x-6 top-35 z-20 flex items-center gap-3 rounded-xl border border-warning/35 bg-warning-soft px-4 py-2 text-xs text-warning-foreground shadow-control">
          <CameraOff size={18} />
          <div className="min-w-0 flex-1">
            <strong className="block">{messages.cameraUnavailable}</strong>
            <span className="block truncate text-[9px]">{error ? translateNow(error, language) : messages.cameraHelp}</span>
          </div>
          <button className="font-bold underline" onClick={() => onPage('settings')}>
            {messages.checkSettings}
          </button>
        </div>
      )}

      <div className="row-start-3 grid min-h-0 gap-4 min-[1180px]:grid-cols-[minmax(0,1fr)_343px]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-card border border-edge bg-panel shadow-panel">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-edge px-5">
            <span className="flex items-center gap-2 text-xs font-extrabold">
              <Activity size={17} /> {messages.currentSession}
            </span>
            <small className="text-[9px] text-muted">{isReminderTest ? `${thresholdSeconds} ${messages.testSeconds}` : (schedulePause ?? (isCamera ? messages.cameraLowPower : messages.timerMode))}</small>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(230px,.82fr)_minmax(260px,1.18fr)] items-center gap-7 px-6 py-4">
            <div className="mx-auto grid aspect-square w-[min(28vh,220px)] min-w-45.5 -translate-y-1 place-items-center rounded-full bg-[conic-gradient(var(--theme-accent)_var(--session-progress),var(--theme-edge)_0)] p-2" style={{ '--session-progress': `${progress * 3.6}deg` } as CSSProperties}>
              <div className="grid size-full place-content-center rounded-full bg-panel text-center shadow-inner">
                <span className="text-[11px] text-muted">{messages.continuousSitting}</span>
                <strong className={cn('my-2 whitespace-nowrap leading-none tracking-[-.035em]', language === 'en-US' ? 'text-[18px]' : 'text-[28px]')}>{formatDuration(snapshot.seatedSeconds, language)}</strong>
                <small className="max-w-40 text-[10px] font-bold text-accent" aria-live="polite">
                  {reminderTiming.status}
                </small>
              </div>
            </div>
            <div className="min-w-0">
              <span className={cn('grid size-12 -translate-y-4 place-items-center rounded-2xl', behavior.tone === 'healthy' ? 'bg-accent-soft text-accent' : behavior.tone === 'warning' ? 'bg-warning-soft text-warning' : 'bg-neutral-soft text-muted')}>
                <UserRound size={27} />
              </span>
              <span className="mt-2 block text-[11px] font-extrabold tracking-[.14em] text-accent">{messages.currentPosture}</span>
              <h2 className="mt-4 truncate text-[30px] font-black leading-tight tracking-[-.04em]">{behavior.title}</h2>
              <p className="mt-2 truncate text-[11px] text-muted">{behavior.text}</p>
              {isCamera && (
                <div className="mt-7 grid grid-cols-[auto_1fr_auto] items-center gap-3 text-[10px] text-muted">
                  <span>{messages.stability}</span>
                  <div className="h-2 overflow-hidden rounded-full bg-edge">
                    <i className="block h-full rounded-full bg-accent" style={{ width: `${Math.round(snapshot.postureConfidence * 100)}%` }} />
                  </div>
                  <strong className="text-foreground">{Math.round(snapshot.postureConfidence * 100)}%</strong>
                </div>
              )}
            </div>
          </div>
          <div className="flex h-16 shrink-0 items-center justify-between gap-4 border-t border-edge px-5 text-[10px] text-muted">
            <span className="flex min-w-0 items-center gap-2 truncate">
              <ShieldCheck size={14} /> {isCamera ? messages.localMultiFrame : messages.timerReminder}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <Clock3 size={14} />
              <b className="text-accent">{reminderTiming.clock}</b>
              <em className="not-italic">{reminderTiming.countdown}</em>
            </span>
          </div>
        </section>

        <section className="hidden min-h-0 grid-rows-[62px_minmax(0,1fr)_68px_68px] overflow-hidden rounded-card border border-edge bg-panel shadow-panel min-[1180px]:grid">
          <div className="flex items-center justify-between px-5">
            <span className="flex items-center gap-2 text-xs font-extrabold">
              <Camera size={17} /> {messages.detectionStatus}
            </span>
            <span className={cn('rounded-full px-3 py-1 text-[9px] font-bold', snapshot.lifecycle === 'paused' ? 'bg-warning-soft text-warning' : !isCamera || snapshot.frameQuality === 'good' ? 'bg-accent-soft text-accent' : 'bg-warning-soft text-warning')}>{snapshot.lifecycle === 'paused' ? messages.silent : !isCamera ? messages.timing : snapshot.frameQuality === 'good' ? messages.detecting : messages.pendingConfirmation}</span>
          </div>
          <div className="relative mx-4 min-h-0 overflow-hidden rounded-xl bg-[linear-gradient(135deg,var(--theme-panel-strong),var(--theme-accent-strong))]">
            {isCamera && streamUrl ? (
              <>
                <img src={streamUrl} className="absolute inset-0 size-full object-cover" alt={messages.cameraPreview} onLoad={() => setImgLoaded(true)} onError={() => setImgLoaded(false)} />
                {imgLoaded && <PoseCanvas landmarks={landmarks} />}
              </>
            ) : (
              <div className="grid size-full -translate-y-2 place-content-center justify-items-center gap-2 text-muted">
                <ScanFace size={82} strokeWidth={1.15} />
                {canEnableCamera && (
                  <button type="button" className="relative z-20 min-h-9 rounded-lg border border-inverse/20 bg-panel-strong/45 px-4 py-2 text-[10px] font-bold text-inverse shadow-control hover:bg-panel-strong/65" onClick={onEnableCamera}>
                    {messages.enablePosture}
                  </button>
                )}
              </div>
            )}
            {isCamera && isVisionLoading && (
              <div className="absolute inset-0 grid place-content-center justify-items-center gap-2 bg-panel-strong/90 text-inverse-muted">
                <Camera size={22} />
                <span className="text-[9px]">{visionStatus === 'requesting' ? messages.requestingCamera : messages.loadingModel}</span>
              </div>
            )}
            {isStreamConnecting && (
              <div className="absolute inset-0 grid place-content-center justify-items-center gap-2 bg-panel-strong/90 px-5 text-center text-inverse-muted">
                <Camera size={22} />
                <span className="text-[9px]">{previewError ? translateNow(previewError, language) : messages.connectingStream}</span>
                {previewError && (
                  <button className="mt-1 rounded-lg border border-inverse/20 px-3 py-1.5 text-[9px] font-bold text-inverse hover:bg-inverse/10" onClick={onRetryPreview}>
                    {messages.retryPreview}
                  </button>
                )}
              </div>
            )}
            <div className={cn('pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-panel-strong/80 to-transparent px-4 pt-8 text-inverse', snapshot.lifecycle === 'paused' ? 'pb-6 text-center' : 'pb-3')}>
              <strong className="block text-[11px]">{detectionPanelTitle}</strong>
              <small className={cn('block truncate text-[8px] text-inverse/60', snapshot.lifecycle === 'paused' ? 'mt-2' : 'mt-1')}>{detectionPanelDescription}</small>
            </div>
          </div>
          <button className="mx-4 grid min-w-0 grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2 text-left hover:bg-panel-muted" onClick={() => onPage('privacy')}>
            <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent">
              <ShieldCheck size={18} />
            </span>
            <span className="min-w-0">
              <strong className="block text-[10px]">{messages.privacyDevice}</strong>
              <small className="mt-1 block truncate text-[9px] text-muted">{messages.localPrivate}</small>
            </span>
            <ChevronRight size={16} className="text-muted" />
          </button>
          <button className="mx-4 grid min-w-0 grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2 border-t border-edge text-left hover:bg-panel-muted" onClick={() => onPage('settings')}>
            <span className="grid size-9 place-items-center rounded-xl bg-neutral-soft text-muted">
              <SlidersHorizontal size={18} />
            </span>
            <span className="min-w-0">
              <strong className="block text-[10px]">{messages.detectionSettings}</strong>
              <small className="mt-1 block truncate text-[9px] text-muted">{messages.adjustDetection}</small>
            </span>
            <ChevronRight size={16} className="text-muted" />
          </button>
        </section>
      </div>

      <div className={cn('row-start-5 grid min-h-0 gap-3', isCamera ? 'grid-cols-4 min-[1180px]:grid-cols-5' : 'grid-cols-4')}>
        <MetricCard icon={Clock3} label={messages.sittingToday} value={compactDuration(snapshot.today.seatedSeconds, language)} note={`${messages.longest} ${compactDuration(snapshot.today.longestSeatedSeconds, language)}`} tone="sage" language={language} />
        <MetricCard icon={Gauge} label={messages.cumulativeHeadDown} value={compactDuration(snapshot.today.headDownSeconds, language)} note={`${snapshot.today.reminderCount} ${messages.gentleReminders}`} tone="sand" language={language} />
        <MetricCard icon={Coffee} label={messages.completedBreaks} value={`${snapshot.today.breakCount} ${messages.times}`} note={snapshot.today.breakCount ? messages.habitForming : messages.proactiveRecorded} tone="blue" language={language} />
        <MetricCard icon={BellOff} label={messages.ignoredReminders} value={`${snapshot.today.dismissedCount} ${messages.times}`} note={messages.controlFrequency} tone="rose" language={language} />
        {isCamera ? (
          <div className="hidden min-[1180px]:contents">
            <MetricCard icon={Activity} label={messages.awayActivity} value={compactDuration(snapshot.today.awaySeconds, language)} note={snapshot.today.awaySeconds > 0 ? messages.awayRecorded : messages.movementCounts} tone="sage" language={language} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function MetricCard({ icon: Icon, label, value, note, tone, language = 'zh-CN' }: { icon: typeof Clock3; label: string; value: string; note: string; tone: string; language?: 'zh-CN' | 'en-US' }) {
  const tones: Record<string, string> = { sage: 'bg-accent-soft text-accent', sand: 'bg-warning-soft text-warning', blue: 'bg-info-soft text-info', rose: 'bg-danger-soft text-danger' }
  return (
    <section className="flex min-h-0 min-w-0 items-center gap-2.5 rounded-2xl border border-edge bg-panel px-3 shadow-panel">
      <span className={cn('grid size-11 shrink-0 place-items-center rounded-[15px]', tones[tone])}>
        <Icon size={21} />
      </span>
      <div className="min-w-0">
        <span className="block text-[10px] text-muted">{label}</span>
        <strong className={cn('my-1 block whitespace-nowrap leading-none tracking-[-.025em]', language === 'en-US' ? 'text-[10px] min-[1360px]:text-[12px]' : 'text-[14px] min-[1360px]:text-[16px]')} title={value}>{value}</strong>
        <small className="block truncate text-[9px] text-subtle">{note}</small>
      </div>
    </section>
  )
}

function qualityLabel(quality: AppSnapshot['frameQuality'], messages: TodayMessages): string {
  const labels = {
    good: messages.goodQuality,
    dark: messages.darkQuality,
    occluded: messages.occludedQuality,
    multi_person: messages.multiplePeople,
    unstable: messages.unstableQuality
  }
  return labels[quality]
}

function intervalLabel(seconds: number, language: 'zh-CN' | 'en-US'): string {
  return compactDuration(seconds, language)
}

function reminderSchedulePause(settings: AppSettings, messages: TodayMessages): string | null {
  if (settings.sedentarySeconds <= 30) return null
  const now = new Date()
  if (!settings.weekendEnabled && (now.getDay() === 0 || now.getDay() === 6)) return messages.weekendPaused
  const minute = now.getHours() * 60 + now.getMinutes()
  const parse = (value: string) => {
    const [hour = 0, minutes = 0] = value.split(':').map(Number)
    return hour * 60 + minutes
  }
  const inSpan = (value: number, start: number, end: number) => (start <= end ? value >= start && value <= end : value >= start || value <= end)
  const inWork = inSpan(minute, parse(settings.workdayStart), parse(settings.workdayEnd))
  if (!inWork) return messages.outsideWorkHours
  const quietStart = parse(settings.quietStart)
  const quietEnd = parse(settings.quietEnd)
  if (settings.quietHoursEnabled && quietStart !== quietEnd && inSpan(minute, quietStart, quietEnd)) return `${messages.quietUntil} ${settings.quietEnd} ${messages.resumeReminder}`
  return null
}

function reminderTimingCopy(snapshot: AppSnapshot, schedulePause: string | null, language: 'zh-CN' | 'en-US', messages: TodayMessages): { clock: string; countdown: string; status: string } {
  if (snapshot.lifecycle === 'break') {
    const timeUp = snapshot.breakRemainingSeconds === 0
    return {
      clock: timeUp ? messages.breakComplete : messages.breakActive,
      countdown: timeUp ? messages.awaitCompletion : `${messages.remaining} ${formatDuration(snapshot.breakRemainingSeconds, language)}`,
      status: timeUp ? messages.confirmInIsland : `${messages.breakRemaining} ${formatDuration(snapshot.breakRemainingSeconds, language)}`
    }
  }
  if (schedulePause) return { clock: messages.reminderPlanPaused, countdown: schedulePause, status: schedulePause }
  if (snapshot.lifecycle === 'paused') return { clock: messages.paused, countdown: messages.resumeContinue, status: messages.resumeCounting }
  if (snapshot.currentReminder) {
    return { clock: messages.reminderSent, countdown: messages.handleReminder, status: messages.reminderIssued }
  }
  if (snapshot.nextReminderAt && snapshot.reminderRemainingSeconds !== null) {
    const date = new Date(snapshot.nextReminderAt)
    const time = Number.isNaN(date.getTime()) ? messages.soon : new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date)
    const duration = formatDuration(snapshot.reminderRemainingSeconds, language)
    const countdown = `${messages.remaining} ${duration}`
    const status = snapshot.seatedSeconds < snapshot.settings.sedentarySeconds ? `${messages.beforeFirst} ${duration}` : `${messages.beforeNext} ${duration}`
    return { clock: `${messages.nextReminder} ${time}`, countdown, status }
  }
  if (snapshot.reminderRemainingSeconds !== null && snapshot.monitoringMode === 'camera') {
    const countdown = `${messages.needStableSitting} ${formatDuration(snapshot.reminderRemainingSeconds, language)}`
    return { clock: messages.waitingStableSitting, countdown, status: messages.countAfterStable }
  }
  if (!snapshot.settings.repeatReminders && snapshot.seatedSeconds >= snapshot.settings.sedentarySeconds) {
    return { clock: messages.repeatsDisabled, countdown: messages.recountAfterBreak, status: messages.waitingForBreak }
  }
  return { clock: `${messages.every} ${intervalLabel(snapshot.settings.sedentarySeconds, language)} ${messages.reminderSuffix}`, countdown: messages.calculatingNext, status: messages.calculatingNext }
}
