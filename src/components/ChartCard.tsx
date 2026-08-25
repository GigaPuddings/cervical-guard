import type { ReactNode } from 'react'
import { cn } from '../utils'

export function ChartCard({ title, eyebrow, legend, children, footer, className }: { title: string; eyebrow?: string; legend?: ReactNode; children: ReactNode; footer?: ReactNode; className?: string }) {
  return (
    <section className={cn('flex min-h-0 flex-col overflow-hidden rounded-[16px] border border-edge bg-panel shadow-panel', className)}>
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-edge-soft px-5">
        <div>
          {eyebrow ? <span className="block text-[10px] font-bold tracking-[.08em] text-accent">{eyebrow}</span> : null}
          <h2 className="mt-1 text-[16px] font-black tracking-[-.02em]">{title}</h2>
        </div>
        {legend}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      {footer ? <footer className="shrink-0">{footer}</footer> : null}
    </section>
  )
}
