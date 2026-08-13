import {
  Activity,
  BarChart3,
  BellOff,
  CalendarClock,
  Camera,
  CameraOff,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CloudSun,
  Clock3,
  Coffee,
  Download,
  Eye,
  Gauge,
  HeartPulse,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  ScanFace,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Brand } from "../../components/Brand";
import { PoseCanvas } from "../../components/PoseCanvas";
import { SelectField } from "../../components/SelectField";
import { StatusPill } from "../../components/StatusPill";
import { WeatherPage } from "../weather/WeatherPage";
import { TodayWeatherHeader } from "../weather/WeatherOverview";
import { copy, languageOf } from "../../i18n";
import type { AppUpdater } from "../updates/UpdatePanel";
import packageJson from "../../../package.json";
import type { AppPage, AppSettings, AppSnapshot, BehaviorHistoryEvent, DailyStatistics, LandmarkPoint } from "../../types";
import type { VisionStatus } from "../../vision/useVisionMonitor";
import { cn, compactDuration, formatDuration, percent } from "../../utils";

interface DashboardProps {
  snapshot: AppSnapshot;
  page: AppPage;
  statistics: DailyStatistics[];
  behaviorHistory: BehaviorHistoryEvent[];
  visionStatus: VisionStatus;
  streamUrl: string | null;
  previewError: string | null;
  landmarks: LandmarkPoint[];
  error: string | null;
  onPage: (page: AppPage) => void;
  onPause: (minutes: number | null) => void;
  onResume: () => void;
  onStartBreak: () => void;
  onEndBreak: () => void;
  onSaveSettings: (settings: AppSettings) => Promise<boolean>;
  onExport: () => void;
  onDeleteData: () => void;
  onEnableCamera: () => void;
  onRecalibrate: () => void;
  onRetryPreview: () => void;
  onHelp: () => void;
  updater: AppUpdater;
}

const navItems: Array<{ page: AppPage; label: string; icon: typeof LayoutDashboard }> = [
  { page: "today", label: "今日概览", icon: LayoutDashboard },
  { page: "statistics", label: "习惯趋势", icon: BarChart3 },
  { page: "weather", label: "天气与活动", icon: CloudSun },
  { page: "settings", label: "偏好设置", icon: Settings },
];

