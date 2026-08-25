import { useId } from 'react'

export function SessionProgressRing({
  progress,
  label,
  value,
  recommendation,
  status
}: {
  progress: number
  label: string
  value: string
  recommendation: string
  status: string
}) {
  const gradientId = useId()
  const radius = 128
  const circumference = 2 * Math.PI * radius
  const clampedProgress = Math.max(0.02, Math.min(1, progress / 100))
  const endpointAngle = (-90 + clampedProgress * 360) * (Math.PI / 180)
  const endpointX = 140 + radius * Math.cos(endpointAngle)
  const endpointY = 140 + radius * Math.sin(endpointAngle)

  return (
    <div className="session-progress-ring relative mx-auto grid aspect-square size-[clamp(226px,31.2vh,280px)] shrink-0 place-items-center" role="img" aria-label={`${label} ${value} ${recommendation} ${status}`}>
      <svg className="absolute inset-0 size-full overflow-visible" viewBox="0 0 280 280" aria-hidden="true">
        <circle cx="140" cy="140" r={radius} fill="none" stroke="var(--theme-session-ring-track)" strokeWidth="16" />
        <circle
          cx="140"
          cy="140"
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeDasharray={`${clampedProgress * circumference} ${circumference}`}
          strokeLinecap="round"
          strokeWidth="16"
          transform="rotate(-90 140 140)"
        />
        <circle
          cx={endpointX}
          cy={endpointY}
          r="5.5"
          fill="var(--theme-accent)"
          stroke="var(--theme-session-ring-dot-stroke)"
          strokeWidth="2.5"
        />
        <defs>
          <linearGradient id={gradientId} x1="140" y1="0" x2="140" y2="280" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="var(--theme-session-ring-start)" />
            <stop offset="0.55" stopColor="var(--theme-session-ring-mid)" />
            <stop offset="1" stopColor="var(--theme-session-ring-end)" />
          </linearGradient>
        </defs>
      </svg>

      <div className="relative z-10 grid place-content-center text-center">
        <span className="text-[clamp(12px,1.35vh,13px)] font-semibold text-accent">{label}</span>
        <strong className="my-2 text-[clamp(44px,5.2vh,50px)] font-black leading-none tracking-[-.045em] text-foreground">{value}</strong>
        <small className="text-[clamp(11px,1.2vh,12px)] text-muted">{recommendation}</small>
        <span className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-[10px] font-bold text-accent">
          <i className="size-1.5 rounded-full bg-accent" />
          {status}
        </span>
      </div>
    </div>
  )
}
