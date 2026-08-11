import { AlertTriangle, ArrowLeft, ArrowRight, Camera, Check, LoaderCircle, ScanFace, SunMedium, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { Brand } from "../../components/Brand";
import { SelectField } from "../../components/SelectField";
import { useVisionMonitor } from "../../vision/useVisionMonitor";

interface CalibrationProps {
  initialCameraId: string;
  busy: boolean;
  onComplete: (baseline: number, cameraId: string) => void;
  onTimerFallback: () => void;
  onBack: () => void;
}

export function Calibration({ initialCameraId, busy, onComplete, onTimerFallback, onBack }: CalibrationProps) {
  const [cameraId, setCameraId] = useState(initialCameraId);
  const vision = useVisionMonitor({ active: true, cameraId, baseline: null });
  const validSamples = vision.calibrationSamples;
  const progress = Math.min(100, Math.round((validSamples.length / 36) * 100));
  const observation = vision.observation;
  const baseline = useMemo(() => {
    if (!validSamples.length) return -0.9;
    const sorted = [...validSamples].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? -0.9;
  }, [validSamples]);

  const qualityChecks = [
    { label: "头部完整清晰可见", ok: Boolean(observation?.person.present && observation.person.confidence > 0.6), icon: ScanFace },
    { label: "头部位置保持稳定", ok: Boolean(observation && observation.posture.confidence > 0.55), icon: UserRound },
    { label: "光线适合识别", ok: Boolean(observation && observation.frameQuality !== "dark"), icon: SunMedium },
  ];
  const ready = progress >= 100 && qualityChecks.every((item) => item.ok) && observation?.frameQuality === "good";

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-canvas">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-edge bg-panel/75 px-[clamp(24px,4vw,56px)] backdrop-blur-xl">
        <Brand />
        <button className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-transparent px-3 text-[13px] font-bold text-muted transition hover:bg-accent-soft" onClick={onBack}><ArrowLeft size={17} /> 返回</button>
      </header>
      <section className="mx-auto grid min-h-0 w-full max-w-[1580px] flex-1 grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)] gap-[clamp(20px,4vw,48px)] px-[clamp(24px,4.5vw,60px)] py-[clamp(16px,2.5vh,24px)]">
        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="mb-3 flex shrink-0 items-start justify-between gap-4">
            <div>
              <span className="text-[11px] font-extrabold tracking-[.15em] text-accent">第 1 步，共 1 步</span>
              <h1 className="mb-1.5 mt-1.5 text-[28px] font-black leading-tight tracking-[-.035em]">调整好你的坐姿</h1>
              <p className="m-0 max-w-[650px] text-xs leading-5 text-muted">请自然坐直并正对屏幕。摄像头只需拍到完整、清晰的头部；肩膀和手臂不会参与识别。</p>
            </div>
            <span className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border bg-panel px-3 py-2 text-[11px] ${vision.status === "ready" ? "border-accent-soft-strong text-accent" : "border-edge text-muted"}`}>
              {vision.status === "ready" ? <><span className="size-[7px] rounded-full bg-accent" /> 摄像头已连接</> : <><LoaderCircle size={15} className="animate-spin" /> 正在准备</>}
            </span>
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-[22px] bg-panel-strong shadow-panel">
            <img ref={vision.previewRef} className={`block size-full scale-x-[-1] object-cover transition-opacity duration-500 ${vision.previewReady ? "opacity-100" : "opacity-0"}`} alt="摄像头校准预览" />
            <div className="pointer-events-none absolute inset-[12%] rounded-[48%_48%_34%_34%] border border-inverse/25">
              <i className="absolute -left-px -top-px size-[30px] rounded-tl-[11px] border-l-2 border-t-2 border-inverse-muted" />
              <i className="absolute -right-px -top-px size-[30px] rounded-tr-[11px] border-r-2 border-t-2 border-inverse-muted" />
              <i className="absolute -bottom-px -left-px size-[30px] rounded-bl-[11px] border-b-2 border-l-2 border-inverse-muted" />
              <i className="absolute -bottom-px -right-px size-[30px] rounded-br-[11px] border-b-2 border-r-2 border-inverse-muted" />
            </div>
            {!vision.previewReady && (
              <div className="absolute inset-0 z-[4] grid place-content-center justify-items-center gap-3 bg-panel-strong text-[13px] text-inverse"><Camera size={30} className={vision.status === "ready" ? "animate-pulse" : ""} /><span>{vision.status === "ready" ? "正在连接画面…" : vision.status === "requesting" ? "正在请求摄像头权限…" : "正在加载本地姿态模型…"}</span></div>
            )}
            <div className="absolute bottom-3.5 left-3.5 flex items-center gap-2 rounded-full bg-panel-strong/75 px-2.5 py-2 text-[10px] text-inverse backdrop-blur-lg"><span className="size-1.5 rounded-full bg-accent" /> 画面仅在此设备内存中处理</div>
          </div>
          {vision.devices.length > 1 && (
            <div className="mt-2.5 flex shrink-0 items-center gap-3 text-xs text-muted">
              <span className="font-bold text-muted">摄像头</span>
              <SelectField
                className="w-full max-w-[360px]"
                value={cameraId}
                options={vision.devices.map((device, index) => ({ value: device.id, label: device.label || `摄像头 ${index + 1}` }))}
                ariaLabel="摄像头"
                placement="top"
                onChange={(value) => { setCameraId(value); vision.resetSamples(); }}
              />
            </div>
          )}
        </div>

        <aside className="max-h-full self-center overflow-hidden rounded-[18px] border border-edge bg-panel p-[clamp(20px,3vh,30px)] shadow-panel">
          <span className="text-[11px] font-extrabold tracking-[.15em] text-accent">校准检查</span>
          <h2 className="mb-1.5 mt-1.5 text-[22px] font-black">保持自然坐姿</h2>
          <p className="text-xs leading-5 text-muted">我们只使用鼻尖、双眼和双耳记录自然坐姿基线。无需拍到肩部、胸部或下半身。</p>
          <div className="my-4 grid gap-1.5">
            {qualityChecks.map(({ label, ok, icon: Icon }) => (
              <div className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-xs ${ok ? "border-accent-soft-strong bg-panel-muted text-accent-strong" : "border-edge text-muted"}`} key={label}>
                <span className={`grid size-7 place-items-center rounded-lg ${ok ? "bg-accent-soft text-accent" : "bg-neutral-soft"}`}>{ok ? <Check size={17} /> : <Icon size={17} />}</span>{label}
              </div>
            ))}
          </div>
          <div className="mb-3 rounded-xl bg-panel-muted p-3">
            <div className="flex items-center justify-between text-xs"><span>基线采集</span><strong className="text-accent">{progress}%</strong></div>
            <div className="my-2 h-1.5 overflow-hidden rounded-full bg-edge"><span className="block h-full rounded-full bg-accent transition-[width]" style={{ width: `${progress}%` }} /></div>
            <small className="text-[10px] text-muted">{progress < 100 ? "请让完整头部在画面中稳定保持几秒" : "已获得稳定的头部位置基线"}</small>
          </div>
          {(vision.error || vision.previewError) && (
            <div className="mb-3 flex gap-2.5 rounded-xl border border-warning/35 bg-warning-soft p-3 text-warning-foreground">
              <AlertTriangle size={19} />
              <div className="flex flex-1 flex-col gap-1"><strong className="text-xs">{vision.error ? "摄像头暂时不可用" : "视频预览暂时不可用"}</strong><span className="text-[10px] leading-4">{vision.error ?? vision.previewError}</span></div>
              {!vision.error && <button className="text-[10px] font-bold underline" onClick={vision.retryPreview}>重试</button>}
            </div>
          )}
          <button className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-inverse shadow-control transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50" disabled={!ready || busy} onClick={() => onComplete(baseline, cameraId)}>
            完成并开始检测 <ArrowRight size={18} />
          </button>
          {(vision.status === "error" || vision.status === "ready") && (
            <button className="mt-2 inline-flex min-h-9 w-full items-center justify-center rounded-lg text-[13px] font-bold text-muted hover:bg-accent-soft disabled:opacity-50" disabled={busy} onClick={onTimerFallback}>使用普通定时提醒</button>
          )}
          <p className="mb-0 mt-3 text-center text-[9px] text-muted">本应用提供健康行为提醒，不用于疾病诊断或治疗。</p>
        </aside>
      </section>
    </main>
  );
}
