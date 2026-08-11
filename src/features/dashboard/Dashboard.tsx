import {
  Activity,
  BarChart3,
  BellOff,
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
import type { AppPage, AppSettings, AppSnapshot, DailyStatistics, LandmarkPoint } from "../../types";
import type { VisionStatus } from "../../vision/useVisionMonitor";
import { cn, compactDuration, formatDuration, percent } from "../../utils";

interface DashboardProps {
  snapshot: AppSnapshot;
  page: AppPage;
  statistics: DailyStatistics[];
  visionStatus: VisionStatus;
  streamUrl: string | null;
  previewError: string | null;
  landmarks: LandmarkPoint[];
  error: string | null;
  onPage: (page: AppPage) => void;
  onPause: (minutes: number | null) => void;
  onResume: () => void;
  onStartBreak: () => void;
  onSaveSettings: (settings: AppSettings) => Promise<boolean>;
  onExport: () => void;
  onDeleteData: () => void;
  onRecalibrate: () => void;
  onRetryPreview: () => void;
}

const navItems: Array<{ page: AppPage; label: string; icon: typeof LayoutDashboard }> = [
  { page: "today", label: "今日概览", icon: LayoutDashboard },
  { page: "statistics", label: "习惯趋势", icon: BarChart3 },
  { page: "weather", label: "天气与活动", icon: CloudSun },
  { page: "settings", label: "偏好设置", icon: Settings },
];

export function Dashboard(props: DashboardProps) {
  const { snapshot, page, onPage } = props;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  return (
    <main className="grid h-full min-h-0 overflow-hidden bg-canvas text-foreground md:grid-cols-[216px_minmax(0,1fr)]">
      <aside className={cn(
        "fixed inset-y-0 left-0 z-30 flex w-[216px] flex-col border-r border-edge bg-sidebar/90 px-4 py-6 backdrop-blur-xl transition-transform md:static md:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full",
      )}>
        <div className="flex items-center justify-between px-2">
          <Brand />
          <button className="grid size-9 place-items-center rounded-xl hover:bg-accent-soft md:hidden" aria-label="关闭导航" onClick={() => setSidebarOpen(false)}><X size={18} /></button>
        </div>

        <div className="relative mt-7 rounded-2xl border border-edge bg-panel p-3 shadow-control">
          <StatusPill snapshot={snapshot} />
          <div className="mt-3">
            {snapshot.lifecycle === "monitoring" || snapshot.lifecycle === "degraded" ? (
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
          <span className="px-3 pb-2 text-[10px] font-bold tracking-[.18em] text-muted">空间</span>
          {navItems.map(({ page: target, label, icon: Icon }) => (
            <button
              key={target}
              className={cn(
                "relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-muted transition-colors hover:bg-accent-soft hover:text-accent-strong",
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
            <div className="min-w-0"><strong className="block text-xs">本地隐私模式</strong><small className="mt-0.5 block truncate text-[9px] text-muted">画面不保存、不上传</small></div>
          </div>
        </div>
        <div className="mt-3 px-2">
          <button className="flex h-9 items-center gap-2 text-xs font-semibold text-muted hover:text-accent"><CircleHelp size={16} /> 使用帮助</button>
          <p className="mt-1 text-[8px] text-subtle">健康提醒 v0.1.0 · 行为提醒工具</p>
        </div>
      </aside>

      {sidebarOpen && <button className="fixed inset-0 z-20 bg-panel-strong/25 md:hidden" aria-label="关闭导航" onClick={() => setSidebarOpen(false)} />}

      <section className="relative min-h-0 min-w-0 overflow-hidden">
        <button className="absolute left-3 top-3 z-10 grid size-9 place-items-center rounded-xl border border-edge bg-panel shadow-control md:hidden" aria-label="打开导航" onClick={() => setSidebarOpen(true)}><Menu size={18} /></button>
        <div className={cn("h-full min-h-0", page === "settings" ? "overflow-y-auto" : "overflow-hidden")}>
          {page === "today" && <TodayPage {...props} />}
          {page === "statistics" && <StatisticsPage statistics={props.statistics} snapshot={snapshot} />}
          {page === "weather" && <WeatherPage />}
          {page === "settings" && (
            <SettingsPage
              snapshot={snapshot}
              error={props.error}
              onSave={props.onSaveSettings}
              onExport={props.onExport}
              onDeleteData={props.onDeleteData}
              onRecalibrate={props.onRecalibrate}
            />
          )}
        </div>
      </section>
    </main>
  );
}

function TodayPage({ snapshot, visionStatus, streamUrl, previewError, landmarks, error, onStartBreak, onPage, onRetryPreview }: DashboardProps) {
  const thresholdSeconds = snapshot.settings.sedentarySeconds;
  const isReminderTest = thresholdSeconds <= 30;
  const schedulePause = reminderSchedulePause(snapshot.settings);
  const progress = percent(snapshot.seatedSeconds, thresholdSeconds);
  const reminderTiming = reminderTimingCopy(snapshot, schedulePause);
  const isCamera = snapshot.monitoringMode === "camera";
  // 追踪应用内预览首帧是否已渲染,确保骨架不会在画面到达前出现。
  const [imgLoaded, setImgLoaded] = useState(false);
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
  const behavior = isCamera
    ? behaviorCopy[snapshot.behavior]
    : { title: "定时提醒已开启", text: "达到阈值后会提醒你起身活动", tone: "healthy" };

  return (
    <div className="today-page-layout relative grid h-full min-h-0 grid-rows-[162px_12px_minmax(0,1fr)_23px_124px] overflow-hidden px-6 pb-[58px] pt-5">
      <header className="grid min-h-0 grid-cols-1 gap-5 min-[1180px]:grid-cols-[minmax(340px,1fr)_minmax(430px,514px)]">
        <div className="min-w-0 self-start pt-3"><span className="text-[11px] font-extrabold tracking-[.14em] text-accent">今天 · {new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date())}</span><h1 className="mt-5 text-[32px] font-black leading-none tracking-[-.04em]">照顾好当下的姿势</h1><p className="mt-5 text-[13px] text-muted">保持专注即可，健康提醒只在需要时出现。</p></div>
        <div className="hidden h-full min-w-0 items-center justify-end gap-4 min-[1180px]:flex">
          <div className="w-[220px] shrink-0 translate-y-1.5 empty:hidden"><TodayWeatherHeader /></div>
          <button className="inline-flex h-11 w-[168px] shrink-0 translate-y-4 items-center justify-center gap-2 rounded-full bg-accent-soft px-5 text-[12px] font-bold text-foreground transition-colors hover:bg-accent-soft-strong" onClick={onStartBreak}><Coffee size={17} /> 主动休息 <ChevronRight size={15} /></button>
        </div>
      </header>

      {(error || (isCamera && visionStatus === "error")) && (
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
          <div className="flex items-center justify-between px-5"><span className="flex items-center gap-2 text-xs font-extrabold"><Camera size={17} /> 检测状态</span><span className={cn("rounded-full px-3 py-1 text-[9px] font-bold", snapshot.lifecycle === "paused" ? "bg-warning-soft text-warning" : snapshot.frameQuality === "good" ? "bg-accent-soft text-accent" : "bg-warning-soft text-warning")}>{snapshot.lifecycle === "paused" ? "静默中" : snapshot.frameQuality === "good" ? "检测中" : "待确认"}</span></div>
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
              <div className="grid size-full -translate-y-4 place-content-center justify-items-center text-muted"><ScanFace size={96} strokeWidth={1.15} /></div>
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
            <div className={cn("absolute inset-x-0 bottom-0 bg-gradient-to-t from-panel-strong/80 to-transparent px-4 pt-8 text-inverse", snapshot.lifecycle === "paused" ? "pb-6 text-center" : "pb-3")}>
              <strong className="block text-[11px]">{snapshot.lifecycle === "paused" ? "摄像头未启用" : isCamera ? (visionStatus === "ready" ? (imgLoaded ? "正在实时检测" : "正在连接视频流") : "正在连接检测") : "定时提醒模式"}</strong>
              <small className={cn("block truncate text-[8px] text-inverse/60", snapshot.lifecycle === "paused" ? "mt-2" : "mt-1")}>{snapshot.lifecycle === "paused" ? "恢复后继续本地姿态识别" : isCamera ? qualityLabel(snapshot.frameQuality) : "仅根据启用时间提供久坐提醒"}</small>
            </div>
          </div>
          <button className="mx-4 grid min-w-0 grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2 text-left hover:bg-panel-muted" onClick={() => onPage("settings")}><span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent"><ShieldCheck size={18} /></span><span className="min-w-0"><strong className="block text-[10px]">隐私与设备</strong><small className="mt-1 block truncate text-[9px] text-muted">画面仅在本机处理，不保存，不上传</small></span><ChevronRight size={16} className="text-muted" /></button>
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

function StatisticsPage({ statistics, snapshot }: { statistics: DailyStatistics[]; snapshot: AppSnapshot }) {
  const [range, setRange] = useState<7 | 30>(7);
  const rows = statistics.slice(-range);
  const maxSeated = Math.max(1, ...rows.map((item) => item.seatedSeconds));
  const totalSeated = rows.reduce((sum, item) => sum + item.seatedSeconds, 0);
  const totalBreaks = rows.reduce((sum, item) => sum + item.breakCount, 0);
  const totalReminders = rows.reduce((sum, item) => sum + item.reminderCount, 0);
  const completion = totalReminders ? Math.round((totalBreaks / totalReminders) * 100) : 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-5 xl:p-7">
      <header className="flex shrink-0 items-end justify-between gap-4"><div><span className="text-[10px] font-extrabold tracking-[.16em] text-accent">仅保存在本机</span><h1 className="mt-1 text-[clamp(24px,2.4vw,34px)] font-black tracking-[-.04em]">你的习惯趋势</h1><p className="mt-1 text-xs text-muted">看变化即可，不给身体表现打分。</p></div><div className="flex rounded-xl bg-edge-soft p-1 text-[10px] font-bold"><button className={cn("rounded-lg px-3 py-2 text-muted", range === 7 && "bg-panel text-accent shadow-control")} onClick={() => setRange(7)}>近 7 天</button><button className={cn("rounded-lg px-3 py-2 text-muted", range === 30 && "bg-panel text-accent shadow-control")} onClick={() => setRange(30)}>近 30 天</button></div></header>
      <div className="grid shrink-0 grid-cols-3 gap-3">
        <section className="rounded-2xl border border-edge bg-panel px-4 py-3 shadow-panel"><span className="text-[9px] text-muted">日均坐姿</span><strong className="mt-1 block text-2xl tracking-[-.04em]">{compactDuration(totalSeated / Math.max(1, rows.length))}</strong><small className="text-[8px] text-subtle">稳定坐姿累计</small></section>
        <section className="rounded-2xl border border-edge bg-panel px-4 py-3 shadow-panel"><span className="text-[9px] text-muted">最长连续坐姿</span><strong className="mt-1 block text-2xl tracking-[-.04em]">{compactDuration(Math.max(0, ...rows.map((item) => item.longestSeatedSeconds)))}</strong><small className="text-[8px] text-subtle">逐步缩短即可</small></section>
        <section className="rounded-2xl border border-edge bg-panel px-4 py-3 shadow-panel"><span className="text-[9px] text-muted">休息完成率</span><strong className="mt-1 block text-2xl tracking-[-.04em]">{Math.min(100, completion)}%</strong><small className="text-[8px] text-subtle">{totalBreaks} 次完成休息</small></section>
      </div>
      <section className="flex min-h-0 flex-1 flex-col rounded-card border border-edge bg-panel px-5 pb-3 pt-4 shadow-panel">
        <div className="flex shrink-0 items-center justify-between"><div><span className="text-[9px] font-extrabold tracking-[.14em] text-accent">坐姿时长</span><h2 className="mt-0.5 text-lg font-black">每日变化</h2></div><span className="flex items-center gap-2 text-[9px] text-muted"><i className="size-2 rounded bg-accent" /> 坐姿时长</span></div>
        <div className={cn("mt-2 flex min-h-[130px] flex-1 items-end gap-3 border-b border-edge bg-[linear-gradient(to_bottom,var(--theme-edge-soft)_1px,transparent_1px)] bg-[size:100%_25%] px-1 pt-5", range === 30 && "gap-1")}>
          {rows.map((item, index) => {
            const date = new Date(`${item.localDate}T00:00:00`);
            return <div className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end" key={item.localDate}><div className="pointer-events-none absolute -top-1 -translate-y-full rounded-md bg-panel-strong px-2 py-1 text-[7px] text-inverse opacity-0 transition-opacity group-hover:opacity-100">{compactDuration(item.seatedSeconds)}</div><div className="w-[min(28px,70%)] min-w-1 rounded-t-md bg-gradient-to-t from-accent to-accent-strong" style={{ height: `${Math.max(4, (item.seatedSeconds / maxSeated) * 100)}%` }} /><span className="h-5 pt-1.5 text-[8px] text-muted">{range === 7 || index % 5 === 0 ? `${date.getMonth() + 1}/${date.getDate()}` : ""}</span></div>;
          })}
        </div>
      </section>
      <div className="grid h-[82px] shrink-0 grid-cols-[1.4fr_.6fr] gap-3">
        <section className="flex items-center gap-3 rounded-2xl border border-edge bg-panel px-4 shadow-panel"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-warning-soft text-warning"><Sparkles size={19} /></span><div className="min-w-0"><span className="text-[8px] font-extrabold tracking-[.12em] text-accent">本周观察</span><h3 className="truncate text-xs font-bold">{snapshot.today.breakCount > 0 ? "你正在主动打断久坐" : "今天可以从一次主动休息开始"}</h3><p className="truncate text-[8px] text-muted">短暂走动或看向远处，都有意义。</p></div></section>
        <section className="flex items-center gap-4 rounded-2xl border border-edge bg-panel px-4 shadow-panel"><div><span className="text-[8px] font-extrabold tracking-[.12em] text-accent">低头时长</span><div className="mt-1 flex items-center gap-1 text-xs font-bold"><HeartPulse size={15} /> 近 7 天</div></div><div className="flex h-10 min-w-0 flex-1 items-end gap-1">{rows.slice(-7).map((item) => <i className="min-h-1 flex-1 rounded-t-sm bg-warning" key={item.localDate} style={{ height: `${Math.max(8, percent(item.headDownSeconds, 3_600))}%` }} />)}</div></section>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (checked: boolean) => void; label: string; description: string }) {
  return (
    <label className="relative flex min-h-[61px] cursor-pointer items-center border-b border-edge-soft">
      <div className="flex flex-1 flex-col gap-1"><strong className="text-xs">{label}</strong><small className="text-[9px] text-muted">{description}</small></div>
      <input className="peer sr-only" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="relative h-[22px] w-[38px] shrink-0 rounded-full bg-edge transition after:absolute after:left-[3px] after:top-[3px] after:size-4 after:rounded-full after:bg-panel after:shadow-sm after:transition after:content-[''] peer-checked:bg-accent peer-checked:after:translate-x-4" />
    </label>
  );
}

const primaryButtonClass = "inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-inverse shadow-control transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50";
const settingsPanelClass = "rounded-[18px] border border-edge bg-panel p-6 shadow-panel";
const sectionTitleClass = "mb-1 flex items-center gap-3 border-b border-edge-soft pb-4 [&_h2]:mb-1 [&_h2]:text-[17px] [&_p]:m-0 [&_p]:text-[10px] [&_p]:text-muted";
const fieldGridClass = "grid grid-cols-1 gap-3 border-b border-edge-soft py-4 sm:grid-cols-2 [&_label]:flex [&_label]:flex-col [&_label]:gap-2 [&_label>span]:text-[10px] [&_label>span]:font-bold [&_label>span]:text-muted [&_input]:h-10 [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-edge [&_input]:bg-field [&_input]:px-3 [&_input]:text-[11px] disabled:[&_input]:cursor-not-allowed";
const selectFieldClass = "flex min-w-0 flex-col gap-2 [&>span]:text-[10px] [&>span]:font-bold [&>span]:text-muted";
const eyebrowClass = "text-[10px] font-extrabold tracking-[.15em] text-accent";

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
  if (!inSpan(minute, parse(settings.workdayStart), parse(settings.workdayEnd))) return "当前不在工作提醒时段";
  const quietStart = parse(settings.quietStart);
  const quietEnd = parse(settings.quietEnd);
  if (settings.quietHoursEnabled && quietStart !== quietEnd && inSpan(minute, quietStart, quietEnd)) return `静默中 · ${settings.quietEnd} 恢复提醒`;
  return null;
}

function reminderTimingCopy(snapshot: AppSnapshot, schedulePause: string | null): { clock: string; countdown: string; status: string } {
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
    <div className="mt-4 rounded-[14px] border border-warning/25 bg-warning-soft p-4">
      <div className="flex flex-col items-start justify-between gap-2 sm:flex-row">
        <div className="flex items-baseline gap-2"><span className="text-[10px] font-bold text-muted">久坐首次提醒</span><strong className="text-[17px] text-warning">{intervalLabel(seconds)}</strong></div>
        <small className="max-w-[260px] text-left text-[9px] leading-4 text-muted sm:text-right">保存后立即应用。10/30 秒为测试模式，不受工作与静默时段限制。</small>
      </div>
      <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-warning/20 bg-panel/65 px-3 py-2.5 text-left">
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-warning-soft text-warning"><HeartPulse size={15} /></span>
        <div><strong className="text-[9px] text-warning-foreground">健康参考</strong><p className="mt-0.5 text-[8px] leading-3.5 text-muted">建议减少连续久坐，并用轻活动打断。国内疾控材料常采用 30–60 分钟节奏；45 分钟是兼顾专注的产品推荐，并非医疗处方。</p></div>
      </div>
      <div className="mt-3.5 grid grid-cols-[minmax(0,1fr)_105px] gap-2">
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
      <div className="mt-3 flex items-center gap-1.5 text-[8px] text-muted"><span className={cn("size-1.5 rounded-full", seconds > 3_600 ? "bg-warning" : "bg-accent")} /> {seconds <= 30 ? "测试模式已就绪，到达阈值将立即显示顶部提醒" : seconds > 3_600 ? "当前连续时长较长，建议优先选择 30–60 分钟" : seconds >= 1_800 ? "当前节奏位于 30–60 分钟健康参考范围" : "提醒会比较频繁，可按工作节奏自行调整"}</div>
    </div>
  );
}

function SettingsPage({ snapshot, error, onSave, onExport, onDeleteData, onRecalibrate }: { snapshot: AppSnapshot; error: string | null; onSave: (settings: AppSettings) => Promise<boolean>; onExport: () => void; onDeleteData: () => void; onRecalibrate: () => void }) {
  const [draft, setDraft] = useState(snapshot.settings);
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

  return (
    <div className="mx-auto max-w-[1400px] px-[clamp(20px,4vw,54px)] py-8 pb-32">
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end"><div><span className={eyebrowClass}>偏好与隐私</span><h1 className="mb-1 mt-2 text-[31px] font-black leading-tight tracking-[-.035em]">让提醒适合你的节奏</h1><p className="m-0 text-[13px] text-muted">修改会在保存后直接作用于当前监测，不需要暂停或重新启动。</p></div>{saveButton}</div>
      {saveState === "error" && <div className="mb-5 flex items-center gap-3 rounded-xl border border-warning/35 bg-warning-soft p-3 text-warning-foreground"><div className="flex flex-col gap-0.5"><strong className="text-xs">设置没有保存</strong><span className="text-[10px]">{error ?? "请检查输入范围后重试，原有设置仍保持有效。"}</span></div></div>}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_285px]">
        <div className="grid gap-4">
          <section className={settingsPanelClass}>
            <div className={sectionTitleClass}><span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent"><Camera size={20} /></span><div><h2>检测设置</h2><p>管理摄像头、识别灵敏度与行为阈值。</p></div></div>
            <Toggle checked={draft.cameraEnabled} onChange={(value) => set("cameraEnabled", value)} label="使用摄像头进行姿态检测" description="关闭后自动切换到普通定时久坐提醒" />
            <div className={fieldGridClass}>
              <div className={selectFieldClass}><span>检测灵敏度</span><SelectField value={draft.sensitivity} options={[{ value: "low", label: "较低 · 减少误报" }, { value: "balanced", label: "平衡 · 推荐" }, { value: "high", label: "较高 · 更早识别" }]} ariaLabel="检测灵敏度" onChange={(value) => set("sensitivity", value)} /></div>
              <div className={selectFieldClass}><span>低头提醒阈值</span><SelectField value={draft.headDownMinutes} options={[1, 2, 3, 5, 10].map((value) => ({ value, label: `${value} 分钟` }))} ariaLabel="低头提醒阈值" onChange={(value) => set("headDownMinutes", value)} /></div>
            </div>
            <button className="inline-flex items-center gap-2 pt-3 text-[11px] font-bold text-accent hover:text-accent-strong" onClick={onRecalibrate}><RotateCcw size={16} /> 重新校准正常坐姿</button>
          </section>

          <section className={settingsPanelClass}>
            <div className={sectionTitleClass}><span className="grid size-10 place-items-center rounded-xl bg-warning-soft text-warning"><Clock3 size={20} /></span><div><h2>提醒节奏</h2><p>设置久坐、重复提醒与有效休息时长。</p></div></div>
            <SedentaryThresholdControl seconds={draft.sedentarySeconds} onChange={setSedentarySeconds} />
            <div className={fieldGridClass}>
              <div className={selectFieldClass}><span>重复提醒</span><SelectField disabled={draft.sedentarySeconds <= 30} value={draft.repeatReminderMinutes} options={draft.sedentarySeconds <= 30 ? [{ value: draft.repeatReminderMinutes, label: `${draft.sedentarySeconds} 秒 · 跟随测试阈值` }] : [5, 10, 15, 20, 30].map((value) => ({ value, label: `${value} 分钟` }))} ariaLabel="重复提醒" onChange={(value) => set("repeatReminderMinutes", value)} /></div>
              <div className={selectFieldClass}><span>有效休息</span><SelectField value={draft.breakMinutes} options={[{ value: 1, label: "1 分钟 · 快速活动" }, { value: 2, label: "2 分钟 · 轻量休息" }, { value: 3, label: "3 分钟 · 日常节奏" }, { value: 5, label: "5 分钟 · 健康推荐" }, { value: 10, label: "10 分钟 · 充分休息" }]} ariaLabel="有效休息" onChange={(value) => set("breakMinutes", value)} /></div>
            </div>
            <Toggle checked={draft.quietHoursEnabled} onChange={(value) => set("quietHoursEnabled", value)} label="启用静默时段" description="默认启用；关闭后保留时间设置，但到点仍会正常提醒" />
            <div className={cn(fieldGridClass, !draft.quietHoursEnabled && "opacity-50")}>
              <label><span>静默时段开始</span><input type="time" disabled={!draft.quietHoursEnabled} value={draft.quietStart} onChange={(event) => set("quietStart", event.target.value)} /></label>
              <label><span>静默时段结束</span><input type="time" disabled={!draft.quietHoursEnabled} value={draft.quietEnd} onChange={(event) => set("quietEnd", event.target.value)} /></label>
            </div>
            <Toggle checked={draft.repeatReminders} onChange={(value) => set("repeatReminders", value)} label="行为持续时重复提醒" description={draft.sedentarySeconds <= 30 ? `测试模式下每 ${draft.sedentarySeconds} 秒重复一次，方便连续验证` : "同类提醒会遵守冷却时间，不会连续弹出"} />
            <Toggle checked={draft.meetingMode} onChange={(value) => set("meetingMode", value)} label="会议模式" description="降低提醒等级，仅显示安静通知" />
            <Toggle checked={draft.soundEnabled} onChange={(value) => set("soundEnabled", value)} label="通知声音" description="正式提醒播放系统提示音；会议模式开启时仍保持静音" />
          </section>

          <section className={settingsPanelClass}>
            <div className={sectionTitleClass}><span className="grid size-10 place-items-center rounded-xl bg-info-soft text-info"><Activity size={20} /></span><div><h2>运行方式</h2><p>决定应用何时工作，以及是否随系统启动。</p></div></div>
            <div className={fieldGridClass}><label><span>工作开始</span><input type="time" value={draft.workdayStart} onChange={(event) => set("workdayStart", event.target.value)} /></label><label><span>工作结束</span><input type="time" value={draft.workdayEnd} onChange={(event) => set("workdayEnd", event.target.value)} /></label></div>
            <Toggle checked={draft.runInBackground} onChange={(value) => set("runInBackground", value)} label="关闭窗口后在后台运行" description="最小化或隐藏后继续低功耗监测" />
            <Toggle checked={draft.autostart} onChange={(value) => set("autostart", value)} label="开机自动启动" description="登录系统后自动开始守护工作节奏" />
            <Toggle checked={draft.weekendEnabled} onChange={(value) => set("weekendEnabled", value)} label="周末启用" description="在周六和周日也运行工作时段规则" />
            <Toggle checked={draft.statisticsEnabled} onChange={(value) => set("statisticsEnabled", value)} label="保存本地行为统计" description="关闭后停止累计时长与次数，已有数据可单独清空" />
          </section>
        </div>

        <aside className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <section className="rounded-[18px] border border-edge bg-panel p-6 shadow-panel">
            <div className="mb-4 grid size-[52px] place-items-center rounded-2xl bg-accent-soft text-accent"><ShieldCheck size={28} /></div><span className={eyebrowClass}>隐私承诺</span><h3 className="mb-2 mt-2 text-[17px] font-bold">原始画面不落盘</h3><p className="text-[10px] leading-4 text-muted">姿态模型在本机内存中处理画面。数据库只包含设置、会话与汇总统计。</p>
            <ul className="mt-4 grid list-none gap-2.5 p-0 text-[10px] text-muted [&_li]:flex [&_li]:items-center [&_li]:gap-2 [&_svg]:text-accent"><li><Eye size={15} /> 不进行身份识别</li><li><CameraOff size={15} /> 不保存视频或截图</li><li><LockKeyhole size={15} /> 不上传摄像头数据</li></ul>
          </section>
          <section className="rounded-[18px] border border-edge bg-panel p-6 shadow-panel"><span className={eyebrowClass}>本地数据</span><h3 className="mb-2 mt-2 text-[17px] font-bold">导出或清空统计</h3><p className="text-[10px] leading-4 text-muted">导出文件仅包含日期、时长与次数，不含任何图片。</p><button className="mt-2 inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl border border-edge bg-panel px-4 text-[11px] font-bold text-muted hover:bg-panel-muted" onClick={onExport}><Download size={17} /> 导出 CSV</button><button className="mt-2 inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl px-4 text-[11px] font-bold text-danger hover:bg-danger-soft" onClick={onDeleteData}><Trash2 size={17} /> 删除全部统计</button></section>
          <p className="px-3 text-center text-[9px] leading-4 text-subtle sm:col-span-2 xl:col-span-1">健康提醒是日常健康行为提醒工具，不用于疾病诊断、治疗或替代医生建议。</p>
        </aside>
      </div>
      <div className={cn(
        "fixed bottom-8 left-1/2 z-[180] flex min-h-[62px] w-[min(570px,calc(100vw-24px))] -translate-x-1/2 items-center justify-between gap-4 rounded-[18px] border border-edge bg-panel-strong/95 py-2 pl-4 pr-2 text-inverse shadow-panel backdrop-blur-xl transition md:left-[calc(216px+(100vw-216px)/2)] md:w-[min(570px,calc(100vw-250px))]",
        changed ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
      )} role="status"><div className="grid grid-cols-[8px_1fr] items-center gap-x-2"><span className="size-[7px] rounded-full bg-warning" /><strong className="text-[11px]">有未保存的更改</strong><small className="col-start-2 mt-0.5 text-[8px] text-inverse-muted">保存后当前监测会立即采用新配置</small></div>{saveButton}</div>
    </div>
  );
}
