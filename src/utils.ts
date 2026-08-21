type DurationLanguage = 'zh-CN' | 'en-US'

function durationLanguage(language?: DurationLanguage): DurationLanguage {
  if (language) return language
  return typeof document !== 'undefined' && document.documentElement.lang === 'en-US' ? 'en-US' : 'zh-CN'
}

function englishUnit(value: number, singular: string): string {
  return `${value} ${singular}${value === 1 ? '' : 's'}`
}

export function formatDuration(totalSeconds: number, language?: DurationLanguage): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  const english = durationLanguage(language) === 'en-US'
  if (hours > 0) {
    const hourText = english ? englishUnit(hours, 'hour') : `${hours} 小时`
    if (minutes === 0) return hourText
    return english ? `${hourText} ${englishUnit(minutes, 'minute')}` : `${hourText} ${minutes} 分钟`
  }
  if (minutes > 0) {
    const minuteText = english ? englishUnit(minutes, 'minute') : `${minutes} 分钟`
    if (seconds === 0) return minuteText
    return english ? `${minuteText} ${englishUnit(seconds, 'second')}` : `${minuteText} ${seconds} 秒`
  }
  return english ? englishUnit(seconds, 'second') : `${seconds} 秒`
}

export function compactDuration(totalSeconds: number, language?: DurationLanguage): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const english = durationLanguage(language) === 'en-US'
  if (safe > 0 && safe < 60) return english ? 'Less than 1 minute' : '少于 1 分钟'
  const minutes = Math.floor(safe / 60)
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    const hourText = english ? englishUnit(hours, 'hour') : `${hours} 小时`
    if (rest === 0) return hourText
    return english ? `${hourText} ${englishUnit(rest, 'minute')}` : `${hourText} ${rest} 分钟`
  }
  return english ? englishUnit(minutes, 'minute') : `${minutes} 分钟`
}

export function percent(value: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((value / total) * 100)))
}

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

export function downloadText(filename: string, contents: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob(['\uFEFF', contents], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
