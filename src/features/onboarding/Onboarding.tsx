import { ArrowRight, Camera, Check, Clock3, EyeOff, ShieldCheck, WifiOff } from "lucide-react";
import { Brand } from "../../components/Brand";

interface OnboardingProps {
  busy: boolean;
  onCamera: () => void;
  onTimer: () => void;
}

const privacyPoints = [
  { icon: WifiOff, title: "断网也能工作", text: "姿态识别与提醒均在本机完成" },
  { icon: EyeOff, title: "画面不会留存", text: "不保存、不上传摄像头视频或截图" },
  { icon: ShieldCheck, title: "你始终可控", text: "随时暂停检测、撤销权限或清空数据" },
];

export function Onboarding({ busy, onCamera, onTimer }: OnboardingProps) {
  return (
    <main className="grid h-full grid-cols-1 overflow-y-auto bg-panel-muted lg:grid-cols-[minmax(520px,1.08fr)_minmax(480px,.92fr)] lg:overflow-hidden">
      <section className="relative z-[2] flex min-h-[660px] flex-col justify-center px-7 pb-12 pt-[105px] sm:px-12 lg:min-h-0 lg:px-[clamp(48px,8vw,122px)] lg:py-[clamp(42px,7vh,76px)]">
        <Brand />
        <div className="mb-6 mt-14 flex items-center gap-2 text-[13px] font-bold tracking-[.08em] text-accent lg:mt-16"><span className="h-px w-7 bg-accent" /> 温和一点，照顾久坐的自己</div>
        <h1 className="m-0 font-serif text-[clamp(46px,5.5vw,78px)] font-medium leading-[1.12] tracking-[-.04em] text-foreground">抬起头，<br />也给身体一点余地。</h1>
        <p className="my-7 max-w-[620px] text-base leading-[1.9] text-muted">
          健康提醒通过摄像头在本地识别久坐和持续低头，在恰当的时候轻轻提醒你。它只关注行为，不做任何医疗诊断。
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button className="inline-flex min-h-14 items-center justify-center gap-2 rounded-[14px] bg-accent px-6 text-[15px] font-bold text-inverse shadow-control transition hover:-translate-y-px hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50" disabled={busy} onClick={onCamera}>
            <Camera size={19} /> 开启姿势检测 <ArrowRight size={18} />
          </button>
          <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-transparent bg-transparent px-4 text-sm font-bold text-muted transition hover:-translate-y-px hover:bg-panel/70 disabled:cursor-not-allowed disabled:opacity-50" disabled={busy} onClick={onTimer}>
            <Clock3 size={18} /> 暂时使用定时提醒
          </button>
        </div>
        <p className="mt-5 flex items-center gap-2 text-xs text-muted"><Check className="text-accent" size={15} /> 点击后才会申请摄像头权限，不会申请麦克风权限</p>
      </section>

      <section className="relative grid min-h-[560px] place-items-center overflow-hidden bg-accent-soft px-5 pb-[120px] pt-9 sm:p-16 lg:min-h-0 lg:p-[72px]" aria-label="隐私说明">
        <div className="absolute right-[-14%] top-[5%] size-[560px] rounded-full bg-panel/50 blur-[1px]" />
        <div className="absolute -bottom-20 -left-[70px] size-[300px] rounded-full border border-guard-500/20" />
        <div className="relative z-[1] flex aspect-[1.05] w-[min(100%,520px)] items-end justify-center rounded-[160px_160px_32px_32px] border border-edge bg-panel/75 shadow-panel backdrop-blur-[10px]" aria-hidden="true">
          <div className="absolute right-[14%] top-[15%] size-[84px] rounded-full bg-warning-soft" />
          <svg className="relative z-[1] h-[87%] w-[90%]" viewBox="0 0 420 380" role="img">
            <path className="fill-none stroke-accent-strong stroke-[5] [stroke-linecap:round]" d="M330 341 C330 298 337 258 350 219" />
            <path className="fill-accent" d="M337 287 C317 280 307 265 312 248 C331 254 341 270 337 287Z" />
            <path className="fill-accent" d="M343 258 C325 251 316 236 321 219 C340 225 348 241 343 258Z" />
            <path className="fill-accent" d="M345 250 C364 241 374 226 372 209 C353 215 343 232 345 250Z" />
            <circle className="fill-accent-soft-strong opacity-95" cx="181" cy="86" r="34" />
            <path className="fill-accent-soft-strong opacity-95" d="M129 145 C148 120 211 120 230 146 L250 245 L112 245Z" />
            <path className="fill-none stroke-accent-strong stroke-[6] [stroke-linecap:round]" d="M185 120 C183 146 185 170 196 194" />
            <path className="fill-none stroke-accent-strong stroke-[6] [stroke-linecap:round]" d="M134 154 C103 176 92 216 111 245" />
            <path className="fill-none stroke-accent-strong stroke-[6] [stroke-linecap:round]" d="M224 155 C255 178 264 218 245 245" />
            <path className="fill-none stroke-accent-strong stroke-[6] [stroke-linecap:round]" d="M152 245 L135 341" />
            <path className="fill-none stroke-accent-strong stroke-[6] [stroke-linecap:round]" d="M211 245 L229 341" />
            <path className="fill-none stroke-accent-strong stroke-[5] [stroke-linecap:round]" d="M42 245 H303" />
            <path className="fill-none stroke-accent-strong stroke-[5] [stroke-linecap:round]" d="M66 245 L60 351 M278 245 L286 351" />
            <path className="fill-none stroke-warning stroke-[3] [stroke-linecap:round]" d="M101 59 C128 27 181 14 226 28" />
            <path className="fill-none stroke-warning stroke-2 [stroke-linecap:round]" d="M86 78 L66 63 M86 96 L60 99" />
          </svg>
          <div className="absolute bottom-[18px] left-[22px] z-[2] flex items-center gap-2 rounded-full border border-accent/15 bg-panel/90 px-3 py-2 text-[11px] font-bold text-muted"><span className="size-[7px] rounded-full bg-accent" /> 只分析姿态，不识别身份</div>
        </div>
        <div className="absolute bottom-5 left-6 right-6 z-[3] grid gap-2 sm:bottom-9 sm:left-auto sm:right-9">
          {privacyPoints.map(({ icon: Icon, title, text }) => (
            <div className="flex min-w-0 items-center gap-2.5 rounded-[13px] border border-edge bg-panel/90 px-3 py-2.5 shadow-panel sm:min-w-[235px]" key={title}>
              <span className="grid size-8 place-items-center rounded-lg bg-accent-soft text-accent"><Icon size={19} /></span>
              <div className="flex flex-col gap-0.5"><strong className="text-xs">{title}</strong><small className="text-[10px] text-muted">{text}</small></div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
