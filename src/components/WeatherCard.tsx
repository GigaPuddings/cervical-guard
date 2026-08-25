import type { LucideIcon } from 'lucide-react'

export function WeatherCard({ icon: Icon, label, value, note }: { icon: LucideIcon; label: string; value: string; note?: string }) {
  return (
    <section className="weather-metric-card min-w-0 rounded-[13px] border border-edge bg-panel px-4 py-4">
      <span className="weather-metric-label flex items-center gap-2 text-[11px] text-info"><Icon size={17} /> {label}</span>
      <strong className="weather-metric-value mt-4 block truncate text-[21px] font-black tracking-[-.02em]">{value}</strong>
      {note ? <small className="weather-metric-note mt-1.5 block truncate text-[10px] text-info">{note}</small> : null}
    </section>
  )
}
