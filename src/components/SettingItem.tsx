import type { LucideIcon } from 'lucide-react'
import { cn } from '../utils'

export function SettingItem({ icon: Icon, title, description, checked, onChange, disabled = false, className }: { icon: LucideIcon; title: string; description: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean; className?: string }) {
  return (
    <label className={cn('flex min-h-16 items-center gap-3 rounded-[12px] border border-edge px-3.5 py-2.5 transition hover:border-accent/25 hover:bg-panel-muted/60', disabled && 'cursor-not-allowed opacity-50', className)}>
      <span className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-accent-soft text-accent">
        <Icon size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-[13px]">{title}</strong>
        <small className="mt-1 block truncate text-[10px] text-muted">{description}</small>
      </span>
      <input className="peer sr-only" type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />
      <span className="relative h-5 w-9 shrink-0 rounded-full bg-edge transition after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-panel after:shadow-sm after:transition after:content-[''] peer-checked:bg-accent peer-checked:after:translate-x-4" />
    </label>
  )
}