export function Dashboard(props: DashboardProps) {
  const { snapshot, page, onPage } = props;
  const language = languageOf(snapshot.settings.language);
  const updaterCopy = copy[language].updater;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  return (
    <main className="grid h-full min-h-0 overflow-hidden bg-canvas text-foreground md:grid-cols-[232px_minmax(0,1fr)] 2xl:grid-cols-[260px_minmax(0,1fr)]">
      <aside className={cn(
        "fixed inset-y-0 left-0 z-30 flex w-[232px] flex-col border-r border-edge bg-sidebar/90 px-5 py-6 backdrop-blur-xl transition-transform md:static md:translate-x-0 2xl:w-[260px] 2xl:px-6 2xl:py-8",
        sidebarOpen ? "translate-x-0" : "-translate-x-full",
      )}>
        <div className="flex items-center justify-between px-2">
          <Brand />
          <button className="grid size-9 place-items-center rounded-xl hover:bg-accent-soft md:hidden" aria-label="关闭导航" onClick={() => setSidebarOpen(false)}><X size={18} /></button>
        </div>

        <div className="relative mt-7 rounded-2xl border border-edge bg-panel p-3 shadow-control">
          <StatusPill snapshot={snapshot} />
          <div className="mt-3">
            {snapshot.lifecycle === "break" ? (
              <button className="flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-info-soft text-xs font-bold text-info hover:bg-accent-soft-strong" onClick={props.onEndBreak}>
                <Coffee size={15} /> 结束休息
              </button>
            ) : snapshot.lifecycle === "monitoring" || snapshot.lifecycle === "degraded" ? (
              <>
                <button className="flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-accent-soft text-xs font-bold text-accent-strong hover:bg-accent-soft-strong" onClick={() => setPauseOpen((value) => !value)}>
                  <Pause size={15} /> 暂停检测 <ChevronDown size={14} />
                </button>
                {pauseOpen && (
                  <div className="absolute left-3 right-3 top-[82px] z-20 grid overflow-hidden rounded-xl border border-edge bg-panel p-1 text-xs shadow-panel">
                    <button className="rounded-lg px-3 py-2 text-left hover:bg-panel-muted" onClick={() => { props.onPause(30); setPauseOpen(false); }}>暂停 30 分钟</button>
                    <button className="rounded-lg px-3 py-2 text-left hover:bg-panel-muted" onClick={() => { props.onPause(60); setPauseOpen(false); }}>暂停 1 小时</button>
                    <button className="rounded-lg px-3 py-2 text-left hover:bg-panel-muted" onClick={() => { props.onPause(null); setPauseOpen(false); }}>暂停到手动恢复</button>
                  </div>
                )}
              </>
            ) : (
              <button className="flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-accent text-xs font-bold text-inverse hover:bg-accent-strong" onClick={props.onResume}><Play size={15} /> 恢复检测</button>
            )}
          </div>
        </div>

        <nav className="mt-7 grid gap-1" aria-label="主导航">
          <span className="px-3 pb-2 text-xs font-bold tracking-[.16em] text-muted">空间</span>
          {navItems.map(({ page: target, label, icon: Icon }) => (
            <button
              key={target}
              className={cn(
                "relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-muted transition-colors hover:bg-accent-soft hover:text-accent-strong 2xl:h-12 2xl:text-base",
                page === target && "bg-accent-soft text-accent-strong",
              )}
              onClick={() => { onPage(target); setSidebarOpen(false); }}
            >
              <Icon size={18} /> {label}
              {target === "today" && snapshot.currentReminder ? <i className="ml-auto size-2 rounded-full bg-warning" /> : null}
            </button>
          ))}
        </nav>

        <div className="mt-auto rounded-2xl border border-edge bg-panel-muted p-3">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-panel text-accent"><LockKeyhole size={17} /></span>
            <div className="min-w-0"><strong className="block text-sm">本地隐私模式</strong><small className="mt-0.5 block truncate text-[11px] text-muted">画面不保存、不上传</small></div>
          </div>
        </div>
        <div className="mt-3 grid gap-0.5 px-2">
          <button className="relative flex h-9 items-center gap-2 text-xs font-semibold text-muted hover:text-accent" onClick={props.updater.open}>
            <RefreshCw size={16} /> {updaterCopy.check}
            {props.updater.updateAvailable && <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-1 text-[8px] font-extrabold text-warning"><i className="size-1.5 rounded-full bg-warning" />{updaterCopy.badge}</span>}
          </button>
          <button className="flex h-9 items-center gap-2 text-xs font-semibold text-muted hover:text-accent" onClick={props.onHelp}><CircleHelp size={16} /> {language === "en-US" ? "Help" : "使用帮助"}</button>
          <p className="mt-1 text-[10px] text-subtle">{language === "en-US" ? `Health Reminder v${packageJson.version} · Behavior reminder` : `健康提醒 v${packageJson.version} · 行为提醒工具`}</p>
        </div>
      </aside>

      {sidebarOpen && <button className="fixed inset-0 z-20 bg-panel-strong/25 md:hidden" aria-label="关闭导航" onClick={() => setSidebarOpen(false)} />}

      <section className="relative min-h-0 min-w-0 overflow-hidden">
        <button className="absolute left-3 top-3 z-10 grid size-9 place-items-center rounded-xl border border-edge bg-panel shadow-control md:hidden" aria-label="打开导航" onClick={() => setSidebarOpen(true)}><Menu size={18} /></button>
        <div className={cn("h-full min-h-0", page === "privacy" ? "overflow-y-auto" : "overflow-hidden")}>
          {page === "today" && <TodayPage {...props} />}
          {page === "statistics" && <StatisticsPage statistics={props.statistics} history={props.behaviorHistory} snapshot={snapshot} />}
          {page === "weather" && <WeatherPage />}
          {page === "settings" && (
            <SettingsPage
              snapshot={snapshot}
              error={props.error}
              onSave={props.onSaveSettings}
              onExport={props.onExport}
              onDeleteData={props.onDeleteData}
              onEnableCamera={props.onEnableCamera}
              onRecalibrate={props.onRecalibrate}
            />
          )}
          {page === "privacy" && <PrivacyPage snapshot={snapshot} onExport={props.onExport} onDeleteData={props.onDeleteData} />}
        </div>
      </section>
    </main>
  );
}

function TodayPage({ snapshot, visionStatus, streamUrl, previewError, landmarks, error, onStartBreak, onEndBreak, onPage, onRetryPreview, onEnableCamera }: DashboardProps) {
  const thresholdSeconds = snapshot.settings.sedentarySeconds;
  const isReminderTest = thresholdSeconds <= 30;
  const schedulePause = reminderSchedulePause(snapshot.settings);
  const progress = percent(snapshot.seatedSeconds, thresholdSeconds);
  const reminderTiming = reminderTimingCopy(snapshot, schedulePause);
  const isCamera = snapshot.monitoringMode === "camera";
  const canEnableCamera = !isCamera && (snapshot.lifecycle === "monitoring" || snapshot.lifecycle === "degraded");
  // 追踪应用内预览首帧是否已渲染,确保骨架不会在画面到达前出现。
  const [imgLoaded, setImgLoaded] = useState(false);
  const detectionPanelTitle = snapshot.lifecycle === "paused"
    ? "检测已暂停"
    : snapshot.lifecycle === "break"
      ? "休息进行中"
      : isCamera
        ? (visionStatus === "ready" ? (imgLoaded ? "正在实时检测" : "正在连接视频流") : "正在连接检测")
        : "定时提醒模式";
  const detectionPanelDescription = snapshot.lifecycle === "paused"
    ? (isCamera ? "恢复后继续本地姿态识别" : "恢复后继续普通定时提醒")
    : snapshot.lifecycle === "break"
      ? (isCamera ? "结束休息后继续本地姿态识别" : "结束休息后继续普通定时提醒")
      : isCamera
        ? qualityLabel(snapshot.frameQuality)
        : "仅根据启用时间提供久坐提醒";
  const streamSession = streamUrl?.startsWith("data:image/")
    ? "event-preview"
    : (streamUrl?.split("?", 1)[0] ?? null);
  useEffect(() => {
    // streamUrl 变化时重置加载状态,等待新一轮首帧到达。
    setImgLoaded(false);
  }, [streamSession]);
  // 仅在请求权限和加载模型阶段显示遮罩;"ready" 阶段改用独立的视频流连接遮罩。
  const isVisionLoading = visionStatus === "requesting" || visionStatus === "loading_model";
  // 模型已就绪但应用内预览首帧尚未渲染时,显示视频流连接提示。
  const isStreamConnecting = isCamera && visionStatus === "ready" && !imgLoaded;
  const behaviorCopy: Record<AppSnapshot["behavior"], { title: string; text: string; tone: string }> = {
    no_person: { title: "已离座 · 计时已暂停", text: "回来后会继续判断当前会话", tone: "muted" },
    present: { title: "正在确认姿态", text: "多帧稳定后才会开始累计", tone: "blue" },
    sitting_normal: { title: "姿态自然", text: "保持现在这样，很不错", tone: "healthy" },
    head_down: { title: "持续低头中", text: "系统正在累计持续时间", tone: "warning" },
    standing_break: { title: "你站起来了", text: "保持一会儿即可完成有效休息", tone: "blue" },
    unknown: { title: "等待稳定画面", text: "低置信度不会触发明确提醒", tone: "muted" },
  };
  const behavior = snapshot.lifecycle === "break"
    ? { title: "休息进行中", text: "倒计时与结束操作已显示在灵动岛", tone: "blue" }
    : isCamera
      ? behaviorCopy[snapshot.behavior]
      : { title: "定时提醒已开启", text: "达到阈值后会提醒你起身活动", tone: "healthy" };

  return (
    <div className="today-page-layout relative grid h-full min-h-0 grid-rows-[162px_12px_minmax(0,1fr)_23px_124px] overflow-hidden px-6 pb-[58px] pt-5">
      <header className="grid min-h-0 grid-cols-1 gap-5 min-[1180px]:grid-cols-[minmax(340px,1fr)_minmax(430px,514px)]">
        <div className="min-w-0 self-start pt-3"><span className="text-[11px] font-extrabold tracking-[.14em] text-accent">今天 · {new Intl.DateTimeFormat(languageOf(snapshot.settings.language), { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date())}</span><h1 className="mt-5 text-[32px] font-black leading-none tracking-[-.04em]">照顾好当下的姿势</h1><p className="mt-5 text-[13px] text-muted">保持专注即可，健康提醒只在需要时出现。</p></div>
        <div className="hidden h-full min-w-0 items-center justify-end gap-4 min-[1180px]:flex">
          <div className="w-[220px] shrink-0 translate-y-1.5 empty:hidden"><TodayWeatherHeader /></div>
          <button className="inline-flex h-11 w-[168px] shrink-0 translate-y-4 items-center justify-center gap-2 rounded-full bg-accent-soft px-5 text-[12px] font-bold text-foreground transition-colors hover:bg-accent-soft-strong" onClick={snapshot.lifecycle === "break" ? onEndBreak : onStartBreak}><Coffee size={17} /> {snapshot.lifecycle === "break" ? "结束休息" : "主动休息"} <ChevronRight size={15} /></button>
        </div>
      </header>

      {snapshot.lifecycle !== "paused" && (error || (isCamera && visionStatus === "error")) && (
        <div className="absolute inset-x-6 top-[140px] z-20 flex items-center gap-3 rounded-xl border border-warning/35 bg-warning-soft px-4 py-2 text-xs text-warning-foreground shadow-control"><CameraOff size={18} /><div className="min-w-0 flex-1"><strong className="block">摄像头检测暂不可用，已保留普通定时提醒</strong><span className="block truncate text-[9px]">{error ?? "请检查系统摄像头权限或设备占用情况。"}</span></div><button className="font-bold underline" onClick={() => onPage("settings")}>检查设置</button></div>
      )}

      <div className="row-start-3 grid min-h-0 gap-4 min-[1180px]:grid-cols-[minmax(0,1fr)_343px]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-card border border-edge bg-panel shadow-panel">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-edge px-5"><span className="flex items-center gap-2 text-xs font-extrabold"><Activity size={17} /> 当前会话</span><small className="text-[9px] text-muted">{isReminderTest ? `${thresholdSeconds} 秒测试` : schedulePause ?? (isCamera ? "摄像头低功耗检测" : "普通定时模式")}</small></div>
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(230px,.82fr)_minmax(260px,1.18fr)] items-center gap-7 px-6 py-4">
            <div className="mx-auto grid aspect-square w-[min(28vh,220px)] min-w-[182px] -translate-y-1 place-items-center rounded-full bg-[conic-gradient(var(--theme-accent)_var(--session-progress),var(--theme-edge)_0)] p-2" style={{ "--session-progress": `${progress * 3.6}deg` } as CSSProperties}>
              <div className="grid size-full place-content-center rounded-full bg-panel text-center shadow-inner"><span className="text-[11px] text-muted">连续坐姿</span><strong className="my-2 text-[40px] leading-none tracking-[-.05em]">{formatDuration(snapshot.seatedSeconds)}</strong><small className="max-w-[160px] text-[10px] font-bold text-accent" aria-live="polite">{reminderTiming.status}</small></div>
            </div>
            <div className="min-w-0">
              <span className={cn("grid size-12 -translate-y-4 place-items-center rounded-2xl", behavior.tone === "healthy" ? "bg-accent-soft text-accent" : behavior.tone === "warning" ? "bg-warning-soft text-warning" : "bg-neutral-soft text-muted")}><UserRound size={27} /></span>
              <span className="mt-2 block text-[11px] font-extrabold tracking-[.14em] text-accent">当前姿态</span>
              <h2 className="mt-4 truncate text-[30px] font-black leading-tight tracking-[-.04em]">{behavior.title}</h2>
              <p className="mt-2 truncate text-[11px] text-muted">{behavior.text}</p>
              {isCamera && <div className="mt-7 grid grid-cols-[auto_1fr_auto] items-center gap-3 text-[10px] text-muted"><span>头肩稳定度</span><div className="h-2 overflow-hidden rounded-full bg-edge"><i className="block h-full rounded-full bg-accent" style={{ width: `${Math.round(snapshot.postureConfidence * 100)}%` }} /></div><strong className="text-foreground">{Math.round(snapshot.postureConfidence * 100)}%</strong></div>}
            </div>
          </div>
          <div className="flex h-16 shrink-0 items-center justify-between gap-4 border-t border-edge px-5 text-[10px] text-muted">
            <span className="flex min-w-0 items-center gap-2 truncate"><ShieldCheck size={14} /> {isCamera ? "多帧确认 · 画面仅在本机处理" : "普通定时提醒"}</span>
            <span className="flex shrink-0 items-center gap-2"><Clock3 size={14} /><b className="text-accent">{reminderTiming.clock}</b><em className="not-italic">{reminderTiming.countdown}</em></span>
          </div>
        </section>

        <section className="hidden min-h-0 grid-rows-[62px_minmax(0,1fr)_68px_68px] overflow-hidden rounded-card border border-edge bg-panel shadow-panel min-[1180px]:grid">
          <div className="flex items-center justify-between px-5"><span className="flex items-center gap-2 text-xs font-extrabold"><Camera size={17} /> 检测状态</span><span className={cn("rounded-full px-3 py-1 text-[9px] font-bold", snapshot.lifecycle === "paused" ? "bg-warning-soft text-warning" : !isCamera || snapshot.frameQuality === "good" ? "bg-accent-soft text-accent" : "bg-warning-soft text-warning")}>{snapshot.lifecycle === "paused" ? "静默中" : !isCamera ? "定时中" : snapshot.frameQuality === "good" ? "检测中" : "待确认"}</span></div>
          <div className="relative mx-4 min-h-0 overflow-hidden rounded-xl bg-[linear-gradient(135deg,var(--theme-panel-strong),var(--theme-accent-strong))]">
            {isCamera && streamUrl ? (
              <>
                <img
                  src={streamUrl}
                  className="absolute inset-0 size-full object-cover"
                  alt="摄像头实时预览"
                  onLoad={() => setImgLoaded(true)}
                  onError={() => setImgLoaded(false)}
                />
                {imgLoaded && <PoseCanvas landmarks={landmarks} />}
              </>
            ) : (
              <div className="grid size-full -translate-y-2 place-content-center justify-items-center gap-2 text-muted">
                <ScanFace size={82} strokeWidth={1.15} />
                {canEnableCamera && <button type="button" className="relative z-20 min-h-9 rounded-lg border border-inverse/20 bg-panel-strong/45 px-4 py-2 text-[10px] font-bold text-inverse shadow-control hover:bg-panel-strong/65" onClick={onEnableCamera}>开启姿势检测</button>}
              </div>
            )}
            {isCamera && isVisionLoading && (
              <div className="absolute inset-0 grid place-content-center justify-items-center gap-2 bg-panel-strong/90 text-inverse-muted"><Camera size={22} /><span className="text-[9px]">{visionStatus === "requesting" ? "正在请求摄像头权限…" : "正在加载姿态模型…"}</span></div>
            )}
            {isStreamConnecting && (
              <div className="absolute inset-0 grid place-content-center justify-items-center gap-2 bg-panel-strong/90 px-5 text-center text-inverse-muted">
                <Camera size={22} />
                <span className="text-[9px]">{previewError ?? "正在连接视频流…"}</span>
                {previewError && <button className="mt-1 rounded-lg border border-inverse/20 px-3 py-1.5 text-[9px] font-bold text-inverse hover:bg-inverse/10" onClick={onRetryPreview}>重试预览</button>}
              </div>
            )}
            <div className={cn("pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-panel-strong/80 to-transparent px-4 pt-8 text-inverse", snapshot.lifecycle === "paused" ? "pb-6 text-center" : "pb-3")}>
              <strong className="block text-[11px]">{detectionPanelTitle}</strong>
              <small className={cn("block truncate text-[8px] text-inverse/60", snapshot.lifecycle === "paused" ? "mt-2" : "mt-1")}>{detectionPanelDescription}</small>
            </div>
          </div>
          <button className="mx-4 grid min-w-0 grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2 text-left hover:bg-panel-muted" onClick={() => onPage("privacy")}><span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent"><ShieldCheck size={18} /></span><span className="min-w-0"><strong className="block text-[10px]">隐私与设备</strong><small className="mt-1 block truncate text-[9px] text-muted">画面仅在本机处理，不保存，不上传</small></span><ChevronRight size={16} className="text-muted" /></button>
          <button className="mx-4 grid min-w-0 grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2 border-t border-edge text-left hover:bg-panel-muted" onClick={() => onPage("settings")}><span className="grid size-9 place-items-center rounded-xl bg-neutral-soft text-muted"><SlidersHorizontal size={18} /></span><span className="min-w-0"><strong className="block text-[10px]">检测设置</strong><small className="mt-1 block truncate text-[9px] text-muted">调整摄像头与识别选项</small></span><ChevronRight size={16} className="text-muted" /></button>
        </section>
      </div>

      <div className={cn("row-start-5 grid min-h-0 gap-3", isCamera ? "grid-cols-4 min-[1180px]:grid-cols-5" : "grid-cols-4")}>
        <MetricCard icon={Clock3} label="今日坐姿" value={compactDuration(snapshot.today.seatedSeconds)} note={`最长连续 ${compactDuration(snapshot.today.longestSeatedSeconds)}`} tone="sage" />
        <MetricCard icon={Gauge} label="累计低头" value={compactDuration(snapshot.today.headDownSeconds)} note={`${snapshot.today.reminderCount} 次温和提醒`} tone="sand" />
        <MetricCard icon={Coffee} label="完成休息" value={`${snapshot.today.breakCount} 次`} note={snapshot.today.breakCount ? "正在形成好习惯" : "主动休息也会被记录"} tone="blue" />
        <MetricCard icon={BellOff} label="忽略提醒" value={`${snapshot.today.dismissedCount} 次`} note="我们会控制提醒频率" tone="rose" />
        {isCamera ? <div className="hidden min-[1180px]:contents"><MetricCard icon={Activity} label="离座活动" value={compactDuration(snapshot.today.awaySeconds)} note={snapshot.today.awaySeconds > 0 ? "短暂离开也被记录" : "起身接水也算活动"} tone="sage" /></div> : null}
      </div>

    </div>
  );
}

function MetricCard({ icon: Icon, label, value, note, tone }: { icon: typeof Clock3; label: string; value: string; note: string; tone: string }) {
  const tones: Record<string, string> = { sage: "bg-accent-soft text-accent", sand: "bg-warning-soft text-warning", blue: "bg-info-soft text-info", rose: "bg-danger-soft text-danger" };
  return <section className="flex min-h-0 min-w-0 items-center gap-3 rounded-2xl border border-edge bg-panel px-4 shadow-panel"><span className={cn("grid size-12 shrink-0 place-items-center rounded-2xl", tones[tone])}><Icon size={23} /></span><div className="min-w-0"><span className="block text-[10px] text-muted">{label}</span><strong className="my-1 block text-[22px] leading-none tracking-[-.03em]">{value}</strong><small className="block truncate text-[9px] text-subtle">{note}</small></div></section>;
}

function qualityLabel(quality: AppSnapshot["frameQuality"]): string {
  const labels = {
    good: "光线与取景适合识别",
    dark: "当前光线较暗，明确判断已暂停",
    occluded: "头部暂时被遮挡，请让鼻尖、双眼和双耳尽量清晰可见",
    multi_person: "画面中有多人，明确判断已暂停",
    unstable: "正在等待稳定的多帧结果",
  };
  return labels[quality];
}

function StatisticsPage({ statistics, history, snapshot }: { statistics: DailyStatistics[]; history: BehaviorHistoryEvent[]; snapshot: AppSnapshot }) {
  const [range, setRange] = useState<7 | 30>(7);
  const rows = statistics.slice(-range);
  const maxSeated = Math.max(1, ...rows.map((item) => item.seatedSeconds));
  const totalSeated = rows.reduce((sum, item) => sum + item.seatedSeconds, 0);
  const totalHeadDown = rows.reduce((sum, item) => sum + item.headDownSeconds, 0);
  const totalAway = rows.reduce((sum, item) => sum + item.awaySeconds, 0);
  const totalBreaks = rows.reduce((sum, item) => sum + item.breakCount, 0);
  const totalReminders = rows.reduce((sum, item) => sum + item.reminderCount, 0);
  const totalDismissed = rows.reduce((sum, item) => sum + item.dismissedCount, 0);
  const completion = totalReminders ? Math.round((totalBreaks / totalReminders) * 100) : 0;
  const latestHistory = history.slice(0, 6);
  const eventCopy: Record<BehaviorHistoryEvent["eventType"], { label: string; tone: string }> = {
    away: { label: "离开座位", tone: "bg-info-soft text-info" },
    head_down: { label: "持续低头", tone: "bg-warning-soft text-warning" },
    break: { label: "提醒后休息", tone: "bg-accent-soft text-accent" },
    proactive_break: { label: "主动休息", tone: "bg-accent-soft text-accent" },
    early_break: { label: "提前休息", tone: "bg-accent-soft text-accent" },
    proactive_pause: { label: "主动暂停", tone: "bg-neutral-soft text-muted" },
    reminder: { label: "提醒操作", tone: "bg-danger-soft text-danger" },
  };

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-3 overflow-hidden p-5 xl:p-7">
      <header className="flex shrink-0 items-end justify-between gap-4"><div><span className="text-[10px] font-extrabold tracking-[.16em] text-accent">仅保存在本机</span><h1 className="mt-1 text-[clamp(24px,2.4vw,34px)] font-black tracking-[-.04em]">你的习惯趋势</h1><p className="mt-1 text-xs text-muted">看变化即可，不给身体表现打分。</p></div><div className="flex rounded-xl bg-edge-soft p-1 text-[10px] font-bold"><button className={cn("rounded-lg px-3 py-2 text-muted", range === 7 && "bg-panel text-accent shadow-control")} onClick={() => setRange(7)}>近 7 天</button><button className={cn("rounded-lg px-3 py-2 text-muted", range === 30 && "bg-panel text-accent shadow-control")} onClick={() => setRange(30)}>近 30 天</button></div></header>
      <div className="grid shrink-0 grid-cols-3 gap-2 min-[1180px]:grid-cols-6">
        {[
          ["日均坐姿", compactDuration(totalSeated / Math.max(1, rows.length)), "稳定坐姿累计"],
          ["最长连续", compactDuration(Math.max(0, ...rows.map((item) => item.longestSeatedSeconds))), "逐步缩短即可"],
          ["累计低头", compactDuration(totalHeadDown), `${totalReminders} 次提醒`],
          ["离座活动", compactDuration(totalAway), `${rows.reduce((sum, item) => sum + item.awayCount, 0)} 次离座`],
          ["完成休息", `${totalBreaks} 次`, `${Math.min(100, completion)}% 提醒转化`],
          ["忽略提醒", `${totalDismissed} 次`, totalReminders ? `${Math.round(totalDismissed / totalReminders * 100)}% 的提醒` : "暂无提醒"],
        ].map(([label, value, note]) => <section className="min-w-0 rounded-2xl border border-edge bg-panel px-3 py-2.5 shadow-panel" key={label}><span className="block truncate text-[8px] text-muted">{label}</span><strong className="mt-1 block truncate text-lg tracking-[-.04em]">{value}</strong><small className="block truncate text-[7px] text-subtle">{note}</small></section>)}
      </div>
      <div className="grid min-h-0 gap-3 min-[1080px]:grid-cols-[minmax(0,1.55fr)_minmax(300px,.75fr)]">
        <section className="flex min-h-0 flex-col rounded-card border border-edge bg-panel px-5 pb-3 pt-4 shadow-panel">
          <div className="flex shrink-0 items-center justify-between"><div><span className="text-[9px] font-extrabold tracking-[.14em] text-accent">每日行为</span><h2 className="mt-0.5 text-lg font-black">坐姿与低头变化</h2></div><span className="flex items-center gap-3 text-[8px] text-muted"><i className="size-2 rounded bg-accent" />坐姿<i className="size-2 rounded bg-warning" />低头</span></div>
          <div className={cn("mt-2 flex min-h-[130px] flex-1 items-end gap-3 border-b border-edge bg-[linear-gradient(to_bottom,var(--theme-edge-soft)_1px,transparent_1px)] bg-[size:100%_25%] px-1 pt-5", range === 30 && "gap-1")}>
            {rows.map((item, index) => {
              const date = new Date(`${item.localDate}T00:00:00`);
              return <div className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end" key={item.localDate}><div className="pointer-events-none absolute -top-1 z-10 -translate-y-full rounded-md bg-panel-strong px-2 py-1 text-[7px] text-inverse opacity-0 transition-opacity group-hover:opacity-100">坐姿 {compactDuration(item.seatedSeconds)} · 低头 {compactDuration(item.headDownSeconds)}</div><div className="flex h-[calc(100%-20px)] w-full items-end justify-center gap-px"><i className="w-[min(18px,44%)] min-w-0 rounded-t bg-accent" style={{ height: `${Math.max(4, item.seatedSeconds / maxSeated * 100)}%` }} /><i className="w-[min(8px,28%)] min-w-0 rounded-t bg-warning" style={{ height: `${Math.max(3, item.headDownSeconds / maxSeated * 100)}%` }} /></div><span className="h-5 pt-1.5 text-[8px] text-muted">{range === 7 || index % 5 === 0 ? `${date.getMonth() + 1}/${date.getDate()}` : ""}</span></div>;
            })}
          </div>
          <div className="mt-3 flex shrink-0 items-center gap-3 rounded-xl bg-panel-muted px-3 py-2"><Sparkles size={16} className="text-warning" /><p className="min-w-0 truncate text-[9px] text-muted"><b className="mr-2 text-foreground">本期观察</b>{snapshot.today.breakCount > 0 ? "你正在主动打断久坐，继续保持自己的节奏。" : "今天可以从一次主动休息开始。"}</p></div>
        </section>
        <section className="flex min-h-0 flex-col overflow-hidden rounded-card border border-edge bg-panel p-4 shadow-panel">
          <div className="flex shrink-0 items-center justify-between border-b border-edge-soft pb-3"><div><span className="text-[9px] font-extrabold tracking-[.14em] text-accent">行为历史</span><h2 className="mt-0.5 text-base font-black">最近记录</h2></div><CalendarClock size={19} className="text-muted" /></div>
          <div className="grid min-h-0 flex-1 auto-rows-fr">
            {latestHistory.length ? latestHistory.map((event) => {
              const copy = eventCopy[event.eventType];
              const when = new Date(event.startedAt);
              return <div className="grid min-h-0 grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-2 border-b border-edge-soft last:border-0" key={event.id}><span className={cn("grid size-7 place-items-center rounded-lg", copy.tone)}><Activity size={13} /></span><div className="min-w-0"><strong className="block truncate text-[9px]">{copy.label}</strong><small className="block truncate text-[7px] text-muted">{Number.isNaN(when.getTime()) ? event.startedAt : when.toLocaleTimeString(languageOf(snapshot.settings.language), { hour: "2-digit", minute: "2-digit" })}{event.action ? ` · ${historyActionLabel(event.action)}` : ""}</small></div><b className="text-[8px] text-muted">{event.durationSeconds ? compactDuration(event.durationSeconds) : "即时"}</b></div>;
            }) : <div className="grid place-content-center justify-items-center gap-2 text-muted"><CalendarClock size={26} /><span className="text-[9px]">行为发生后会记录在这里</span></div>}
          </div>
        </section>
      </div>
    </div>
  );
}

