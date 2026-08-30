import { Activity, BadgeCheck, BellOff, BicepsFlexed, Camera, ChevronRight, CirclePause, CirclePlus, Clock3, Coffee, Gauge, Leaf, ScanFace, ShieldCheck, SlidersHorizontal, Target, ThumbsUp, TriangleAlert, UserRound, UserRoundX } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { MetricCard } from '../../../components/MetricCard'
import { PoseCanvas } from '../../../components/PoseCanvas'
import { SectionHeader } from '../../../components/SectionHeader'
import { SessionProgressRing } from '../../../components/SessionProgressRing'
import { languageOf } from '../../../i18n'
import { defineMessages, localizeMessages, messageText } from '../../../runtimeI18n'
import type { AppSnapshot } from '../../../types'
import { cn, compactDuration, percent } from '../../../utils'
import { TodayWeatherHeader } from '../../weather/WeatherOverview'
import type { DashboardProps } from '../dashboardTypes'
import { resolvePosturePresentationState, type PosturePresentationState } from '../posturePresentation'
import { buildHealthAdvice, buildSedentarySessionPresentation, buildTodayMetricInsights, formatReminderSchedule, formatRestCadence, reminderFollowupCount, type InsightIcon, type InsightTone } from '../todayInsights'

const todayMessages = defineMessages({
  today: { zh: '今天', en: 'Today' },
  title: { zh: '照顾好当下的姿势', en: 'Take care of your posture' },
  subtitle: { zh: '每一次挺直，都是对未来的温柔。', en: 'Every upright moment is a kindness to your future self.' },
  startBreak: { zh: '开始休息', en: 'Start break' },
  endBreak: { zh: '结束休息', en: 'End break' },
  currentSession: { zh: '当前会话', en: 'Current session' },
  continuousSitting: { zh: '连续坐姿', en: 'Continuous sitting' },
  currentPosture: { zh: '当前姿态', en: 'Current posture' },
  stability: { zh: '头前倾定度', en: 'Forward-head stability' },
  healthAdvice: { zh: '健康建议', en: 'Health suggestion' },
  detectionStatus: { zh: '实时检测状态', en: 'Live detection status' },
  detecting: { zh: '检测中', en: 'Detecting' },
  paused: { zh: '已暂停', en: 'Paused' },
  timing: { zh: '定时中', en: 'Timer' },
  preview: { zh: '摄像头画面预览', en: 'Camera preview' },
  previewHint: { zh: '请保持面部在画面中央', en: 'Keep your face centered in the frame' },
  enablePosture: { zh: '开启姿势检测', en: 'Enable posture detection' },
  connecting: { zh: '正在连接视频流…', en: 'Connecting to camera preview…' },
  retry: { zh: '重试预览', en: 'Retry preview' },
  privacy: { zh: '隐私与遮罩', en: 'Privacy and masking' },
  privacyNote: { zh: '摄像头已授权 · 不保存 · 本地处理', en: 'Camera authorized · not saved · processed locally' },
  detectionSettings: { zh: '检测设置', en: 'Detection settings' },
  detectionSettingsNote: { zh: '姿态识别 · 久坐提醒 · 灵敏度', en: 'Posture detection · sitting reminders · sensitivity' },
  sittingToday: { zh: '今日坐姿', en: 'Sitting today' },
  cumulativeHeadDown: { zh: '累计低头', en: 'Head-down time' },
  completedBreaks: { zh: '完成休息', en: 'Completed breaks' },
  reminderFollowups: { zh: '未及时休息', en: 'Deferred reminders' },
  awayActivity: { zh: '累计活动', en: 'Total activity' },
  getMoving: { zh: '起来动一动吧！', en: 'Get up and move!' },
  naturalPosture: { zh: '姿态自然', en: 'Natural posture' },
  postureGood: { zh: '姿态良好', en: 'Good posture' },
  headDown: { zh: '低头过度', en: 'Excessive head-down posture' },
  standing: { zh: '已离座', en: 'Away from seat' },
  confirming: { zh: '确认姿态中', en: 'Confirming posture' },
  postureEncouragement: { zh: '保持得不错，继续加油', en: 'Looking good. Keep it up.' },
  posturePaused: { zh: '检测已暂停', en: 'Monitoring paused' },
  posturePausedNote: { zh: '恢复检测后继续识别', en: 'Posture detection continues after monitoring resumes.' },
  postureUnrecognized: { zh: '暂未识别', en: 'Not recognized yet' },
  postureUnrecognizedNote: { zh: '请保持头部清晰并正对屏幕', en: 'Keep your head clearly visible and face the screen.' },
  postureLowConfidence: { zh: '识别度较低', en: 'Low recognition confidence' },
  postureLowConfidenceNote: { zh: '请改善光线并保持头肩完整入镜', en: 'Improve the lighting and keep your head and shoulders fully in frame.' },
  frameQualityInsufficient: { zh: '画面质量不足', en: 'Image quality needs attention' },
  frameDarkNote: { zh: '当前光线不足，请适当补光', en: 'The scene is too dark. Add some light.' },
  frameOccludedNote: { zh: '画面有遮挡，请保持头肩完整入镜', en: 'The view is obstructed. Keep your head and shoulders fully in frame.' },
  frameMultiPersonNote: { zh: '画面中有多人，请仅保留当前使用者', en: 'Multiple people are visible. Keep only the current user in frame.' },
  frameUnstableNote: { zh: '画面不稳定，请保持设备与坐姿稳定', en: 'The image is unstable. Keep the device and your posture steady.' },
  noPerson: { zh: '未检测到人', en: 'No person detected' },
  unrecognized: { zh: '未识别', en: 'Not recognized' },
  identifying: { zh: '识别中', en: 'Recognizing' },
  needsAdjustment: { zh: '需调整', en: 'Needs adjustment' },
  frameDark: { zh: '光线不足', en: 'Low light' },
  frameOccluded: { zh: '画面遮挡', en: 'View obstructed' },
  frameMultiPerson: { zh: '多人入镜', en: 'Multiple people detected' },
  frameUnstable: { zh: '画面不稳定', en: 'Unstable image' },
  timerMode: { zh: '定时提醒已开启', en: 'Timer reminders are active' },
  timerModeNote: { zh: '达到阈值后会提醒你起身活动', en: 'You will be reminded when the threshold is reached' },
  breakActive: { zh: '休息进行中', en: 'Break in progress' },
  breakNote: { zh: '休息满 1 分钟后才会计入完成休息', en: 'Breaks count after at least 1 minute.' },
  minute: { zh: '分钟', en: 'minutes' },
  times: { zh: '次', en: 'times' },
  liftGaze: { zh: '抬起视线，轻轻放松颈部', en: 'Lift your gaze and gently relax your neck.' },
  recommended: { zh: '建议', en: 'Recommended' },
  rest: { zh: '休息', en: 'Break' },
  stable: { zh: '稳定', en: 'Stable' },
  notApplicable: { zh: '不适用', en: 'Not applicable' },
  timerNoPose: { zh: '定时模式无需姿态判断', en: 'Posture confidence is not used in timer mode' }
})

