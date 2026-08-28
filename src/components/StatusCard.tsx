import { ChevronDown, Circle, Coffee, Pause, Play, ShieldCheck, TimerReset } from 'lucide-react'
import { useState } from 'react'
import { languageOf } from '../i18n'
import type { Language } from '../i18n'
import { defineMessages, localizeMessages } from '../runtimeI18n'
import type { AppSnapshot } from '../types'
import { cn } from '../utils'

const statusMessages = defineMessages({
  onBreak: { zh: '休息中', en: 'On break' },
  paused: { zh: '检测已暂停', en: 'Monitoring paused' },
  detecting: { zh: '检测中', en: 'Detecting' },
  preparing: { zh: '正在准备', en: 'Preparing' },
  cameraConnected: { zh: '摄像头已连接', en: 'Camera connected' },
  timerReminder: { zh: '普通定时提醒', en: 'Timer reminders' },
  endBreak: { zh: '结束休息', en: 'End break' },
  pauseDetection: { zh: '暂停检测', en: 'Pause detection' },
  resumeDetection: { zh: '恢复检测', en: 'Resume detection' },
  lastDetection: { zh: '上次检测', en: 'Last detection' },
  noDetectionRecord: { zh: '暂无检测记录', en: 'No detection recorded yet' },
  pause30: { zh: '暂停 30 分钟', en: 'Pause for 30 minutes' },
  pauseHour: { zh: '暂停 1 小时', en: 'Pause for 1 hour' },
  pauseManual: { zh: '暂停到手动恢复', en: 'Pause until resumed' }
})

export function formatDetectionTimestamp(timestamp: string | null, language: Language): string | null {
  if (!timestamp) return null
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date)
}

export function formatStatusDetectionText(timestamp: string | null, language: Language, lastDetectionLabel: string, noRecordLabel: string): string {
  const time = formatDetectionTimestamp(timestamp, language)
  if (!time) return noRecordLabel
  return `${lastDetectionLabel}${language === 'en-US' ? ': ' : '：'}${time}`
}

export function StatusCard({
  snapshot,
  onPause,
  onResume,
  onEndBreak
}: {
  snapshot: AppSnapshot
  onPause: (minutes: number | null) => void
  onResume: () => void
  onEndBreak: () => void
}) {
  const language = languageOf(snapshot.settings.language)
  const messages = localizeMessages(statusMessages, language)
  const [pauseOpen, setPauseOpen] = useState(false)
  const monitoring = snapshot.lifecycle === 'monitoring' || snapshot.lifecycle === 'degraded'
  const paused = snapshot.lifecycle === 'paused'
  const isBreak = snapshot.lifecycle === 'break'
  const statusLabel = isBreak ? messages.onBreak : paused ? messages.paused : monitoring ? messages.detecting : messages.preparing
  const statusNote = snapshot.monitoringMode === 'camera' ? messages.cameraConnected : messages.timerReminder
  const detectionText = formatStatusDetectionText(snapshot.lastDetectionAt, language, messages.lastDetection, messages.noDetectionRecord)

  return (
    <section className="relative rounded-[16px] border border-edge bg-panel p-3 shadow-control">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[12px] font-bold text-accent">
          <Circle className={cn('size-3 fill-current', paused && 'fill-transparent text-subtle')} strokeWidth={2} />
          {statusLabel}
        </span>
        <ShieldCheck size={17} className="text-accent" />
      </div>
      <p className="mt-1.5 text-[10px] text-muted">{statusNote}</p>

      {isBreak ? (
        <button className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-full bg-accent text-[12px] font-bold text-inverse shadow-control hover:bg-accent-strong" onClick={onEndBreak}>
          <Coffee size={15} /> {messages.endBreak}
        </button>
      ) : monitoring ? (
        <button className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-full bg-accent text-[12px] font-bold text-inverse shadow-control hover:bg-accent-strong" onClick={() => setPauseOpen(value => !value)}>
          <Pause size={15} /> {messages.pauseDetection} <ChevronDown size={13} />
        </button>
      ) : (
        <button className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-full bg-accent text-[12px] font-bold text-inverse shadow-control hover:bg-accent-strong" onClick={onResume}>
          <Play size={15} /> {messages.resumeDetection}
        </button>
      )}

      <p className="mt-2 flex items-center justify-center gap-1.5 text-[10px] text-muted">
        <TimerReset size={13} />
        {detectionText}
      </p>

      {pauseOpen ? (
        <div className="absolute inset-x-3 top-[82px] z-40 grid overflow-hidden rounded-[12px] border border-edge bg-panel p-1 text-[11px] shadow-panel">
          {[
            { label: messages.pause30, value: 30 },
            { label: messages.pauseHour, value: 60 },
            { label: messages.pauseManual, value: null }
          ].map(item => (
            <button
              className="rounded-[9px] px-3 py-2 text-left text-muted hover:bg-panel-muted hover:text-foreground"
              key={item.label}
              onClick={() => {
                onPause(item.value)
                setPauseOpen(false)
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  )
}
