import type { Language } from '../../i18n'
import type { AppSnapshot, DailyStatistics } from '../../types'

export type InsightIcon = 'activity' | 'alert' | 'check' | 'clock' | 'target' | 'thumbs-up'
export type InsightTone = 'danger' | 'muted' | 'positive' | 'warning'
export type SessionRingTone = 'danger' | 'info' | 'muted' | 'normal' | 'warning'

export interface MetricInsight {
  note: string
  icon: InsightIcon
  tone: InsightTone
}

export interface TodayMetricInsights {
  sitting: MetricInsight
  headDown: MetricInsight
  breaks: MetricInsight
  reminderFollowups: MetricInsight
  activity: MetricInsight
}

export interface SedentarySessionPresentation {
  status: string
  detail: string | undefined
  tone: SessionRingTone
}

type ReminderScheduleSnapshot = Pick<AppSnapshot, 'currentReminder' | 'lifecycle' | 'monitoringMode' | 'nextReminderAt' | 'personPresent' | 'reminderRemainingSeconds' | 'seatedSeconds' | 'sedentaryReminderState'> & { settings: Pick<AppSnapshot['settings'], 'sedentarySeconds'> }
type HealthAdviceSnapshot = Pick<AppSnapshot, 'behavior' | 'currentReminder' | 'lifecycle' | 'monitoringMode' | 'reminderRemainingSeconds' | 'seatedSeconds' | 'sedentaryReminderState'>

function minuteText(seconds: number, language: Language): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60))
  return language === 'en-US' ? `${minutes} min` : `${minutes} 分钟`
}

function elapsedMinuteText(seconds: number, language: Language): string {
  if (seconds < 60) return language === 'en-US' ? 'under 1 min' : '少于 1 分钟'
  const minutes = Math.floor(seconds / 60)
  return language === 'en-US' ? `${minutes} min` : `${minutes} 分钟`
}

function countText(count: number, unit: string, language: Language): string {
  if (language === 'en-US') return `${count} ${unit}${count === 1 ? '' : 's'}`
  return `${count} ${unit}`
}

export function reminderFollowupCount(today: Pick<DailyStatistics, 'dismissedCount' | 'snoozedCount'>): number {
  return today.dismissedCount + today.snoozedCount
}

function overdueSeconds(seatedSeconds: number, sedentarySeconds: number): number {
  return Math.max(0, seatedSeconds - sedentarySeconds)
}

function overdueText(seconds: number, language: Language): string {
  const elapsed = elapsedMinuteText(seconds, language)
  return language === 'en-US' ? `${elapsed} over the recommendation` : `已超过建议 ${elapsed}`
}

function reminderCountdownText(seconds: number, language: Language): string {
  return seconds < 60 ? (language === 'en-US' ? 'less than 1 min' : '不足 1 分钟') : minuteText(seconds, language)
}

export function formatRestCadence(sedentarySeconds: number, language: Language): string {
  const minutes = Math.max(1, Math.round(sedentarySeconds / 60))
  return language === 'en-US' ? `Take a break every ${minutes} minutes` : `建议每 ${minutes} 分钟休息一次`
}

