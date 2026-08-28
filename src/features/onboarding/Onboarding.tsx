import { AlertTriangle, ArrowRight, Camera, Check, Clock3, EyeOff, LoaderCircle, ShieldCheck, WifiOff } from 'lucide-react'
import { Brand } from '../../components/Brand'
import { copy, type Language } from '../../i18n'

interface OnboardingProps {
  busy: boolean
  language: Language
  cameraError: string | null
  onCamera: () => void
  onTimer: () => void
  onLanguage: (language: Language) => void
}

const privacyIcons = [WifiOff, EyeOff, ShieldCheck]

export function Onboarding({ busy, language, cameraError, onCamera, onTimer, onLanguage }: OnboardingProps) {
  const t = copy[language]
  return (
    <main className="grid h-full grid-cols-1 overflow-y-auto bg-panel-muted lg:grid-cols-[minmax(520px,1.08fr)_minmax(480px,.92fr)] lg:overflow-hidden">
      <section className="relative z-2 flex min-h-165 flex-col justify-center px-7 pb-12 pt-26.25 sm:px-12 lg:min-h-0 lg:px-[clamp(48px,8vw,122px)] lg:py-[clamp(42px,7vh,76px)]">
        <div className="flex items-start justify-between gap-4">
          <Brand language={language} />
          <div className="inline-flex rounded-full border border-edge bg-panel p-1 text-[10px] font-bold shadow-control" aria-label={t.settings.language}>
            <button className={`rounded-full px-2.5 py-1 ${language === 'zh-CN' ? 'bg-accent text-inverse' : 'text-muted'}`} onClick={() => onLanguage('zh-CN')}>
              {copy['zh-CN'].settings.chineseShort}
            </button>
            <button className={`rounded-full px-2.5 py-1 ${language === 'en-US' ? 'bg-accent text-inverse' : 'text-muted'}`} onClick={() => onLanguage('en-US')}>
              EN
            </button>
          </div>
        </div>
        <div className="mb-6 mt-14 flex items-center gap-2 text-[13px] font-bold tracking-[.08em] text-accent lg:mt-16">
          <span className="h-px w-7 bg-accent" /> {t.onboarding.tagline}
        </div>
        <h1 className="m-0 font-serif text-[clamp(46px,5.5vw,78px)] font-medium leading-[1.12] tracking-[-.04em] text-foreground">
          {t.onboarding.headline[0]}
          <br />
          {t.onboarding.headline[1]}
        </h1>
        <p className="my-7 max-w-155 text-base leading-[1.9] text-muted">{t.onboarding.description}</p>
        {cameraError && (
          <div className="mb-4 max-w-155 rounded-xl border border-warning/35 bg-warning-soft px-4 py-3 text-warning-foreground" role="alert">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 shrink-0" size={16} />
              <div>
                <strong className="block text-xs">{t.camera.unsupported}</strong>
                <span className="mt-1 block text-[10px] leading-4">{cameraError}</span>
                <small className="mt-1 block text-[9px] opacity-80">{t.onboarding.fallback}</small>
              </div>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button className="inline-flex min-h-14 items-center justify-center gap-2 rounded-[14px] bg-accent px-6 text-[15px] font-bold text-inverse shadow-control transition hover:-translate-y-px hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50" disabled={busy} onClick={onCamera}>
            {busy ? <LoaderCircle className="animate-spin" size={19} /> : <Camera size={19} />} {busy ? t.onboarding.checking : cameraError ? t.camera.retry : t.onboarding.camera} {!busy && <ArrowRight size={18} />}
          </button>
          <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-transparent bg-transparent px-4 text-sm font-bold text-muted transition hover:-translate-y-px hover:bg-panel/70 disabled:cursor-not-allowed disabled:opacity-50" disabled={busy} onClick={onTimer}>
            <Clock3 size={18} /> {t.onboarding.timer}
          </button>
        </div>
        <p className="mt-5 flex items-center gap-2 text-xs text-muted">
          <Check className="text-accent" size={15} /> {t.onboarding.permission}
        </p>
      </section>

      <section className="relative grid min-h-140 place-items-center overflow-hidden bg-accent-soft px-5 pb-30 pt-9 sm:p-16 lg:min-h-0 lg:p-18" aria-label={t.onboarding.privacyLabel}>
        <div className="absolute right-[-14%] top-[5%] size-140 rounded-full bg-panel/50 blur-[1px]" />
        <div className="absolute -bottom-20 -left-17.5 size-75 rounded-full border border-guard-500/20" />
        <div className="relative z-1 flex aspect-[1.05] w-[min(100%,520px)] items-end justify-center rounded-[160px_160px_32px_32px] border border-edge bg-panel/75 shadow-panel backdrop-blur-[10px]" aria-hidden="true">
          <div className="absolute right-[14%] top-[15%] size-21 rounded-full bg-warning-soft" />
          <svg className="relative z-1 h-[87%] w-[90%]" viewBox="0 0 420 380" role="img">
            <path className="fill-none stroke-accent-strong stroke-5 [stroke-linecap:round]" d="M330 341 C330 298 337 258 350 219" />
            <path className="fill-accent" d="M337 287 C317 280 307 265 312 248 C331 254 341 270 337 287Z" />
            <path className="fill-accent" d="M343 258 C325 251 316 236 321 219 C340 225 348 241 343 258Z" />
            <path className="fill-accent" d="M345 250 C364 241 374 226 372 209 C353 215 343 232 345 250Z" />
            <circle className="fill-accent-soft-strong opacity-95" cx="181" cy="86" r="34" />
            <path className="fill-accent-soft-strong opacity-95" d="M129 145 C148 120 211 120 230 146 L250 245 L112 245Z" />
            <path className="fill-none stroke-accent-strong stroke-6 [stroke-linecap:round]" d="M185 120 C183 146 185 170 196 194" />
            <path className="fill-none stroke-accent-strong stroke-6 [stroke-linecap:round]" d="M134 154 C103 176 92 216 111 245" />
            <path className="fill-none stroke-accent-strong stroke-6 [stroke-linecap:round]" d="M224 155 C255 178 264 218 245 245" />
            <path className="fill-none stroke-accent-strong stroke-6 [stroke-linecap:round]" d="M152 245 L135 341" />
            <path className="fill-none stroke-accent-strong stroke-6 [stroke-linecap:round]" d="M211 245 L229 341" />
            <path className="fill-none stroke-accent-strong stroke-5 [stroke-linecap:round]" d="M42 245 H303" />
            <path className="fill-none stroke-accent-strong stroke-5 [stroke-linecap:round]" d="M66 245 L60 351 M278 245 L286 351" />
            <path className="fill-none stroke-warning stroke-3 [stroke-linecap:round]" d="M101 59 C128 27 181 14 226 28" />
            <path className="fill-none stroke-warning stroke-2 [stroke-linecap:round]" d="M86 78 L66 63 M86 96 L60 99" />
          </svg>
          <div className="absolute bottom-4.5 left-5.5 z-2 flex items-center gap-2 rounded-full border border-accent/15 bg-panel/90 px-3 py-2 text-[11px] font-bold text-muted">
            <span className="size-1.75 rounded-full bg-accent" /> {t.onboarding.postureOnly}
          </div>
        </div>
        <div className="onboarding-privacy-stack absolute bottom-5 left-6 right-6 z-3 grid gap-2 sm:bottom-9 sm:left-auto sm:right-9">
          {t.onboarding.points.map(([title, text], index) => {
            const Icon = privacyIcons[index]!
            return (
              <div className="onboarding-privacy-card flex min-w-0 items-center gap-2.5 rounded-[13px] border border-edge bg-panel/90 px-3 py-2.5 shadow-panel sm:min-w-58.75" style={{ animationDelay: `${index * 2.4}s` }} key={title}>
                <span className="grid size-8 place-items-center rounded-lg bg-accent-soft text-accent">
                  <Icon size={19} />
                </span>
                <div className="flex flex-col gap-0.5">
                  <strong className="text-xs">{title}</strong>
                  <small className="text-[10px] text-muted">{text}</small>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </main>
  )
}
