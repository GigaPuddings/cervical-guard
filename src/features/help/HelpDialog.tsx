import { Camera, CircleHelp, Clock3, Coffee, LockKeyhole, Settings, Sparkles, X } from 'lucide-react'
import type { Language } from '../../i18n'

const content = {
  'zh-CN': {
    title: '使用帮助',
    subtitle: '快速了解检测、提醒和隐私边界',
    close: '关闭',
    tips: [
      ['开始与暂停', '在左侧状态卡片中恢复、暂停检测；摄像头不可用时可继续使用普通定时提醒。', Camera],
      ['提醒与休息', '达到久坐阈值后可直接开始休息、稍后提醒或忽略本次。主动休息也会计入今日记录。', Coffee],
      ['灵动岛', '开启“持续检测状态”后，紧凑状态会在后台显示；悬停顶部热区可查看详情，关闭按钮可暂时静默。', Sparkles],
      ['调整节奏', '在偏好设置中修改久坐时长、重复提醒、工作时段、摄像头和灵动岛选项。', Settings],
      ['定时暂停', '暂停期间不会累计连续坐姿时长；恢复后从保留的会话状态继续。', Clock3],
      ['本地隐私', '摄像头画面只在本机内存中处理，不保存视频或截图，也不会上传。', LockKeyhole]
    ] as const,
    note: '健康提醒只用于日常行为提示，不提供医疗诊断。摄像头或更新失败时，弹窗会保留具体原因，便于你检查权限、设备或网络。'
  },
  'en-US': {
    title: 'Help',
    subtitle: 'A quick guide to monitoring, reminders, and privacy',
    close: 'Close',
    tips: [
      ['Start and pause', 'Resume or pause monitoring from the status card. Timer reminders remain available when the camera cannot be used.', Camera],
      ['Reminders and breaks', 'When the sitting threshold is reached, start a break, snooze, or dismiss it. Proactive breaks are included in today’s activity.', Coffee],
      ['Dynamic Island', 'Enable Persistent detection status to keep the compact card in the background. Hover over the top hot zone for details or mute it from the close menu.', Sparkles],
      ['Tune your routine', 'Use Preferences to change sitting duration, repeat reminders, work hours, camera options, and Dynamic Island behavior.', Settings],
      ['Timed pause', 'Continuous sitting time does not increase while paused. Monitoring continues from the preserved session when resumed.', Clock3],
      ['Local privacy', 'Camera frames are processed only in local memory. Video and screenshots are never stored or uploaded.', LockKeyhole]
    ] as const,
    note: 'Health Reminder provides everyday behavior nudges, not medical diagnosis. Camera and updater errors keep their detailed reason so you can check permissions, hardware, or network access.'
  }
} as const

export function HelpDialog({ open, language, onClose }: { open: boolean; language: Language; onClose: () => void }) {
  if (!open) return null
  const t = content[language]
  return (
    <div
      className="fixed inset-0 z-95 grid place-items-center bg-panel-strong/45 p-4 backdrop-blur-[3px]"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="flex max-h-[min(700px,calc(100vh-32px))] w-full max-w-180 flex-col overflow-hidden rounded-3xl border border-edge bg-panel shadow-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-dialog-title"
      >
        <header className="flex items-start gap-4 border-b border-edge px-6 py-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
            <CircleHelp size={23} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-lg font-black" id="help-dialog-title">
              {t.title}
            </h2>
            <p className="mb-0 mt-1 text-[11px] text-muted">{t.subtitle}</p>
          </div>
          <button className="grid size-9 place-items-center rounded-xl text-muted hover:bg-panel-muted hover:text-foreground" aria-label={t.close} onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto px-6 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {t.tips.map(([title, description, Icon]) => (
              <article className="flex gap-3 rounded-2xl border border-edge-soft bg-panel-muted p-4" key={title}>
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-panel text-accent shadow-control">
                  <Icon size={17} />
                </span>
                <div>
                  <h3 className="m-0 text-xs font-extrabold">{title}</h3>
                  <p className="mb-0 mt-1.5 text-[9px] leading-[1.65] text-muted">{description}</p>
                </div>
              </article>
            ))}
          </div>
          <p className="mb-0 mt-4 rounded-2xl bg-warning-soft px-4 py-3 text-[9px] leading-5 text-warning-foreground">{t.note}</p>
        </div>
        <footer className="flex justify-end border-t border-edge bg-panel-muted/55 px-6 py-4">
          <button className="min-h-10 rounded-xl bg-accent px-5 text-[11px] font-bold text-inverse hover:bg-accent-strong" onClick={onClose}>
            {t.close}
          </button>
        </footer>
      </section>
    </div>
  )
}
