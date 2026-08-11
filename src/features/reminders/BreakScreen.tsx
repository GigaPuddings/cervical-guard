import { Activity, Check, ChevronRight, Eye, Footprints, Trees, Wind } from "lucide-react";
import type { CSSProperties } from "react";
import type { AppSnapshot } from "../../types";
import { cn, formatDuration, percent } from "../../utils";
import { BreakWeatherPanel } from "../weather/WeatherOverview";
import { usePrimaryWeather } from "../weather/usePrimaryWeather";

const REST_GUIDES = [
  { icon: Footprints, title: "离开座位走几步", text: "轻强度活动也能打断连续久坐。" },
  { icon: Trees, title: "看看窗外的远处", text: "把视线移到约 6 米外，停留 20 秒。" },
  { icon: Eye, title: "完整眨眼几次", text: "放慢一点，让上下眼睑自然闭合再睁开。" },
  { icon: Activity, title: "活动一下脚踝", text: "脚尖回勾、下压各几次，动作保持轻松。" },
  { icon: Wind, title: "松开肩颈", text: "肩膀自然下沉，慢慢呼吸，不用刻意拉伸。" },
] as const;

export function BreakScreen({ snapshot, onEnd }: { snapshot: AppSnapshot; onEnd: () => void }) {
  const total = snapshot.settings.breakMinutes * 60;
  const done = total - snapshot.breakRemainingSeconds;
  const timeUp = snapshot.breakRemainingSeconds === 0;
  // 每次休息只展示一条短提示；随休息阶段最多轮换三次，并用已完成休息数
  // 改变下一次的起始提示，形成轻量知识库而不堆叠信息。
  const phase = Math.min(2, Math.floor((Math.max(0, done) / Math.max(1, total)) * 3));
  const guide = REST_GUIDES[(snapshot.today.breakCount + phase) % REST_GUIDES.length]!;
  const GuideIcon = guide.icon;
  const degrees = percent(done, total) * 3.6;
  const weather = usePrimaryWeather();
  const showWeather = Boolean(weather.location);
  return (
    <main className="relative grid h-full place-items-center overflow-hidden bg-break px-5 text-inverse">
      <div className="pointer-events-none absolute -right-52 -top-40 size-[580px] rounded-full border border-inverse/10" />
      <div className="pointer-events-none absolute -bottom-20 -left-28 size-[330px] rounded-full border border-inverse/10" />
      <div className={cn(
        "relative z-[1] grid w-full max-w-[560px] grid-cols-1 items-center gap-6",
        showWeather && "max-w-[860px] grid-cols-[minmax(0,560px)_260px]",
      )}>
      <section className="flex min-w-0 flex-col items-center text-center">
        {timeUp ? (
          <>
            <span className="text-[10px] font-extrabold tracking-[.16em] text-inverse-muted">休息时间到</span>
            <h1 className="my-4 font-serif text-[clamp(36px,5vw,54px)] font-medium leading-[1.12]">准备好了<br />就继续吧。</h1>
            <div className="mb-4 grid size-[180px] place-items-center rounded-full bg-[conic-gradient(var(--theme-break-soft)_360deg,var(--theme-edge)_0)] p-2">
              <div className="grid size-full place-content-center rounded-full bg-break text-center shadow-inner"><strong className="text-2xl text-break-soft">00:00</strong><span className="mt-1.5 text-[9px] text-inverse-muted">建议休息 {snapshot.settings.breakMinutes} 分钟</span></div>
            </div>
            <div className="flex w-full max-w-[400px] items-center gap-3 rounded-2xl border border-break-soft/30 bg-inverse/10 px-4 py-3 text-left">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-break-soft/20 text-break-soft"><Check size={21} /></span>
              <div>
                <strong className="text-xs">确认结束休息，恢复检测</strong>
                <p className="mt-1 text-[9px] text-inverse-muted">
                  {snapshot.monitoringMode === "camera"
                    ? snapshot.breakRestSeconds > 0
                      ? `本次已检测到有效休息 ${formatDuration(snapshot.breakRestSeconds)}，做得不错。`
                      : "摄像头检测已就绪，确认后将立即恢复监测。"
                    : "确认后将恢复定时提醒。"}
                </p>
              </div>
            </div>
            <button className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-break-soft px-5 text-xs font-bold text-break hover:bg-inverse" onClick={onEnd}>
              <Check size={18} /> 确认结束休息 <ChevronRight size={17} />
            </button>
          </>
        ) : (
          <>
            <span className="text-[10px] font-extrabold tracking-[.16em] text-inverse-muted">休息进行中</span>
            <h1 className="my-4 font-serif text-[clamp(36px,5vw,54px)] font-medium leading-[1.12]">把这一小段时间<br />还给自己。</h1>
            <div className="mb-4 grid size-[180px] place-items-center rounded-full bg-[conic-gradient(var(--theme-break-soft)_var(--break-progress),var(--theme-edge)_0)] p-2" style={{ "--break-progress": `${degrees}deg` } as CSSProperties}>
              <div className="grid size-full place-content-center rounded-full bg-break text-center shadow-inner"><strong className="text-2xl">{formatDuration(snapshot.breakRemainingSeconds)}</strong><span className="mt-1.5 text-[9px] text-inverse-muted">建议休息 {snapshot.settings.breakMinutes} 分钟</span></div>
            </div>
            <div className="flex w-full max-w-[400px] items-center gap-3 rounded-2xl border border-inverse/15 bg-inverse/10 px-4 py-3 text-left" aria-live="polite"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-inverse/10"><GuideIcon size={21} /></span><div><span className="text-[7px] font-bold tracking-[.13em] text-break-soft">此刻可以做</span><strong className="mt-0.5 block text-xs">{guide.title}</strong><p className="mt-1 text-[9px] text-inverse-muted">{guide.text}</p></div></div>
            {snapshot.monitoringMode === "camera" && (
              <p className="mt-3 text-[9px] text-break-soft" aria-live="polite">
                {snapshot.breakRestSeconds > 0
                  ? `已检测到有效休息 ${formatDuration(snapshot.breakRestSeconds)}，继续保持`
                  : "摄像头正在安静观测：站起来或离开座位才会计入有效休息"}
              </p>
            )}
            <button className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-inverse px-5 text-xs font-bold text-break hover:bg-break-soft" onClick={onEnd}>
              <Check size={18} /> 提前结束休息 <ChevronRight size={17} />
            </button>
          </>
        )}
        <small className="mt-4 text-[8px] text-inverse-muted">动作仅为日常放松建议，如感到不适请停止并咨询专业人士。</small>
      </section>
      {showWeather && <BreakWeatherPanel weather={weather} />}
      </div>
    </main>
  );
}
