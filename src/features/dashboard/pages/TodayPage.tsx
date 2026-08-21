import { Activity, BellOff, Camera, CameraOff, ChevronRight, Clock3, Coffee, Gauge, ScanFace, ShieldCheck, SlidersHorizontal, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { PoseCanvas } from '../../../components/PoseCanvas'
import { TodayWeatherHeader } from '../../weather/WeatherOverview'
import { languageOf } from '../../../i18n'
import type { AppSettings, AppSnapshot } from '../../../types'
import { cn, compactDuration, formatDuration, percent } from '../../../utils'
import type { DashboardProps } from '../dashboardTypes'

export function TodayPage({ snapshot, visionStatus, streamUrl, previewError, landmarks, error, onStartBreak, onEndBreak, onPage, onRetryPreview, onEnableCamera }: DashboardProps) {
  const language = languageOf(snapshot.settings.language)
  const thresholdSeconds = snapshot.settings.sedentarySeconds
  const isReminderTest = thresholdSeconds <= 30
  const schedulePause = reminderSchedulePause(snapshot.settings)
  const progress = percent(snapshot.seatedSeconds, thresholdSeconds)
  const reminderTiming = reminderTimingCopy(snapshot, schedulePause)
  const isCamera = snapshot.monitoringMode === 'camera'
  const canEnableCamera = !isCamera && (snapshot.lifecycle === 'monitoring' || snapshot.lifecycle === 'degraded')
  // 追踪应用内预览首帧是否已渲染,确保骨架不会在画面到达前出现。
  const [imgLoaded, setImgLoaded] = useState(false)
  const detectionPanelTitle = snapshot.lifecycle === 'paused' ? '检测已暂停' : snapshot.lifecycle === 'break' ? '休息进行中' : isCamera ? (visionStatus === 'ready' ? (imgLoaded ? '正在实时检测' : '正在连接视频流') : '正在连接检测') : '定时提醒模式'
  const detectionPanelDescription = snapshot.lifecycle === 'paused' ? (isCamera ? '恢复后继续本地姿态识别' : '恢复后继续普通定时提醒') : snapshot.lifecycle === 'break' ? (isCamera ? '结束休息后继续本地姿态识别' : '结束休息后继续普通定时提醒') : isCamera ? qualityLabel(snapshot.frameQuality) : '仅根据启用时间提供久坐提醒'
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
    no_person: { title: '已离座 · 计时已暂停', text: '回来后会继续判断当前会话', tone: 'muted' },
    present: { title: '正在确认姿态', text: '多帧稳定后才会开始累计', tone: 'blue' },
    sitting_normal: { title: '姿态自然', text: '保持现在这样，很不错', tone: 'healthy' },
    head_down: { title: '持续低头中', text: '系统正在累计持续时间', tone: 'warning' },
    standing_break: { title: '你站起来了', text: '保持一会儿即可完成有效休息', tone: 'blue' },
    unknown: { title: '等待稳定画面', text: '低置信度不会触发明确提醒', tone: 'muted' }
  }
  const behavior = snapshot.lifecycle === 'break' ? { title: '休息进行中', text: '倒计时与结束操作已显示在灵动岛', tone: 'blue' } : isCamera ? behaviorCopy[snapshot.behavior] : { title: '定时提醒已开启', text: '达到阈值后会提醒你起身活动', tone: 'healthy' }

  return (
    <div className="today-page-layout relative grid h-full min-h-0 grid-rows-[162px_12px_minmax(0,1fr)_23px_124px] overflow-hidden px-6 pb-14.5 pt-5">
      <header className="grid min-h-0 grid-cols-1 gap-5 min-[1180px]:grid-cols-[minmax(340px,1fr)_minmax(430px,514px)]">
        <div className="min-w-0 self-start pt-3">
          <span className="text-[11px] font-extrabold tracking-[.14em] text-accent">今天 · {new Intl.DateTimeFormat(language, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())}</span>
          <h1 className="mt-5 text-[32px] font-black leading-none tracking-[-.04em]">照顾好当下的姿势</h1>
          <p className="mt-5 text-[13px] text-muted">保持专注即可，健康提醒只在需要时出现。</p>
        </div>
        <div className="hidden h-full min-w-0 items-center justify-end gap-4 min-[1180px]:flex">
          <div className="w-55 shrink-0 translate-y-1.5 empty:hidden">
            <TodayWeatherHeader language={language} />
          </div>
          <button className="inline-flex h-11 w-42 shrink-0 translate-y-4 items-center justify-center gap-2 rounded-full bg-accent-soft px-5 text-[12px] font-bold text-foreground transition-colors hover:bg-accent-soft-strong" onClick={snapshot.lifecycle === 'break' ? onEndBreak : onStartBreak}>
            <Coffee size={17} /> {snapshot.lifecycle === 'break' ? '结束休息' : '主动休息'} <ChevronRight size={15} />
          </button>
        </div>
      </header>

      {snapshot.lifecycle !== 'paused' && (error || (isCamera && visionStatus === 'error')) && (
        <div className="absolute inset-x-6 top-35 z-20 flex items-center gap-3 rounded-xl border border-warning/35 bg-warning-soft px-4 py-2 text-xs text-warning-foreground shadow-control">
          <CameraOff size={18} />
          <div className="min-w-0 flex-1">
            <strong className="block">摄像头检测暂不可用，已保留普通定时提醒</strong>
            <span className="block truncate text-[9px]">{error ?? '请检查系统摄像头权限或设备占用情况。'}</span>
          </div>
          <button className="font-bold underline" onClick={() => onPage('settings')}>
            检查设置
          </button>
        </div>
      )}

      <div className="row-start-3 grid min-h-0 gap-4 min-[1180px]:grid-cols-[minmax(0,1fr)_343px]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-card border border-edge bg-panel shadow-panel">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-edge px-5">
            <span className="flex items-center gap-2 text-xs font-extrabold">
              <Activity size={17} /> 当前会话
            </span>
            <small className="text-[9px] text-muted">{isReminderTest ? `${thresholdSeconds} 秒测试` : (schedulePause ?? (isCamera ? '摄像头低功耗检测' : '普通定时模式'))}</small>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(230px,.82fr)_minmax(260px,1.18fr)] items-center gap-7 px-6 py-4">
            <div className="mx-auto grid aspect-square w-[min(28vh,220px)] min-w-45.5 -translate-y-1 place-items-center rounded-full bg-[conic-gradient(var(--theme-accent)_var(--session-progress),var(--theme-edge)_0)] p-2" style={{ '--session-progress': `${progress * 3.6}deg` } as CSSProperties}>
              <div className="grid size-full place-content-center rounded-full bg-panel text-center shadow-inner">
                <span className="text-[11px] text-muted">连续坐姿</span>
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
              <span className="mt-2 block text-[11px] font-extrabold tracking-[.14em] text-accent">当前姿态</span>
              <h2 className="mt-4 truncate text-[30px] font-black leading-tight tracking-[-.04em]">{behavior.title}</h2>
              <p className="mt-2 truncate text-[11px] text-muted">{behavior.text}</p>
              {isCamera && (
                <div className="mt-7 grid grid-cols-[auto_1fr_auto] items-center gap-3 text-[10px] text-muted">
                  <span>头肩稳定度</span>
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
              <ShieldCheck size={14} /> {isCamera ? '多帧确认 · 画面仅在本机处理' : '普通定时提醒'}
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
              <Camera size={17} /> 检测状态
            </span>
            <span className={cn('rounded-full px-3 py-1 text-[9px] font-bold', snapshot.lifecycle === 'paused' ? 'bg-warning-soft text-warning' : !isCamera || snapshot.frameQuality === 'good' ? 'bg-accent-soft text-accent' : 'bg-warning-soft text-warning')}>{snapshot.lifecycle === 'paused' ? '静默中' : !isCamera ? '定时中' : snapshot.frameQuality === 'good' ? '检测中' : '待确认'}</span>
          </div>
          <div className="relative mx-4 min-h-0 overflow-hidden rounded-xl bg-[linear-gradient(135deg,var(--theme-panel-strong),var(--theme-accent-strong))]">
            {isCamera && streamUrl ? (
              <>
                <img src={streamUrl} className="absolute inset-0 size-full object-cover" alt="摄像头实时预览" onLoad={() => setImgLoaded(true)} onError={() => setImgLoaded(false)} />
                {imgLoaded && <PoseCanvas landmarks={landmarks} />}
              </>
            ) : (
              <div className="grid size-full -translate-y-2 place-content-center justify-items-center gap-2 text-muted">
                <ScanFace size={82} strokeWidth={1.15} />
                {canEnableCamera && (
                  <button type="button" className="relative z-20 min-h-9 rounded-lg border border-inverse/20 bg-panel-strong/45 px-4 py-2 text-[10px] font-bold text-inverse shadow-control hover:bg-panel-strong/65" onClick={onEnableCamera}>
                    开启姿势检测
                  </button>
                )}
              </div>
            )}
            {isCamera && isVisionLoading && (
              <div className="absolute inset-0 grid place-content-center justify-items-center gap-2 bg-panel-strong/90 text-inverse-muted">
                <Camera size={22} />
                <span className="text-[9px]">{visionStatus === 'requesting' ? '正在请求摄像头权限…' : '正在加载姿态模型…'}</span>
              </div>
            )}
            {isStreamConnecting && (
              <div className="absolute inset-0 grid place-content-center justify-items-center gap-2 bg-panel-strong/90 px-5 text-center text-inverse-muted">
                <Camera size={22} />
                <span className="text-[9px]">{previewError ?? '正在连接视频流…'}</span>
                {previewError && (
                  <button className="mt-1 rounded-lg border border-inverse/20 px-3 py-1.5 text-[9px] font-bold text-inverse hover:bg-inverse/10" onClick={onRetryPreview}>
                    重试预览
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
              <strong className="block text-[10px]">隐私与设备</strong>
              <small className="mt-1 block truncate text-[9px] text-muted">画面仅在本机处理，不保存，不上传</small>
            </span>
            <ChevronRight size={16} className="text-muted" />
          </button>
          <button className="mx-4 grid min-w-0 grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2 border-t border-edge text-left hover:bg-panel-muted" onClick={() => onPage('settings')}>
            <span className="grid size-9 place-items-center rounded-xl bg-neutral-soft text-muted">
              <SlidersHorizontal size={18} />
            </span>
            <span className="min-w-0">
              <strong className="block text-[10px]">检测设置</strong>
              <small className="mt-1 block truncate text-[9px] text-muted">调整摄像头与识别选项</small>
            </span>
            <ChevronRight size={16} className="text-muted" />
          </button>
        </section>
      </div>

      <div className={cn('row-start-5 grid min-h-0 gap-3', isCamera ? 'grid-cols-4 min-[1180px]:grid-cols-5' : 'grid-cols-4')}>
        <MetricCard icon={Clock3} label="今日坐姿" value={compactDuration(snapshot.today.seatedSeconds, language)} note={`最长连续 ${compactDuration(snapshot.today.longestSeatedSeconds, language)}`} tone="sage" language={language} />
        <MetricCard icon={Gauge} label="累计低头" value={compactDuration(snapshot.today.headDownSeconds, language)} note={`${snapshot.today.reminderCount} 次温和提醒`} tone="sand" language={language} />
        <MetricCard icon={Coffee} label="完成休息" value={`${snapshot.today.breakCount} 次`} note={snapshot.today.breakCount ? '正在形成好习惯' : '主动休息也会被记录'} tone="blue" language={language} />
        <MetricCard icon={BellOff} label="忽略提醒" value={`${snapshot.today.dismissedCount} 次`} note="我们会控制提醒频率" tone="rose" language={language} />
        {isCamera ? (
          <div className="hidden min-[1180px]:contents">
            <MetricCard icon={Activity} label="离座活动" value={compactDuration(snapshot.today.awaySeconds, language)} note={snapshot.today.awaySeconds > 0 ? '短暂离开也被记录' : '起身接水也算活动'} tone="sage" language={language} />
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

function qualityLabel(quality: AppSnapshot['frameQuality']): string {
  const labels = {
    good: '光线与取景适合识别',
    dark: '当前光线较暗，明确判断已暂停',
    occluded: '头部暂时被遮挡，请让鼻尖、双眼和双耳尽量清晰可见',
    multi_person: '画面中有多人，明确判断已暂停',
    unstable: '正在等待稳定的多帧结果'
  }
  return labels[quality]
}

function intervalLabel(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`
  const minutes = seconds / 60
  return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} 分钟`
}

function reminderSchedulePause(settings: AppSettings): string | null {
  if (settings.sedentarySeconds <= 30) return null
  const now = new Date()
  if (!settings.weekendEnabled && (now.getDay() === 0 || now.getDay() === 6)) return '周末暂停提醒'
  const minute = now.getHours() * 60 + now.getMinutes()
  const parse = (value: string) => {
    const [hour = 0, minutes = 0] = value.split(':').map(Number)
    return hour * 60 + minutes
  }
  const inSpan = (value: number, start: number, end: number) => (start <= end ? value >= start && value <= end : value >= start || value <= end)
  const inWork = inSpan(minute, parse(settings.workdayStart), parse(settings.workdayEnd))
  if (!inWork) return '当前不在工作提醒时段'
  const quietStart = parse(settings.quietStart)
  const quietEnd = parse(settings.quietEnd)
  if (settings.quietHoursEnabled && quietStart !== quietEnd && inSpan(minute, quietStart, quietEnd)) return `静默中 · ${settings.quietEnd} 恢复提醒`
  return null
}

function reminderTimingCopy(snapshot: AppSnapshot, schedulePause: string | null): { clock: string; countdown: string; status: string } {
  if (snapshot.lifecycle === 'break') {
    const timeUp = snapshot.breakRemainingSeconds === 0
    return {
      clock: timeUp ? '休息时间到' : '休息进行中',
      countdown: timeUp ? '等待确认完成' : `剩余 ${formatDuration(snapshot.breakRemainingSeconds)}`,
      status: timeUp ? '请在灵动岛确认完成' : `休息剩余 ${formatDuration(snapshot.breakRemainingSeconds)}`
    }
  }
  if (schedulePause) return { clock: '提醒计划已暂停', countdown: schedulePause, status: schedulePause }
  if (snapshot.lifecycle === 'paused') return { clock: '检测已暂停', countdown: '恢复后继续', status: '恢复检测后继续累计' }
  if (snapshot.currentReminder) {
    return { clock: '本次提醒已发出', countdown: '请处理当前提醒', status: '提醒已发出' }
  }
  if (snapshot.nextReminderAt && snapshot.reminderRemainingSeconds !== null) {
    const date = new Date(snapshot.nextReminderAt)
    const time = Number.isNaN(date.getTime()) ? '即将提醒' : new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date)
    const countdown = `剩余 ${formatDuration(snapshot.reminderRemainingSeconds)}`
    const status = snapshot.seatedSeconds < snapshot.settings.sedentarySeconds ? `距离首次提醒还有 ${formatDuration(snapshot.reminderRemainingSeconds)}` : `距离下次提醒还有 ${formatDuration(snapshot.reminderRemainingSeconds)}`
    return { clock: `下次提醒 ${time}`, countdown, status }
  }
  if (snapshot.reminderRemainingSeconds !== null && snapshot.monitoringMode === 'camera') {
    const countdown = `还需稳定坐姿 ${formatDuration(snapshot.reminderRemainingSeconds)}`
    return { clock: '等待稳定坐姿', countdown, status: '识别稳定后开始计时' }
  }
  if (!snapshot.settings.repeatReminders && snapshot.seatedSeconds >= snapshot.settings.sedentarySeconds) {
    return { clock: '重复提醒已关闭', countdown: '休息后重新计时', status: '等待你开始休息' }
  }
  return { clock: `每 ${intervalLabel(snapshot.settings.sedentarySeconds)}提醒`, countdown: '正在计算下一次提醒', status: '正在计算下一次提醒' }
}
