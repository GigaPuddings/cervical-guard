import { useId } from 'react'
import { cn } from '../utils'

const ringPalettes = {
  normal: {
    start: 'var(--theme-session-ring-start)',
    mid: 'var(--theme-session-ring-mid)',
    end: 'var(--theme-session-ring-end)',
    dot: 'var(--theme-accent)',
    label: 'text-accent',
    badge: 'bg-accent-soft text-accent',
    badgeDot: 'bg-accent'
  },
  warning: {
    start: 'var(--theme-warning-foreground)',
    mid: 'var(--theme-warning)',
    end: 'var(--theme-warning-soft)',
    dot: 'var(--theme-warning)',
    label: 'text-warning',
    badge: 'bg-warning-soft text-warning',
    badgeDot: 'bg-warning'
  },
  danger: {
    start: 'var(--theme-danger)',
    mid: 'var(--theme-danger)',
    end: 'var(--theme-danger-soft)',
    dot: 'var(--theme-danger)',
    label: 'text-danger',
    badge: 'bg-danger-soft text-danger',
    badgeDot: 'bg-danger'
  },
  muted: {
    start: 'var(--theme-subtle)',
    mid: 'var(--theme-muted)',
    end: 'var(--theme-neutral-soft)',
    dot: 'var(--theme-muted)',
    label: 'text-muted',
    badge: 'bg-neutral-soft text-muted',
    badgeDot: 'bg-muted'
  },
  info: {
    start: 'var(--theme-info)',
    mid: 'var(--theme-info)',
    end: 'var(--theme-info-soft)',
    dot: 'var(--theme-info)',
    label: 'text-info',
    badge: 'bg-info-soft text-info',
    badgeDot: 'bg-info'
  }
} as const

export function SessionProgressRing({
  progress,
  label,
  value,
  recommendation,
  status,
  detail,
  tone = 'normal'
}: {
  progress: number
  label: string
  value: string
  recommendation: string
  status: string
  detail?: string | undefined
  tone?: keyof typeof ringPalettes
}) {
  const gradientId = useId()
  const palette = ringPalettes[tone]
  const radius = 128
  const circumference = 2 * Math.PI * radius
  const clampedProgress = Math.max(0.02, Math.min(1, progress / 100))
  const endpointAngle = (-90 + clampedProgress * 360) * (Math.PI / 180)
  const endpointX = 140 + radius * Math.cos(endpointAngle)
  const endpointY = 140 + radius * Math.sin(endpointAngle)

  return (
    <div className="session-progress-ring relative mx-auto grid aspect-square size-[clamp(226px,31.2vh,280px)] shrink-0 place-items-center" role="img" aria-label={`${label} ${value} ${recommendation} ${detail ?? ''} ${status}`}>
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
          fill={palette.dot}
          stroke="var(--theme-session-ring-dot-stroke)"
          strokeWidth="2.5"
        />
        <defs>
          <linearGradient id={gradientId} x1="140" y1="0" x2="140" y2="280" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={palette.start} />
            <stop offset="0.55" stopColor={palette.mid} />
            <stop offset="1" stopColor={palette.end} />
          </linearGradient>
        </defs>
      </svg>

      <div className="relative z-10 grid place-content-center text-center">
        <span className={cn('text-[clamp(12px,1.35vh,13px)] font-semibold', palette.label)}>{label}</span>
        <strong className="my-2 text-[clamp(44px,5.2vh,50px)] font-black leading-none tracking-[-.045em] text-foreground">{value}</strong>
        <small className="text-[clamp(11px,1.2vh,12px)] text-muted">{recommendation}</small>
        {detail ? <small className={cn('mt-1 text-[clamp(10px,1.1vh,11px)] font-semibold', palette.label)}>{detail}</small> : null}
        <span className={cn('mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold', palette.badge)}>
          <i className={cn('size-1.5 rounded-full', palette.badgeDot)} />
          {status}
        </span>
      </div>
    </div>
  )
}