function historyActionLabel(action: string): string {
  return ({ returned: "已返回", recovered: "已恢复", started: "已开始", completed: "已完成", timed: "定时暂停", manual: "手动恢复", "30_minutes": "暂停 30 分钟", snoozed: "稍后提醒", dismissed: "已忽略" } as Record<string, string>)[action] ?? action;
}

function PrivacyPage({ snapshot, onExport, onDeleteData }: { snapshot: AppSnapshot; onExport: () => void; onDeleteData: () => void }) {
  return <div className="mx-auto max-w-[1040px] px-[clamp(20px,4vw,54px)] py-8"><span className={eyebrowClass}>隐私与设备</span><h1 className="mb-2 mt-2 text-[31px] font-black tracking-[-.035em]">本地处理，数据由你掌控</h1><p className="text-[13px] text-muted">这里说明摄像头和本地统计的边界；检测参数请前往偏好设置。</p><div className="mt-6 grid gap-4 md:grid-cols-2"><section className={settingsPanelClass}><div className="mb-4 grid size-[52px] place-items-center rounded-2xl bg-accent-soft text-accent"><ShieldCheck size={28} /></div><h2 className="text-lg font-bold">原始画面不落盘</h2><p className="mt-2 text-[10px] leading-5 text-muted">姿态模型在本机内存中处理画面，数据库只保存结构化行为事件、每日汇总和设置。</p><ul className="mt-5 grid list-none gap-3 p-0 text-[10px] text-muted"><li className="flex gap-2"><Eye size={15} className="text-accent" />不进行身份识别</li><li className="flex gap-2"><CameraOff size={15} className="text-accent" />不保存视频或截图</li><li className="flex gap-2"><LockKeyhole size={15} className="text-accent" />不上传摄像头数据</li></ul></section><section className={settingsPanelClass}><span className={eyebrowClass}>当前设备</span><h2 className="mt-2 text-lg font-bold">{snapshot.monitoringMode === "camera" ? "摄像头本地检测" : "普通定时模式"}</h2><p className="mt-2 text-[10px] leading-5 text-muted">{snapshot.monitoringMode === "camera" ? `设备：${snapshot.settings.cameraId || "默认摄像头"}。校准信息只保存一个数值基线。` : "当前不会读取摄像头，只根据启用时间提供久坐提醒。"}</p><div className="mt-5 grid gap-2"><button className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-edge text-[11px] font-bold text-muted hover:bg-panel-muted" onClick={onExport}><Download size={17} />导出本地 CSV</button><button className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl text-[11px] font-bold text-danger hover:bg-danger-soft" onClick={onDeleteData}><Trash2 size={17} />删除全部统计和行为历史</button></div></section></div></div>;
}

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (checked: boolean) => void; label: string; description: string }) {
  return (
    <label className="relative flex min-h-[60px] cursor-pointer items-center gap-4 border-b border-edge-soft py-2">
      <div className="flex flex-1 flex-col gap-1"><strong className="text-sm leading-5 2xl:text-base">{label}</strong><small className="text-[11px] leading-4 text-muted 2xl:text-[13px]">{description}</small></div>
      <input className="peer sr-only" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="relative h-[22px] w-[38px] shrink-0 rounded-full bg-edge transition after:absolute after:left-[3px] after:top-[3px] after:size-4 after:rounded-full after:bg-panel after:shadow-sm after:transition after:content-[''] peer-checked:bg-accent peer-checked:after:translate-x-4" />
    </label>
  );
}

