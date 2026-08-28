import { BellRing, Clock3, Coffee, Pause, X } from 'lucide-react'
import type { Language } from '../../i18n'
import { defineMessages, localizeMessages, translateNow } from '../../runtimeI18n'
import type { ReminderPayload } from '../../types'
import { formatDuration } from '../../utils'

const reminderMessages = defineMessages({
  continuous: '已连续',
  break: '休息',
  later: '稍后',
  pauseHour: '暂停一小时',
  dismiss: '关闭本次'
})

interface ReminderOverlayProps {
  reminder: ReminderPayload
  language: Language
  onBreak: () => void
  onSnooze: () => void
  onDismiss: () => void
  onPause: () => void
}

export function ReminderOverlay({ reminder, language, onBreak, onSnooze, onDismiss, onPause }: ReminderOverlayProps) {
  const messages = localizeMessages(reminderMessages, language)
  const duration = translateNow(formatDuration(reminder.durationSeconds), language)
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-120 flex justify-center px-4" role="presentation">
      <section className="pointer-events-auto relative grid w-full max-w-117.5 grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-3xl border border-inverse/10 bg-panel-strong/98 px-3 py-2.5 text-inverse shadow-panel" role="dialog" aria-modal="false" aria-labelledby="reminder-title">
        <div className={`absolute -left-8 -top-10 size-28 rounded-full blur-3xl ${reminder.level === 'strong' ? 'bg-warning/25' : 'bg-accent/20'}`} aria-hidden="true" />
        <div className="relative grid size-10 place-items-center rounded-[14px] bg-accent text-inverse shadow-control" aria-hidden="true">
          <BellRing size={17} />
        </div>
        <div className="relative min-w-0">
          <span className="block text-[8px] font-bold text-inverse-muted">
            {messages.continuous} {duration}
          </span>
          <h2 className="mt-0.5 truncate text-[13px] font-bold" id="reminder-title">
            {translateNow(reminder.title, language)}
          </h2>
          <p className="mt-0.5 truncate text-[8px] text-inverse-muted">{translateNow(reminder.message, language)}</p>
        </div>
        <div className="relative flex items-center gap-1">
          <button className="inline-flex h-8 items-center gap-1 rounded-[10px] bg-break-soft px-2.5 text-[8px] font-bold text-break hover:bg-inverse" onClick={onBreak}>
            <Coffee size={14} /> {messages.break}
          </button>
          <button className="inline-flex h-8 items-center gap-1 rounded-[10px] border border-inverse/10 bg-inverse/5 px-2 text-[8px] font-bold text-inverse hover:bg-inverse/10" onClick={onSnooze}>
            <Clock3 size={13} /> {messages.later}
          </button>
          <button className="grid size-8 place-items-center rounded-[10px] border border-inverse/10 bg-inverse/5 text-inverse-muted hover:bg-inverse/10" title={messages.pauseHour} aria-label={messages.pauseHour} onClick={onPause}>
            <Pause size={13} />
          </button>
          <button className="grid size-8 place-items-center rounded-[10px] border border-inverse/10 bg-inverse/5 text-inverse-muted hover:bg-inverse/10" title={messages.dismiss} aria-label={messages.dismiss} onClick={onDismiss}>
            <X size={13} />
          </button>
        </div>
      </section>
    </div>
  )
}