export function shouldShowPreviewCaption(lifecycle: AppSnapshot['lifecycle'], isCamera: boolean): boolean {
  return !(isCamera && lifecycle === 'monitoring')
}

export function shouldShowPreviewPlaceholder(lifecycle: AppSnapshot['lifecycle'], isCamera: boolean): boolean {
  return shouldShowPreviewCaption(lifecycle, isCamera)
}

export function TodayPage({ snapshot, visionStatus, streamUrl, previewError, landmarks, error, onStartBreak, onEndBreak, onPage, onRetryPreview, onEnableCamera }: DashboardProps) {
  const language = languageOf(snapshot.settings.language)
  const messages = localizeMessages(todayMessages, language)
  const isCamera = snapshot.monitoringMode === 'camera'
  const showPreviewCaption = shouldShowPreviewCaption(snapshot.lifecycle, isCamera)
  const showPreviewPlaceholder = shouldShowPreviewPlaceholder(snapshot.lifecycle, isCamera)
  const cameraRunning = isCamera && !showPreviewPlaceholder
  const detectionStatusLabel = snapshot.lifecycle === 'break' ? messages.breakActive : snapshot.lifecycle === 'paused' ? messages.paused : isCamera ? messages.detecting : messages.timing
  const [imgLoaded, setImgLoaded] = useState(false)
  const streamSession = streamUrl?.startsWith('data:image/') ? 'event-preview' : (streamUrl?.split('?', 1)[0] ?? null)
  useEffect(() => setImgLoaded(false), [streamSession])

  const postureState = resolvePosturePresentationState(snapshot)
  const posturePresentation: Record<PosturePresentationState, { title: string; description: string; icon: LucideIcon; iconClassName: string; status: string; statusClassName: string; barClassName: string }> = {
    timer: { title: messages.timerMode, description: messages.timerModeNote, icon: Clock3, iconClassName: 'text-accent', status: messages.timerNoPose, statusClassName: 'text-muted', barClassName: 'bg-muted' },
    paused: { title: messages.posturePaused, description: messages.posturePausedNote, icon: CirclePause, iconClassName: 'text-muted', status: messages.paused, statusClassName: 'text-muted', barClassName: 'bg-muted' },
    break: { title: messages.breakActive, description: messages.breakNote, icon: Coffee, iconClassName: 'text-info', status: messages.breakActive, statusClassName: 'text-info', barClassName: 'bg-info' },
    'not-ready': { title: messages.confirming, description: messages.postureUnrecognizedNote, icon: ScanFace, iconClassName: 'text-muted', status: messages.unrecognized, statusClassName: 'text-muted', barClassName: 'bg-muted' },
    'no-person': { title: messages.noPerson, description: messages.getMoving, icon: UserRoundX, iconClassName: 'text-muted', status: messages.noPerson, statusClassName: 'text-muted', barClassName: 'bg-muted' },
    'frame-dark': { title: messages.frameQualityInsufficient, description: messages.frameDarkNote, icon: TriangleAlert, iconClassName: 'text-warning', status: messages.frameDark, statusClassName: 'text-warning', barClassName: 'bg-warning' },
    'frame-occluded': { title: messages.frameQualityInsufficient, description: messages.frameOccludedNote, icon: TriangleAlert, iconClassName: 'text-warning', status: messages.frameOccluded, statusClassName: 'text-warning', barClassName: 'bg-warning' },
    'frame-multi-person': { title: messages.frameQualityInsufficient, description: messages.frameMultiPersonNote, icon: TriangleAlert, iconClassName: 'text-warning', status: messages.frameMultiPerson, statusClassName: 'text-warning', barClassName: 'bg-warning' },
    'frame-unstable': { title: messages.frameQualityInsufficient, description: messages.frameUnstableNote, icon: TriangleAlert, iconClassName: 'text-warning', status: messages.frameUnstable, statusClassName: 'text-warning', barClassName: 'bg-warning' },
    unrecognized: { title: messages.postureUnrecognized, description: messages.postureUnrecognizedNote, icon: ScanFace, iconClassName: 'text-muted', status: messages.unrecognized, statusClassName: 'text-muted', barClassName: 'bg-muted' },
    'low-confidence': { title: messages.postureLowConfidence, description: messages.postureLowConfidenceNote, icon: TriangleAlert, iconClassName: 'text-warning', status: messages.postureLowConfidence, statusClassName: 'text-warning', barClassName: 'bg-warning' },
    confirming: { title: messages.confirming, description: messages.postureUnrecognizedNote, icon: ScanFace, iconClassName: 'text-info', status: messages.identifying, statusClassName: 'text-info', barClassName: 'bg-info' },
    stable: { title: messages.naturalPosture, description: messages.postureEncouragement, icon: BicepsFlexed, iconClassName: 'text-warning', status: messages.stable, statusClassName: 'text-accent', barClassName: 'bg-accent' },
    'head-down': { title: messages.headDown, description: messages.liftGaze, icon: Gauge, iconClassName: 'text-warning', status: messages.needsAdjustment, statusClassName: 'text-warning', barClassName: 'bg-warning' },
    standing: { title: messages.standing, description: messages.getMoving, icon: Activity, iconClassName: 'text-accent', status: messages.standing, statusClassName: 'text-accent', barClassName: 'bg-accent' }
  }
  const behavior = posturePresentation[postureState]
  const BehaviorFeedbackIcon = behavior.icon
  const metricInsights = buildTodayMetricInsights(snapshot.today, snapshot.settings.sedentarySeconds, language)
  const followupCount = reminderFollowupCount(snapshot.today)
  const insightIcons: Record<InsightIcon, LucideIcon> = { activity: Activity, alert: TriangleAlert, check: BadgeCheck, clock: Clock3, target: Target, 'thumbs-up': ThumbsUp }
  const insightToneClasses: Record<InsightTone, string> = { danger: 'text-danger', muted: 'text-muted', positive: 'text-accent', warning: 'text-warning' }
  const reminderSchedule = formatReminderSchedule(snapshot, language)
  const healthAdvice = buildHealthAdvice(snapshot, snapshot.settings.sedentarySeconds, language)
  const sessionPresentation = buildSedentarySessionPresentation(snapshot, snapshot.settings.sedentarySeconds, language)
  const progress = percent(snapshot.seatedSeconds, snapshot.settings.sedentarySeconds)
  const confidence = Math.round(snapshot.postureConfidence * 100)
  const canEnableCamera = !isCamera && (snapshot.lifecycle === 'monitoring' || snapshot.lifecycle === 'degraded')
  const sessionClock = `${Math.floor(snapshot.seatedSeconds / 60)}:${String(Math.floor(snapshot.seatedSeconds % 60)).padStart(2, '0')}`

  return (
    <div className="today-page-layout themed-scrollbar mx-auto grid h-full min-h-0 w-full max-w-337 grid-rows-[141px_minmax(0,493px)_166px] content-start gap-4 overflow-hidden px-6 pb-9 pt-8">
      <SectionHeader
        className="today-page-header [&_h1]:mt-7 [&_h1]:text-[32px] [&_p]:mt-5"
        eyebrow={`${messages.today} · ${new Intl.DateTimeFormat(language, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())}`}
        title={messages.title}
        subtitle={messages.subtitle}
        actions={
          <div className="today-page-actions flex items-center gap-5 pt-9">
            <div className="today-weather-summary hidden w-62.5 xl:block">
              <TodayWeatherHeader language={language} />
            </div>
            <div className="text-center">
              <button className="today-break-button inline-flex h-15 min-w-52.5 items-center justify-center gap-2 rounded-full bg-accent px-7 text-[14px] font-bold text-inverse shadow-control transition hover:bg-accent-strong" onClick={snapshot.lifecycle === 'break' ? onEndBreak : onStartBreak}>
                <Coffee size={18} /> {snapshot.lifecycle === 'break' ? messages.endBreak : messages.startBreak}
              </button>
              <small className="mt-2 block text-[9px] text-muted">{formatRestCadence(snapshot.settings.sedentarySeconds, language)}</small>
            </div>
          </div>
        }
      />

      {error ? <div className="absolute left-66 right-6 top-28 z-30 rounded-[12px] border border-warning/25 bg-warning-soft px-4 py-2 text-[10px] text-warning-foreground">{error}</div> : null}

      <div className="today-primary-grid grid min-h-0 gap-5 min-[1120px]:grid-cols-[minmax(0,1.35fr)_minmax(320px,.85fr)]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-[16px] border border-edge bg-panel shadow-panel">
          <header className="today-session-header flex h-15 min-w-0 shrink-0 items-center border-b border-edge-soft px-5 text-[12px] font-bold">
            <span className="flex shrink-0 items-center">
              <Activity size={17} className="mr-2" />
              {messages.currentSession}
            </span>
            <span className="ml-auto flex min-w-0 items-center gap-1.5 pl-4 text-[10px] font-semibold text-accent" title={reminderSchedule}>
              <Clock3 className="shrink-0" size={13} />
              <span className="truncate">{reminderSchedule}</span>
            </span>
          </header>
          <div className="today-session-body grid min-h-0 flex-1 grid-cols-[minmax(226px,.95fr)_minmax(210px,1.05fr)] items-center gap-5 px-5 py-3" data-posture-state={postureState}>
            <SessionProgressRing progress={progress} label={messages.continuousSitting} value={sessionClock} recommendation={`${messages.recommended} ${Math.round(snapshot.settings.sedentarySeconds / 60)} ${messages.minute}${messages.rest}`} status={sessionPresentation.status} detail={sessionPresentation.detail} tone={sessionPresentation.tone} />
            <div className="min-w-0 border-edge-soft py-1 pl-5">
              <div className="flex items-center gap-3">
                <span className="today-posture-icon grid size-13 place-items-center rounded-[14px] bg-accent-soft text-accent">
                  <UserRound size={28} />
                </span>
                <div className="min-w-0">
                  <span className="block text-[12px] font-semibold text-accent">{messages.currentPosture}</span>
                  <h2 className="today-posture-title mt-1 truncate text-[clamp(27px,3.25vh,32px)] font-black tracking-[-.04em]">{behavior.title}</h2>
                </div>
              </div>
              <p className="mt-4 flex items-center gap-2 text-[12px] font-medium">
                {behavior.description}
                <BehaviorFeedbackIcon className={behavior.iconClassName} size={16} strokeWidth={2} />
              </p>
              <div className="mt-5 border-t border-edge-soft pt-4">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-2 text-muted">
                    {messages.stability}
                    <CirclePlus aria-label={messages.stability} size={13} strokeWidth={1.8} />
                  </span>
                  <strong className="text-[12px]">{isCamera ? `${confidence}%` : messages.notApplicable}</strong>
                </div>
                <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-edge-soft">
                  <i className={cn('block h-full rounded-full transition-[width,background-color]', behavior.barClassName)} style={{ width: `${isCamera ? confidence : 0}%` }} />
                </div>
                <small className={cn('mt-2 block text-[10px] font-medium', behavior.statusClassName)} data-confidence-state={postureState}>{behavior.status}</small>
              </div>
            </div>
          </div>
          <div className="today-advice-card mx-5 mb-5.25 flex h-18.75 shrink-0 items-center gap-3 rounded-[14px] bg-panel-muted px-4" role="status">
            <span className="grid size-9 place-items-center rounded-[11px] bg-accent text-inverse shadow-control">
              <Leaf size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block text-[11px] text-accent">{messages.healthAdvice}</strong>
              <small className="mt-1 line-clamp-2 block text-[10px] leading-4 text-muted">{healthAdvice}</small>
            </span>
          </div>
        </section>

        <section className="today-detection-card grid min-h-0 grid-rows-[60px_minmax(0,1fr)_auto] overflow-hidden rounded-[16px] border border-edge bg-panel shadow-panel">
          <header className="flex items-center justify-between px-5 text-[12px] font-bold">
            <span className="flex items-center gap-2">
              <Camera size={17} />
              {messages.detectionStatus}
            </span>
            <span className="rounded-full bg-accent-soft px-3 py-1 text-[9px] text-accent">● {detectionStatusLabel}</span>
          </header>
          <div className="relative mx-4 min-h-0 overflow-hidden rounded-[14px]" style={{ background: 'radial-gradient(circle at 72% 20%, #285A3E 0%, #214B35 34%, #183C2B 66%, #123125 100%)' }}>
            {cameraRunning && streamUrl ? (
              <>
                <img src={streamUrl} className="absolute inset-0 size-full object-cover" alt={messages.preview} onLoad={() => setImgLoaded(true)} onError={() => setImgLoaded(false)} />
                {imgLoaded ? <PoseCanvas landmarks={landmarks} /> : null}
              </>
            ) : null}
            {showPreviewPlaceholder ? (
              <div className="absolute inset-x-0 bottom-9.5 top-0 grid place-items-center text-inverse/45">
                <ScanFace className="today-preview-face" size={100} strokeWidth={1.25} />
                {canEnableCamera ? (
                  <button className="absolute bottom-12 rounded-[10px] border border-inverse/20 bg-panel-strong/40 px-4 py-2 text-[10px] font-bold text-inverse" onClick={onEnableCamera}>
                    {messages.enablePosture}
                  </button>
                ) : null}
              </div>
            ) : null}
            {cameraRunning && (!streamUrl || visionStatus !== 'ready' || !imgLoaded) ? (
              <div className="absolute inset-0 grid place-content-center justify-items-center gap-2 bg-panel-strong/90 text-[10px] text-inverse-muted">
                <Camera size={21} />
                <span>{previewError ? messageText(previewError, language) : messages.connecting}</span>
                {previewError ? (
                  <button className="rounded-[8px] border border-inverse/20 px-3 py-1.5" onClick={onRetryPreview}>
                    {messages.retry}
                  </button>
                ) : null}
              </div>
            ) : null}
            {showPreviewCaption ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 grid h-18 place-content-center bg-transparent px-4 text-center text-inverse">
                <strong className="block text-[12px]">{messages.preview}</strong>
                <small className="mt-1.5 block text-[10px] text-inverse/75">{messages.previewHint}</small>
              </div>
            ) : null}
          </div>
          <div className="today-detection-actions mx-4 grid gap-3 pb-5 pt-3.25">
            <button className="today-detection-entry grid h-16 grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 rounded-[14px] border border-edge bg-panel px-2.5 text-left transition hover:bg-panel-muted" onClick={() => onPage('privacy')}>
              <span className="grid size-10 place-items-center rounded-[11px] bg-accent-soft text-accent">
                <ShieldCheck size={20} />
              </span>
              <span className="min-w-0">
                <strong className="block text-[11px]">{messages.privacy}</strong>
                <small className="mt-1 block truncate text-[10px] text-muted">{messages.privacyNote}</small>
              </span>
              <ChevronRight size={17} className="text-muted" />
            </button>
            <button className="today-detection-entry grid h-16 grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 rounded-[14px] border border-edge bg-panel px-2.5 text-left transition hover:bg-panel-muted" onClick={() => onPage('settings')}>
              <span className="grid size-10 place-items-center rounded-[11px] bg-neutral-soft text-muted">
                <SlidersHorizontal size={20} />
              </span>
              <span className="min-w-0">
                <strong className="block text-[11px]">{messages.detectionSettings}</strong>
                <small className="mt-1 block truncate text-[10px] text-muted">{messages.detectionSettingsNote}</small>
              </span>
              <ChevronRight size={17} className="text-muted" />
            </button>
          </div>
        </section>
      </div>

      <div className="today-metrics-grid mt-5.25 grid min-h-0 grid-cols-5 gap-3">
        <MetricCard
          icon={Clock3}
          label={messages.sittingToday}
          value={compactDuration(snapshot.today.seatedSeconds, language)}
          note={metricInsights.sitting.note}
          noteIcon={insightIcons[metricInsights.sitting.icon]}
          noteIconClassName={insightToneClasses[metricInsights.sitting.tone]}
          tone="green"
          language={language}
          progress={percent(snapshot.today.seatedSeconds, snapshot.settings.sedentarySeconds)}
        />
        <MetricCard icon={Gauge} label={messages.cumulativeHeadDown} value={compactDuration(snapshot.today.headDownSeconds, language)} note={metricInsights.headDown.note} noteIcon={insightIcons[metricInsights.headDown.icon]} noteIconClassName={insightToneClasses[metricInsights.headDown.tone]} tone="amber" language={language} />
        <MetricCard icon={Coffee} label={messages.completedBreaks} value={`${snapshot.today.breakCount} ${messages.times}`} note={metricInsights.breaks.note} noteIcon={insightIcons[metricInsights.breaks.icon]} noteIconClassName={insightToneClasses[metricInsights.breaks.tone]} tone="blue" language={language} />
        <MetricCard icon={BellOff} label={messages.reminderFollowups} value={`${followupCount} ${messages.times}`} note={metricInsights.reminderFollowups.note} noteIcon={insightIcons[metricInsights.reminderFollowups.icon]} noteIconClassName={insightToneClasses[metricInsights.reminderFollowups.tone]} tone="rose" language={language} />
        <MetricCard icon={Activity} label={messages.awayActivity} value={compactDuration(snapshot.today.awaySeconds, language)} note={metricInsights.activity.note} noteIcon={insightIcons[metricInsights.activity.icon]} noteIconClassName={insightToneClasses[metricInsights.activity.tone]} tone="green" language={language} />
      </div>
    </div>
  )
}
