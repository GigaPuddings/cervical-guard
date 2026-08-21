import { Check, Coffee } from 'lucide-react'
import type { Language } from '../../i18n'
import { defineMessages, localizeMessages, translateNow } from '../../runtimeI18n'
import type { AppSnapshot } from '../../types'
import { formatDuration } from '../../utils'

const breakMessages = defineMessages({
  timeUp: '休息时间到',
  remaining: '休息剩余',
  continue: '准备好了就继续吧',
  move: '起来走动，放松一下肩颈',
  complete: '完成休息',
  end: '结束休息'
})

export function BreakIsland({ snapshot, language, onEnd }: { snapshot: AppSnapshot; language: Language; onEnd: () => void }) {
  const timeUp = snapshot.breakRemainingSeconds === 0
  const messages = localizeMessages(breakMessages, language)
  const remaining = translateNow(formatDuration(snapshot.breakRemainingSeconds), language)

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-120 flex justify-center px-4" role="presentation">
      <section className="pointer-events-auto grid h-19 w-full max-w-90 grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[22px] bg-panel-strong px-2.5 text-inverse shadow-panel" role="dialog" aria-modal="false" aria-labelledby="break-island-title">
        <span className="grid size-8 place-items-center rounded-[11px] bg-info text-inverse" aria-hidden="true">
          {timeUp ? <Check size={16} /> : <Coffee size={16} />}
        </span>
        <span className="min-w-0">
          <small className="block truncate text-[8px] font-semibold text-inverse-muted">{timeUp ? messages.timeUp : `${messages.remaining} ${remaining}`}</small>
          <strong className="mt-0.5 block truncate text-xs" id="break-island-title">
            {timeUp ? messages.continue : messages.move}
          </strong>
        </span>
        <button className="h-7 rounded-[9px] bg-break-soft px-2.5 text-[8px] font-bold text-break hover:bg-inverse" onClick={onEnd}>
          {timeUp ? messages.complete : messages.end}
        </button>
      </section>
    </div>
  )
}
