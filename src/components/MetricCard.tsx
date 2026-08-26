import type { LucideIcon } from 'lucide-react'
import type { Language } from '../i18n'
import { cn } from '../utils'

const toneClasses = {
  green: 'bg-accent-soft text-accent',
  amber: 'bg-warning-soft text-warning',
  blue: 'bg-info-soft text-info',
  rose: 'bg-danger-soft text-danger',
  neutral: 'bg-neutral-soft text-muted'
} as const

export function MetricCard({
  icon: Icon,
  label,
  value,
  note,
  noteIcon: NoteIcon,
  noteIconClassName,
  tone = 'green',
  language = 'zh-CN',
  progress,
  compact = false,
  className
}: {
  icon: LucideIcon
  label: string
  value: string
  note?: string
  noteIcon?: LucideIcon
  noteIconClassName?: string
  tone?: keyof typeof toneClasses
  language?: Language
  progress?: number
  compact?: boolean
  className?: string
}) {
  if (compact) {
    return (
      <section className={cn('metric-card-compact relative min-w-0 overflow-hidden rounded-[16px] border border-edge bg-panel px-4.25 py-4.25 shadow-panel', className)}>
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn('metric-card-compact-icon grid size-10.5 shrink-0 place-items-center rounded-[13px]', toneClasses[tone])}>
            <Icon size={21} strokeWidth={1.8} />
          </span>
          <span className="metric-card-compact-label min-w-0 truncate text-[14px] leading-5 text-muted">{label}</span>
        </div>
        <strong className={cn('metric-card-compact-value mt-4 block truncate font-black leading-none tracking-tight text-foreground', language === 'en-US' ? 'text-[15px]' : 'text-[21px]')} title={value}>
          {value}
        </strong>
        {note ? (
          <small className="metric-card-compact-note mt-2.25 flex items-center gap-1 truncate text-[11px] leading-4 text-subtle">
            <span className="truncate">{note}</span>
            {NoteIcon ? <NoteIcon className={cn('shrink-0', noteIconClassName ?? 'text-warning')} size={12} strokeWidth={2} /> : null}
          </small>
        ) : null}
      </section>
    )
  }

  return (
    <section className={cn('relative min-w-0 overflow-hidden rounded-[16px] border border-edge bg-panel shadow-panel', 'flex items-center gap-3 px-4 py-3.5', className)}>
      <span className={cn('grid size-11 shrink-0 place-items-center rounded-[12px]', toneClasses[tone])}>
        <Icon size={22} strokeWidth={1.8} />
      </span>
      <div className="min-w-0">
        <span className="block truncate text-[11px] text-muted">{label}</span>
        <strong className={cn('mt-1.5 block truncate font-black leading-none tracking-tight text-foreground', language === 'en-US' ? 'text-[14px]' : 'text-[16px]')} title={value}>
          {value}
        </strong>
        {note ? (
          <small className="mt-2 flex min-w-0 items-start gap-1 text-[10px] leading-3 text-subtle">
            <span className="line-clamp-2 min-w-0">{note}</span>
            {NoteIcon ? <NoteIcon className={cn('shrink-0', noteIconClassName ?? 'text-warning')} size={12} strokeWidth={2} /> : null}
          </small>
        ) : null}
      </div>
      {progress !== undefined ? (
        <span className="absolute inset-x-4 bottom-3 h-0.5 overflow-hidden rounded-full bg-edge-soft">
          <i className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </span>
      ) : null}
    </section>
  )
}
