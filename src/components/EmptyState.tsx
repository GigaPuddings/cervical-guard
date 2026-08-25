import type { LucideIcon } from 'lucide-react'

export function EmptyState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="grid h-full min-h-52 place-content-center justify-items-center px-6 text-center">
      <span className="grid size-13 place-items-center rounded-[16px] bg-accent-soft text-accent"><Icon size={23} /></span>
      <strong className="mt-4 text-[15px]">{title}</strong>
      <p className="mt-2 max-w-80 text-[11px] leading-5 text-muted">{description}</p>
    </div>
  )
}