const primaryButtonClass = "inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-inverse shadow-control transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50";
const settingsPanelClass = "rounded-[18px] border border-edge bg-panel p-6 shadow-panel";
const sectionTitleClass = "mb-1 flex items-center gap-4 border-b border-edge-soft pb-5 [&_h2]:mb-1 [&_h2]:text-[22px] [&_h2]:font-black [&_p]:m-0 [&_p]:text-xs [&_p]:leading-5 [&_p]:text-muted 2xl:[&_h2]:text-[24px] 2xl:[&_p]:text-[13px]";
const fieldGridClass = "grid grid-cols-1 gap-4 border-b border-edge-soft py-5 sm:grid-cols-2 [&_label]:flex [&_label]:flex-col [&_label]:gap-2.5 [&_label>span]:text-xs [&_label>span]:font-bold [&_label>span]:text-muted [&_input]:h-11 [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-edge [&_input]:bg-field [&_input]:px-4 [&_input]:text-[13px] disabled:[&_input]:cursor-not-allowed";
const selectFieldClass = "flex min-w-0 flex-col gap-2.5 [&>span]:text-xs [&>span]:font-bold [&>span]:text-muted";
const eyebrowClass = "text-xs font-extrabold tracking-[.14em] text-accent";

function intervalLabel(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = seconds / 60;
  return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} 分钟`;
}

function reminderSchedulePause(settings: AppSettings): string | null {
  if (settings.sedentarySeconds <= 30) return null;
  const now = new Date();
  if (!settings.weekendEnabled && (now.getDay() === 0 || now.getDay() === 6)) return "周末暂停提醒";
  const minute = now.getHours() * 60 + now.getMinutes();
  const parse = (value: string) => {
    const [hour = 0, minutes = 0] = value.split(":").map(Number);
    return hour * 60 + minutes;
  };
  const inSpan = (value: number, start: number, end: number) => start <= end
    ? value >= start && value <= end
    : value >= start || value <= end;
  const inWork = inSpan(minute, parse(settings.workdayStart), parse(settings.workdayEnd));
  if (!inWork) return "当前不在工作提醒时段";
  const quietStart = parse(settings.quietStart);
  const quietEnd = parse(settings.quietEnd);
  if (settings.quietHoursEnabled && quietStart !== quietEnd && inSpan(minute, quietStart, quietEnd)) return `静默中 · ${settings.quietEnd} 恢复提醒`;
  return null;
}

function reminderTimingCopy(snapshot: AppSnapshot, schedulePause: string | null): { clock: string; countdown: string; status: string } {
  if (snapshot.lifecycle === "break") {
    const timeUp = snapshot.breakRemainingSeconds === 0;
    return {
      clock: timeUp ? "休息时间到" : "休息进行中",
      countdown: timeUp ? "等待确认完成" : `剩余 ${formatDuration(snapshot.breakRemainingSeconds)}`,
      status: timeUp ? "请在灵动岛确认完成" : `休息剩余 ${formatDuration(snapshot.breakRemainingSeconds)}`,
    };
  }
  if (schedulePause) return { clock: "提醒计划已暂停", countdown: schedulePause, status: schedulePause };
  if (snapshot.lifecycle === "paused") return { clock: "检测已暂停", countdown: "恢复后继续", status: "恢复检测后继续累计" };
  if (snapshot.currentReminder) {
    return { clock: "本次提醒已发出", countdown: "请处理当前提醒", status: "提醒已发出" };
  }
  if (snapshot.nextReminderAt && snapshot.reminderRemainingSeconds !== null) {
    const date = new Date(snapshot.nextReminderAt);
    const time = Number.isNaN(date.getTime())
      ? "即将提醒"
      : new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(date);
    const countdown = `剩余 ${formatDuration(snapshot.reminderRemainingSeconds)}`;
    const status = snapshot.seatedSeconds < snapshot.settings.sedentarySeconds
      ? `距离首次提醒还有 ${formatDuration(snapshot.reminderRemainingSeconds)}`
      : `距离下次提醒还有 ${formatDuration(snapshot.reminderRemainingSeconds)}`;
    return { clock: `下次提醒 ${time}`, countdown, status };
  }
  if (snapshot.reminderRemainingSeconds !== null && snapshot.monitoringMode === "camera") {
    const countdown = `还需稳定坐姿 ${formatDuration(snapshot.reminderRemainingSeconds)}`;
    return { clock: "等待稳定坐姿", countdown, status: "识别稳定后开始计时" };
  }
  if (!snapshot.settings.repeatReminders && snapshot.seatedSeconds >= snapshot.settings.sedentarySeconds) {
    return { clock: "重复提醒已关闭", countdown: "休息后重新计时", status: "等待你开始休息" };
  }
  return { clock: `每 ${intervalLabel(snapshot.settings.sedentarySeconds)}提醒`, countdown: "正在计算下一次提醒", status: "正在计算下一次提醒" };
}

function SedentaryThresholdControl({ seconds, onChange }: { seconds: number; onChange: (seconds: number) => void }) {
  const [unit, setUnit] = useState<"seconds" | "minutes">(seconds < 60 ? "seconds" : "minutes");
  const displayValue = unit === "seconds" ? seconds : Number((seconds / 60).toFixed(1));
  const presets = [
    { label: "10 秒测试", seconds: 10 },
    { label: "30 秒测试", seconds: 30 },
    { label: "30 分钟 · 积极", seconds: 1_800 },
    { label: "45 分钟 · 推荐", seconds: 2_700, recommended: true },
    { label: "60 分钟 · 温和", seconds: 3_600 },
  ];
  const commit = (raw: number) => {
    const next = unit === "seconds" ? raw : raw * 60;
    onChange(Math.min(14_400, Math.max(5, Math.round(next))));
  };

  return (
    <div className="rounded-[14px] border border-warning/25 bg-warning-soft p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2"><span className="text-[10px] font-bold text-muted">久坐首次提醒</span><strong className="text-[17px] text-warning">{intervalLabel(seconds)}</strong></div>
        <HeartPulse className="shrink-0 text-warning" size={16} />
      </div>
      <p className="mb-0 mt-1 text-[8px] leading-3.5 text-muted">建议用轻活动打断连续久坐；45 分钟是兼顾专注的产品参考，并非医疗处方。</p>
      <div className="mt-2.5 grid grid-cols-[minmax(0,1fr)_92px] gap-2">
        <label className="grid gap-1.5">
          <span className="text-[9px] font-bold text-muted">自定义时长</span>
          <input className="h-10 w-full rounded-lg border border-edge bg-field px-3 text-[11px]" aria-label="自定义久坐提醒时长" type="number" min={unit === "seconds" ? 5 : 0.1} max={unit === "seconds" ? 14_400 : 240} step={unit === "seconds" ? 1 : 0.5} value={displayValue} onChange={(event) => commit(Number(event.target.value))} />
        </label>
        <div className="grid gap-1.5">
          <span className="text-[9px] font-bold text-muted">单位</span>
          <SelectField
            value={unit}
            options={[{ value: "seconds", label: "秒" }, { value: "minutes", label: "分钟" }]}
            ariaLabel="久坐提醒时间单位"
            onChange={setUnit}
          />
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5" aria-label="快速时长">
        {presets.map((preset) => <button key={preset.seconds} className={cn("min-h-7 rounded-full border border-edge bg-panel/80 px-2.5 text-[9px] text-muted transition hover:border-warning hover:bg-warning-soft hover:text-warning", preset.recommended && "border-warning/45 text-warning-foreground", seconds === preset.seconds && "border-warning bg-warning-soft text-warning")} onClick={() => { setUnit(preset.seconds < 60 ? "seconds" : "minutes"); onChange(preset.seconds); }}>{preset.label}</button>)}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[8px] text-muted"><span className={cn("size-1.5 rounded-full", seconds > 3_600 ? "bg-warning" : "bg-accent")} /> {seconds <= 30 ? "测试模式：不受工作与静默时段限制" : seconds > 3_600 ? "连续时长较长，建议优先选择 30–60 分钟" : seconds >= 1_800 ? "当前处于 30–60 分钟参考范围" : "提醒较频繁，可按工作节奏调整"}</div>
    </div>
  );
}

type SettingsTab = "detection" | "reminder" | "island" | "runtime" | "privacy";

const settingsTabs: Array<{ id: SettingsTab; label: string; description: string; icon: typeof Camera; tone: string }> = [
  { id: "detection", label: "检测", description: "摄像头、识别灵敏度与行为阈值", icon: Camera, tone: "bg-accent-soft text-accent" },
  { id: "reminder", label: "提醒", description: "久坐节奏、午间静默与通知方式", icon: Clock3, tone: "bg-warning-soft text-warning" },
  { id: "island", label: "灵动岛", description: "顶部状态、行为提醒与窗口协同", icon: Sparkles, tone: "bg-accent-soft text-accent" },
  { id: "runtime", label: "运行", description: "工作时段、后台运行与开机启动", icon: Activity, tone: "bg-info-soft text-info" },
  { id: "privacy", label: "数据与隐私", description: "本地统计、导出与数据清理", icon: ShieldCheck, tone: "bg-neutral-soft text-muted" },
];

function SettingsPage({ snapshot, error, onSave, onExport, onDeleteData, onEnableCamera, onRecalibrate }: { snapshot: AppSnapshot; error: string | null; onSave: (settings: AppSettings) => Promise<boolean>; onExport: () => void; onDeleteData: () => void; onEnableCamera: () => void; onRecalibrate: () => void }) {
  const [draft, setDraft] = useState(snapshot.settings);
  const [activeTab, setActiveTab] = useState<SettingsTab>("detection");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const persistedKey = JSON.stringify(snapshot.settings);
  const lastSyncedKey = useRef(persistedKey);
  useEffect(() => {
    setDraft((current) => JSON.stringify(current) === lastSyncedKey.current ? snapshot.settings : current);
    lastSyncedKey.current = persistedKey;
  }, [persistedKey, snapshot.settings]);
  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSaveState("idle");
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const setSedentarySeconds = (seconds: number) => {
    setSaveState("idle");
    setDraft((current) => ({ ...current, sedentarySeconds: seconds, sedentaryMinutes: Math.min(120, Math.max(1, Math.ceil(seconds / 60))) }));
  };
  const changed = useMemo(() => JSON.stringify(draft) !== JSON.stringify(snapshot.settings), [draft, snapshot.settings]);
  const save = async () => {
    setSaveState("saving");
    const ok = await onSave(draft);
    setSaveState(ok ? "saved" : "error");
    if (ok) window.setTimeout(() => setSaveState("idle"), 2_000);
  };
  const saveButton = <button className={primaryButtonClass} disabled={!changed || saveState === "saving"} onClick={() => void save()}>{saveState === "saving" ? "正在保存…" : saveState === "saved" ? "已保存并生效" : "保存并应用"}</button>;
  const activeMeta = settingsTabs.find((tab) => tab.id === activeTab) ?? settingsTabs[0]!;
  const ActiveIcon = activeMeta.icon;

  return (
    <div className="relative mx-auto grid h-full min-h-0 w-full max-w-[1680px] grid-rows-[auto_minmax(0,1fr)] gap-5 overflow-hidden px-[clamp(18px,3vw,56px)] py-[clamp(16px,2.4vh,32px)]">
      <header className="flex min-h-[68px] items-center justify-between gap-6">
        <div className="min-w-0"><span className={eyebrowClass}>偏好与隐私</span><h1 className="mb-1 mt-1.5 truncate text-[clamp(28px,2.2vw,38px)] font-black leading-tight tracking-[-.035em]">让提醒适合你的节奏</h1><p className="m-0 truncate text-xs leading-5 text-muted 2xl:text-sm">切换分类不会丢失修改；保存后立即作用于当前监测。</p></div>
        <div className="flex shrink-0 items-center gap-3">{changed && <span className="hidden items-center gap-1.5 text-xs font-bold text-warning sm:flex"><i className="size-1.5 rounded-full bg-warning" />有未保存的更改</span>}{saveButton}</div>
      </header>

      <div className="grid min-h-0 grid-cols-[88px_minmax(0,1fr)] gap-4 min-[1040px]:grid-cols-[200px_minmax(0,1fr)] 2xl:grid-cols-[240px_minmax(0,1fr)] 2xl:gap-6">
        <nav className="flex min-h-0 flex-col gap-1.5 rounded-[18px] border border-edge bg-panel-muted p-2" role="tablist" aria-label="偏好设置分类" aria-orientation="vertical">
          <span className="hidden px-3 pb-1 pt-2 text-xs font-extrabold tracking-[.14em] text-subtle min-[1040px]:block">设置分类</span>
          {settingsTabs.map(({ id, label, icon: Icon }) => <button key={id} id={`settings-tab-${id}`} title={label} className={cn("relative flex h-[64px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl px-2 text-[11px] font-bold text-muted transition hover:bg-panel hover:text-foreground min-[1040px]:h-14 min-[1040px]:flex-row min-[1040px]:justify-start min-[1040px]:gap-3 min-[1040px]:px-4 min-[1040px]:text-sm 2xl:h-16 2xl:text-base", activeTab === id && "bg-panel text-accent shadow-control before:absolute before:bottom-2 before:left-0 before:top-2 before:w-0.5 before:rounded-full before:bg-accent")} role="tab" aria-selected={activeTab === id} aria-controls={`settings-panel-${id}`} tabIndex={activeTab === id ? 0 : -1} onClick={() => setActiveTab(id)}><Icon className="shrink-0" size={19} /><span className="max-w-full truncate">{label}</span><ChevronRight className="ml-auto hidden text-subtle min-[1040px]:block" size={15} /></button>)}
          <div className="mt-auto hidden rounded-xl border border-edge-soft bg-panel/70 p-4 min-[1040px]:block"><strong className="block text-xs">统一保存</strong><p className="mb-0 mt-1 text-[11px] leading-4 text-muted">切换分类不会丢失当前修改。</p></div>
        </nav>

        <section className={cn(settingsPanelClass, "min-h-0 overflow-y-auto p-[clamp(20px,2.2vw,36px)]")} id={`settings-panel-${activeTab}`} role="tabpanel" aria-labelledby={`settings-tab-${activeTab}`}>
        <div className={sectionTitleClass}><span className={cn("grid size-12 place-items-center rounded-[15px] 2xl:size-14", activeMeta.tone)}><ActiveIcon size={24} /></span><div className="min-w-0"><h2>{activeMeta.label}</h2><p>{activeMeta.description}</p></div></div>

        {activeTab === "detection" && <div>
          <Toggle checked={draft.cameraEnabled} onChange={(value) => set("cameraEnabled", value)} label="使用摄像头进行姿态检测" description="关闭后自动切换到普通定时久坐提醒" />
          <div className={fieldGridClass}>
            <div className={selectFieldClass}><span>检测灵敏度</span><SelectField value={draft.sensitivity} options={[{ value: "low", label: "较低 · 减少误报" }, { value: "balanced", label: "平衡 · 推荐" }, { value: "high", label: "较高 · 更早识别" }]} ariaLabel="检测灵敏度" onChange={(value) => set("sensitivity", value)} /></div>
            <div className={selectFieldClass}><span>低头提醒阈值</span><SelectField value={draft.headDownMinutes} options={[1, 2, 3, 5, 10].map((value) => ({ value, label: `${value} 分钟` }))} ariaLabel="低头提醒阈值" onChange={(value) => set("headDownMinutes", value)} /></div>
          </div>
          {snapshot.monitoringMode === "camera" && snapshot.calibrated ? (
            <button className="inline-flex items-center gap-2 pt-4 text-sm font-bold text-accent hover:text-accent-strong" onClick={onRecalibrate}><RotateCcw size={18} /> 重新校准正常坐姿</button>
          ) : (
            <button className="inline-flex items-center gap-2 pt-4 text-sm font-bold text-accent hover:text-accent-strong" onClick={onEnableCamera}><Camera size={18} /> {snapshot.calibrated ? "重新启用姿势检测" : "开启姿势检测并校准"}</button>
          )}
        </div>}

        {activeTab === "reminder" && <div className="grid min-h-0 gap-x-5 md:grid-cols-2">
          <div className="min-w-0"><SedentaryThresholdControl seconds={draft.sedentarySeconds} onChange={setSedentarySeconds} /><div className={fieldGridClass}><div className={selectFieldClass}><span>重复提醒</span><SelectField disabled={draft.sedentarySeconds <= 30} value={draft.repeatReminderMinutes} options={draft.sedentarySeconds <= 30 ? [{ value: draft.repeatReminderMinutes, label: `${draft.sedentarySeconds} 秒 · 跟随测试阈值` }] : [5, 10, 15, 20, 30].map((value) => ({ value, label: `${value} 分钟` }))} ariaLabel="重复提醒" onChange={(value) => set("repeatReminderMinutes", value)} /></div><div className={selectFieldClass}><span>有效休息</span><SelectField value={draft.breakMinutes} options={[{ value: 1, label: "1 分钟 · 快速活动" }, { value: 2, label: "2 分钟 · 轻量休息" }, { value: 3, label: "3 分钟 · 日常节奏" }, { value: 5, label: "5 分钟 · 健康推荐" }, { value: 10, label: "10 分钟 · 充分休息" }]} ariaLabel="有效休息" onChange={(value) => set("breakMinutes", value)} /></div></div></div>
          <div className="min-w-0 border-edge-soft md:border-l md:pl-5"><Toggle checked={draft.quietHoursEnabled} onChange={(value) => set("quietHoursEnabled", value)} label="上午 / 下午模式（午间静默）" description="关闭为连续工作；开启后午间暂停提醒" /><div className={cn(fieldGridClass, !draft.quietHoursEnabled && "opacity-50")}><label><span>午间静默开始</span><input type="time" disabled={!draft.quietHoursEnabled} value={draft.quietStart} onChange={(event) => set("quietStart", event.target.value)} /></label><label><span>午间静默结束</span><input type="time" disabled={!draft.quietHoursEnabled} value={draft.quietEnd} onChange={(event) => set("quietEnd", event.target.value)} /></label></div><div className="grid gap-x-4 md:grid-cols-2"><Toggle checked={draft.repeatReminders} onChange={(value) => set("repeatReminders", value)} label="持续行为重复提醒" description={draft.sedentarySeconds <= 30 ? `测试时每 ${draft.sedentarySeconds} 秒重复` : "遵守同类提醒冷却时间"} /><Toggle checked={draft.meetingMode} onChange={(value) => set("meetingMode", value)} label="会议模式" description="仅显示安静通知" /><Toggle checked={draft.soundEnabled} onChange={(value) => set("soundEnabled", value)} label="通知声音" description="会议模式下仍保持静音" /></div></div>
        </div>}

        {activeTab === "island" && <div><Toggle checked={draft.islandEnabled} onChange={(value) => set("islandEnabled", value)} label="启用灵动岛" description="总开关；关闭后保留下面的行为偏好" /><div className={cn("grid gap-x-5 md:grid-cols-2", !draft.islandEnabled && "pointer-events-none opacity-50")}><Toggle checked={draft.islandReminderEnabled} onChange={(value) => set("islandReminderEnabled", value)} label="久坐提醒" description="显示休息、稍后和忽略操作" /><Toggle checked={draft.islandAwayEnabled} onChange={(value) => set("islandAwayEnabled", value)} label="离座状态" description="确认无人后保持显示计时暂停" /><Toggle checked={draft.islandHeadDownEnabled} onChange={(value) => set("islandHeadDownEnabled", value)} label="低头状态" description="持续确认低头后显示提示" /><Toggle checked={draft.islandBreakEnabled} onChange={(value) => set("islandBreakEnabled", value)} label="休息倒计时" description="休息期间显示倒计时与操作" /><Toggle checked={draft.islandPersistentStatusEnabled} onChange={(value) => set("islandPersistentStatusEnabled", value)} label="持续检测状态" description="检测中常驻紧凑状态，悬停查看详情" /><Toggle checked={draft.islandPausedStatusEnabled} onChange={(value) => set("islandPausedStatusEnabled", value)} label="暂停状态" description="暂停检测时显示恢复时间与暂停状态" /><Toggle checked={draft.islandPeekThroughEnabled} onChange={(value) => set("islandPeekThroughEnabled", value)} label="鼠标穿透效果" description="鼠标经过时显示局部透视放大镜；关闭后完全隐藏" /><Toggle checked={draft.islandAllowWithMainWindow} onChange={(value) => set("islandAllowWithMainWindow", value)} label="与普通窗口同时显示" description="主窗口可见时也显示灵动岛" /></div><Toggle checked={draft.islandPermanentCloseEnabled} onChange={(value) => set("islandPermanentCloseEnabled", value)} label="允许从灵动岛彻底关闭" description="开启后关闭菜单才显示彻底关闭选项" /></div>}

        {activeTab === "runtime" && <div><div className={fieldGridClass}><label><span>工作开始</span><input type="time" value={draft.workdayStart} onChange={(event) => set("workdayStart", event.target.value)} /></label><label><span>工作结束</span><input type="time" value={draft.workdayEnd} onChange={(event) => set("workdayEnd", event.target.value)} /></label></div><div className="grid gap-x-5 md:grid-cols-2"><Toggle checked={draft.runInBackground} onChange={(value) => set("runInBackground", value)} label="关闭窗口后在后台运行" description="隐藏后继续低功耗监测" /><Toggle checked={draft.autostart} onChange={(value) => set("autostart", value)} label="开机自动启动" description="登录系统后自动守护工作节奏" /><Toggle checked={draft.weekendEnabled} onChange={(value) => set("weekendEnabled", value)} label="周末启用" description="周六和周日也执行工作时段规则" /></div></div>}

        {activeTab === "privacy" && <div className="grid gap-4 md:grid-cols-2"><div><div className="rounded-[14px] border border-edge-soft bg-panel-muted p-4"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent"><ShieldCheck size={18} /></span><div><strong className="text-xs">原始画面不落盘</strong><p className="m-0 mt-0.5 text-[8px] text-muted">摄像头画面仅在本机内存中处理。</p></div></div><ul className="mt-3 grid list-none gap-2 p-0 text-[9px] text-muted [&_li]:flex [&_li]:items-center [&_li]:gap-2 [&_svg]:text-accent"><li><Eye size={14} /> 不进行身份识别</li><li><CameraOff size={14} /> 不保存视频或截图</li><li><LockKeyhole size={14} /> 不上传摄像头数据</li></ul><Toggle checked={draft.statisticsEnabled} onChange={(value) => set("statisticsEnabled", value)} label="保存本地行为统计" description="关闭后停止累计，已有数据不自动删除" /></div><div className="mt-4 rounded-[14px] border border-edge-soft bg-panel-muted p-4"><strong className="text-xs">{copy[languageOf(draft.language)].settings.language}</strong><SelectField value={draft.language} options={[{ value: "zh-CN", label: copy[languageOf(draft.language)].settings.chinese }, { value: "en-US", label: copy[languageOf(draft.language)].settings.english }]} ariaLabel={copy[languageOf(draft.language)].settings.language} onChange={(value) => set("language", value)} /></div></div><div><div className="rounded-[14px] border border-edge-soft bg-panel-muted p-4"><strong className="text-xs">本地数据管理</strong><p className="mb-3 mt-1 text-[9px] leading-4 text-muted">导出内容仅包含日期、时长、次数与结构化行为历史，不含图片。</p><div className="grid gap-2"><button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-edge bg-panel px-4 text-[10px] font-bold text-muted hover:bg-panel-muted" onClick={onExport}><Download size={16} /> 导出 CSV</button><button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-[10px] font-bold text-danger hover:bg-danger-soft" onClick={onDeleteData}><Trash2 size={16} /> 删除全部统计与行为历史</button></div><p className="mb-0 mt-3 text-[8px] leading-3.5 text-subtle">健康提醒用于日常行为提醒，不用于疾病诊断或替代医生建议。</p></div></div></div>}
        </section>
      </div>

      {saveState === "error" && <div className="absolute bottom-4 left-1/2 z-20 w-[min(520px,calc(100%-32px))] -translate-x-1/2 rounded-xl border border-warning/35 bg-warning-soft p-3 text-warning-foreground shadow-panel" role="alert"><strong className="text-xs">设置没有保存</strong><span className="ml-2 text-[9px]">{error ?? "请检查输入范围后重试，原有设置仍保持有效。"}</span></div>}
    </div>
  );
}
