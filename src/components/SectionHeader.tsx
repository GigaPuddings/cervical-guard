import type { ReactNode } from 'react'
import { cn } from '../utils'

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  className
}: {
  eyebrow: string
  title: string
  subtitle?: string
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex min-w-0 items-start justify-between gap-6', className)}>
      <div className="min-w-0">
        <span className="block text-[12px] font-bold tracking-[.04em] text-accent">{eyebrow}</span>
        <h1 className="mt-2 truncate text-[30px] font-black leading-[1.15] tracking-[-.045em] text-foreground">{title}</h1>
        {subtitle ? <p className="mt-2 text-[12px] leading-5 text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  )
}