export function buildSedentarySessionPresentation(snapshot: Pick<AppSnapshot, 'currentReminder' | 'lifecycle' | 'reminderRemainingSeconds' | 'seatedSeconds' | 'sedentaryReminderState'>, sedentarySeconds: number, language: Language): SedentarySessionPresentation {
  const english = language === 'en-US'
  const overdue = overdueSeconds(snapshot.seatedSeconds, sedentarySeconds)

  if (snapshot.sedentaryReminderState === 'break') {
    return { status: english ? 'On break' : '休息中', detail: english ? 'A break over 1 min resets the ring' : '休息满 1 分钟后重置', tone: 'info' }
  }
  if (snapshot.sedentaryReminderState === 'due' || snapshot.currentReminder) {
    return { status: english ? 'Break due' : '提醒已到', detail: overdue > 0 ? overdueText(overdue, language) : undefined, tone: 'danger' }
  }
  if (snapshot.sedentaryReminderState === 'snoozed') {
    const remaining = snapshot.reminderRemainingSeconds == null ? undefined : reminderCountdownText(snapshot.reminderRemainingSeconds, language)
    return { status: english ? 'Snoozed' : '已稍后', detail: remaining ? (english ? `Reminds again in ${remaining}` : `${remaining}后再次提醒`) : overdueText(overdue, language), tone: 'warning' }
  }
  if (snapshot.sedentaryReminderState === 'dismissed') {
    const remaining = snapshot.reminderRemainingSeconds == null ? undefined : reminderCountdownText(snapshot.reminderRemainingSeconds, language)
    return {
      status: english ? 'Closed once' : '已关闭本次',
      detail: remaining ? (english ? `Next reminder in ${remaining}` : `${remaining}后再次提醒`) : (english ? 'Still counts until a real break' : '有效休息后才会重置'),
      tone: 'danger'
    }
  }
  if (snapshot.sedentaryReminderState === 'paused_overdue') {
    return { status: english ? 'Paused overdue' : '暂停超时', detail: overdueText(overdue, language), tone: 'danger' }
  }
  if (snapshot.sedentaryReminderState === 'paused') {
    return { status: english ? 'Paused' : '已暂停', detail: english ? 'Resume to continue timing' : '恢复后继续计时', tone: 'muted' }
  }
  if (snapshot.sedentaryReminderState === 'overdue') {
    return { status: english ? 'Overdue' : '已超时', detail: overdueText(overdue, language), tone: 'danger' }
  }

  const threshold = Math.max(60, sedentarySeconds)
  const remaining = snapshot.reminderRemainingSeconds ?? Math.max(0, threshold - snapshot.seatedSeconds)
  if (remaining <= threshold * 0.2) {
    return { status: english ? 'Nearly due' : '即将休息', detail: `${reminderCountdownText(remaining, language)}${english ? ' left' : '后提醒'}`, tone: 'warning' }
  }
  return { status: english ? 'Active' : '进行中', detail: undefined, tone: 'normal' }
}

export function formatReminderSchedule(snapshot: ReminderScheduleSnapshot, language: Language): string {
  const english = language === 'en-US'
  if (snapshot.currentReminder) return english ? 'Break reminder is due' : '休息提醒已到'
  const overdue = overdueSeconds(snapshot.seatedSeconds, snapshot.settings.sedentarySeconds)
  if (snapshot.lifecycle === 'paused') {
    if (overdue > 0) return english ? `${overdueText(overdue, language)}; reminds after resume` : `${overdueText(overdue, language)}，恢复后继续提醒`
    return english ? 'Resume detection to continue' : '恢复检测后继续计时'
  }
  if (snapshot.lifecycle === 'break') return english ? 'Next cycle starts after this break' : '休息结束后开始下一轮'
  if (!['monitoring', 'degraded'].includes(snapshot.lifecycle)) return english ? 'Waiting for detection to start' : '等待检测开始'

  if (snapshot.sedentaryReminderState === 'dismissed' && snapshot.reminderRemainingSeconds == null) {
    return english ? 'Closed once; take a break to reset' : '已关闭本次，休息后重置'
  }
  if (snapshot.nextReminderAt && snapshot.reminderRemainingSeconds !== null) {
    const reminderDate = new Date(snapshot.nextReminderAt)
    if (!Number.isNaN(reminderDate.getTime())) {
      const time = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(reminderDate)
      const remaining = reminderCountdownText(snapshot.reminderRemainingSeconds, language)
      if (snapshot.sedentaryReminderState === 'snoozed') return english ? `Snoozed until ${time} · ${remaining} left` : `已稍后至 ${time} · 剩余 ${remaining}`
      if (snapshot.sedentaryReminderState === 'dismissed') return english ? `Closed once · next reminder ${time}` : `已关闭本次 · 下次提醒 ${time}`
      return english ? `Next break ${time} · ${remaining} left` : `下次休息 ${time} · 剩余 ${remaining}`
    }
  }
  if (overdue > 0) return overdueText(overdue, language)

  if (snapshot.monitoringMode === 'camera' && !snapshot.personPresent) return english ? 'Timer starts after posture is confirmed' : '确认坐姿后开始倒计时'
  return english ? 'No reminder scheduled right now' : '当前时段无需提醒'
}

export function buildHealthAdvice(snapshot: HealthAdviceSnapshot, sedentarySeconds: number, language: Language): string {
  const english = language === 'en-US'
  if (snapshot.lifecycle === 'break') return english ? 'Stand up and move around during this break, then look into the distance.' : '休息时站起来走动，并把视线投向远处。'
  if (snapshot.currentReminder) return english ? 'Your break reminder is due. Stand up and move for a few minutes now.' : '休息提醒已到，建议现在起身活动几分钟。'
  const overdue = overdueSeconds(snapshot.seatedSeconds, sedentarySeconds)
  if (snapshot.sedentaryReminderState === 'paused_overdue') return english ? `${overdueText(overdue, language)}. Pausing does not reset the sitting session.` : `${overdueText(overdue, language)}，暂停不会重置连续坐姿。`
  if (snapshot.lifecycle === 'paused') return english ? 'Detection is paused. Resume to continue posture tracking and reminders.' : '检测已暂停，恢复后会继续记录坐姿与提醒时间。'
  if (snapshot.sedentaryReminderState === 'snoozed') {
    const remaining = snapshot.reminderRemainingSeconds == null ? undefined : reminderCountdownText(snapshot.reminderRemainingSeconds, language)
    return remaining ? (english ? `Reminder snoozed. You will be reminded again in ${remaining}, and sitting time still accumulates.` : `提醒已稍后，${remaining}后会再次提醒；这段时间仍计入连续坐姿。`) : (english ? 'Reminder snoozed. Sitting time still accumulates.' : '提醒已稍后，这段时间仍计入连续坐姿。')
  }
  if (snapshot.sedentaryReminderState === 'dismissed') return english ? 'This reminder was closed once. A real break is still needed to reset the sitting session.' : '本次提醒已关闭，仍需有效休息才能重置连续坐姿。'
  if (snapshot.sedentaryReminderState === 'overdue') return english ? `${overdueText(overdue, language)}. Take a break before starting another focus block.` : `${overdueText(overdue, language)}，建议先起身休息再进入下一段专注。`
  if (!['monitoring', 'degraded'].includes(snapshot.lifecycle)) return english ? 'Detection is getting ready. Keep the camera available while posture is confirmed.' : '检测准备中，请保持摄像头可用并等待状态确认。'

  if (snapshot.monitoringMode === 'camera') {
    if (snapshot.behavior === 'head_down') return english ? 'Head-down posture detected. Raise the screen and gently draw your chin back.' : '检测到低头，请抬高屏幕并轻轻收回下巴。'
    if (snapshot.behavior === 'no_person') return english ? 'You are away from the seat. A short walk and a distant gaze can help you relax.' : '当前已离座，适当走动和远眺有助于放松。'
    if (snapshot.behavior === 'standing_break') return english ? 'Standing activity detected. Keep moving briefly before returning to your seat.' : '检测到起身活动，继续保持片刻再返回座位。'
    if (snapshot.behavior === 'unknown') return english ? 'Posture is being confirmed. Keep your head visible and face the screen.' : '正在确认姿态，请保持头部清晰并正对屏幕。'
  }

  const threshold = Math.max(60, sedentarySeconds)
  const remainingSeconds = snapshot.reminderRemainingSeconds ?? Math.max(0, threshold - snapshot.seatedSeconds)
  if (remainingSeconds <= threshold * 0.2) {
    const remaining = remainingSeconds < 60 ? (english ? 'less than 1 minute' : '不足 1 分钟') : minuteText(remainingSeconds, language)
    return english ? `${remaining} until the next break. Get ready to stand and move.` : `距离下次休息还有 ${remaining}，可以准备起身活动。`
  }

  if (snapshot.monitoringMode === 'timer') return english ? 'Keep both feet supported and relax your shoulders while the break timer runs.' : '定时提醒进行中，保持双脚平放并放松肩颈。'
  return english ? 'Your posture looks natural. Keep the screen level with your eyes.' : '当前姿态自然，继续保持屏幕与视线平齐。'
}

export function buildTodayMetricInsights(today: DailyStatistics, sedentarySeconds: number, language: Language): TodayMetricInsights {
  const english = language === 'en-US'
  const threshold = Math.max(60, sedentarySeconds)
  const completedCycles = Math.floor(today.seatedSeconds / threshold)
  const remainingToFirstCycle = Math.max(0, threshold - today.seatedSeconds)
  const headDownRatio = today.seatedSeconds > 0 ? Math.round((today.headDownSeconds / today.seatedSeconds) * 100) : 0
  const missingBreaks = Math.max(0, completedCycles - today.breakCount)

  const sitting: MetricInsight = today.seatedSeconds === 0
    ? { note: english ? 'No seated time recorded today' : '今天尚未记录坐姿', icon: 'clock', tone: 'muted' }
    : completedCycles === 0
      ? { note: english ? `${minuteText(remainingToFirstCycle, language)} until the first reminder` : `距首轮提醒还有 ${minuteText(remainingToFirstCycle, language)}`, icon: 'clock', tone: 'positive' }
      : { note: english ? `${countText(completedCycles, 'reminder cycle', language)} reached today` : `今日累计达到 ${completedCycles} 个提醒周期`, icon: missingBreaks > 0 ? 'alert' : 'check', tone: missingBreaks > 0 ? 'warning' : 'positive' }

  const headDown: MetricInsight = today.headDownSeconds === 0
    ? { note: english ? 'No head-down posture detected today' : '今天未检测到低头', icon: 'check', tone: 'positive' }
    : headDownRatio <= 10
      ? { note: english ? `Head-down posture is ${headDownRatio}% of seated time` : `低头占坐姿 ${headDownRatio}%，控制良好`, icon: 'check', tone: 'positive' }
      : headDownRatio <= 25
        ? { note: english ? `Head-down posture is ${headDownRatio}%; lift your gaze often` : `低头占坐姿 ${headDownRatio}%，记得抬头`, icon: 'alert', tone: 'warning' }
        : { note: english ? `Head-down posture is ${headDownRatio}%; adjust screen height` : `低头占坐姿 ${headDownRatio}%，建议调整屏幕`, icon: 'alert', tone: 'danger' }

  const breaks: MetricInsight = completedCycles === 0
    ? { note: english ? `First break is due in ${minuteText(remainingToFirstCycle, language)}` : `首轮休息将在 ${minuteText(remainingToFirstCycle, language)}后提醒`, icon: 'target', tone: 'muted' }
    : missingBreaks === 0
      ? { note: english ? `All ${countText(completedCycles, 'due break', language)} completed` : `今日应休息 ${completedCycles} 次，已全部完成`, icon: 'check', tone: 'positive' }
      : { note: english ? `${countText(missingBreaks, 'break', language)} still due today` : `还差 ${missingBreaks} 次达到今日休息节奏`, icon: 'target', tone: 'warning' }

  const followupCount = reminderFollowupCount(today)
  const reminderFollowups: MetricInsight = followupCount === 0
    ? { note: english ? 'No reminders snoozed or closed today' : '今天没有稍后或关闭本次', icon: 'thumbs-up', tone: 'positive' }
    : followupCount <= 2
      ? { note: english ? `${today.snoozedCount} snoozed · ${today.dismissedCount} closed` : `稍后 ${today.snoozedCount} 次 · 关闭本次 ${today.dismissedCount} 次`, icon: 'alert', tone: 'warning' }
      : { note: english ? `${today.snoozedCount} snoozed · ${today.dismissedCount} closed; adjust cadence` : `稍后 ${today.snoozedCount} 次 · 关闭本次 ${today.dismissedCount} 次`, icon: 'alert', tone: 'danger' }

  const activitySummary = today.awayCount > 0
    ? english
      ? `${countText(today.awayCount, 'away event', language)}, ${elapsedMinuteText(today.awaySeconds, language)} active`
      : `${today.awayCount} 次离座，累计活动 ${elapsedMinuteText(today.awaySeconds, language)}`
    : english
      ? `${elapsedMinuteText(today.awaySeconds, language)} active today`
      : `今日累计活动 ${elapsedMinuteText(today.awaySeconds, language)}`

  const activity: MetricInsight = today.awaySeconds === 0
    ? { note: english ? 'No away activity detected today' : '今天尚未检测到离座活动', icon: 'clock', tone: 'muted' }
    : today.awaySeconds < 5 * 60
      ? { note: activitySummary, icon: 'activity', tone: 'warning' }
      : { note: activitySummary, icon: 'check', tone: 'positive' }

  return { sitting, headDown, breaks, reminderFollowups, activity }
}
