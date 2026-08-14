import { Activity, Camera, CameraOff, ChevronRight, Clock3, Download, Eye, HeartPulse, LockKeyhole, RotateCcw, ShieldCheck, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { SelectField } from '../../../components/SelectField'
import type { AppSettings, AppSnapshot } from '../../../types'
import { cn } from '../../../utils'

function intervalLabel(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`
  const minutes = seconds / 60
  return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} 分钟`
}

function Toggle({ checked, onChange, label, description, className }: { checked: boolean; onChange: (checked: boolean) => void; label: string; description: string; className?: string }) {
  return (
    <label className={cn('relative flex min-h-15 cursor-pointer items-center gap-4 border-b border-edge-soft py-2', className)}>
      <div className="flex flex-1 flex-col gap-1">
        <strong className="text-sm leading-5 2xl:text-base">{label}</strong>
        <small className="text-[11px] leading-4 text-muted 2xl:text-[13px]">{description}</small>
      </div>
      <input className="peer sr-only" type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
      <span className="relative h-5.5 w-9.5 shrink-0 rounded-full bg-edge transition after:absolute after:left-0.75 after:top-0.75 after:size-4 after:rounded-full after:bg-panel after:shadow-sm after:transition after:content-[''] peer-checked:bg-accent peer-checked:after:translate-x-4" />
    </label>
  )
}

const primaryButtonClass =
  'inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-inverse shadow-control transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50'
const settingsPanelClass = 'rounded-[18px] border border-edge bg-panel p-6 shadow-panel'
const sectionTitleClass =
  'mb-1 flex items-center gap-4 border-b border-edge-soft pb-5 [&_h2]:mb-1 [&_h2]:text-[22px] [&_h2]:font-black [&_p]:m-0 [&_p]:text-xs [&_p]:leading-5 [&_p]:text-muted 2xl:[&_h2]:text-[24px] 2xl:[&_p]:text-[13px]'
const fieldGridClass =
  'grid grid-cols-1 gap-4 border-b border-edge-soft py-5 sm:grid-cols-2 [&_label]:flex [&_label]:flex-col [&_label]:gap-2.5 [&_label>span]:text-xs [&_label>span]:font-bold [&_label>span]:text-muted [&_input]:h-11 [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-edge [&_input]:bg-field [&_input]:px-4 [&_input]:text-[13px] disabled:[&_input]:cursor-not-allowed'
const selectFieldClass = 'flex min-w-0 flex-col gap-2.5 [&>span]:text-xs [&>span]:font-bold [&>span]:text-muted'
const eyebrowClass = 'text-xs font-extrabold tracking-[.14em] text-accent'

function SedentaryThresholdControl({ seconds, onChange }: { seconds: number; onChange: (seconds: number) => void }) {
  const [unit, setUnit] = useState<'seconds' | 'minutes'>(seconds < 60 ? 'seconds' : 'minutes')
  const displayValue = unit === 'seconds' ? seconds : Number((seconds / 60).toFixed(1))
  const presets = [
    { label: '10 秒测试', seconds: 10 },
    { label: '30 秒测试', seconds: 30 },
    { label: '30 分钟 · 积极', seconds: 1_800 },
    { label: '45 分钟 · 推荐', seconds: 2_700, recommended: true },
    { label: '60 分钟 · 温和', seconds: 3_600 }
  ]
  const commit = (raw: number) => {
    const next = unit === 'seconds' ? raw : raw * 60
    onChange(Math.min(14_400, Math.max(5, Math.round(next))))
  }

  return (
    <div className="rounded-[14px] border border-warning/25 bg-warning-soft p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] font-bold text-muted">久坐首次提醒</span>
          <strong className="text-[17px] text-warning">{intervalLabel(seconds)}</strong>
        </div>
        <HeartPulse className="shrink-0 text-warning" size={16} />
      </div>
      <p className="mb-0 mt-1 text-[8px] leading-3.5 text-muted">建议用轻活动打断连续久坐；45 分钟是兼顾专注的产品参考，并非医疗处方。</p>
      <div className="mt-2.5 grid grid-cols-[minmax(0,1fr)_92px] gap-2">
        <label className="grid gap-1.5">
          <span className="text-[9px] font-bold text-muted">自定义时长</span>
          <input
            className="h-10 w-full rounded-lg border border-edge bg-field px-3 text-[11px]"
            aria-label="自定义久坐提醒时长"
            type="number"
            min={unit === 'seconds' ? 5 : 0.1}
            max={unit === 'seconds' ? 14_400 : 240}
            step={unit === 'seconds' ? 1 : 0.5}
            value={displayValue}
            onChange={event => commit(Number(event.target.value))}
          />
        </label>
        <div className="grid gap-1.5">
          <span className="text-[9px] font-bold text-muted">单位</span>
          <SelectField
            value={unit}
            options={[
              { value: 'seconds', label: '秒' },
              { value: 'minutes', label: '分钟' }
            ]}
            ariaLabel="久坐提醒时间单位"
            onChange={setUnit}
          />
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5" aria-label="快速时长">
        {presets.map(preset => (
          <button
            key={preset.seconds}
            className={cn(
              'min-h-7 rounded-full border border-edge bg-panel/80 px-2.5 text-[9px] text-muted transition hover:border-warning hover:bg-warning-soft hover:text-warning',
              preset.recommended && 'border-warning/45 text-warning-foreground',
              seconds === preset.seconds && 'border-warning bg-warning-soft text-warning'
            )}
            onClick={() => {
              setUnit(preset.seconds < 60 ? 'seconds' : 'minutes')
              onChange(preset.seconds)
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[8px] text-muted">
        <span className={cn('size-1.5 rounded-full', seconds > 3_600 ? 'bg-warning' : 'bg-accent')} />{' '}
        {seconds <= 30 ? '测试模式：不受工作与静默时段限制' : seconds > 3_600 ? '连续时长较长，建议优先选择 30–60 分钟' : seconds >= 1_800 ? '当前处于 30–60 分钟参考范围' : '提醒较频繁，可按工作节奏调整'}
      </div>
    </div>
  )
}

type SettingsTab = 'detection' | 'reminder' | 'island' | 'runtime' | 'privacy'

const settingsTabs: Array<{
  id: SettingsTab
  label: string
  description: string
  icon: typeof Camera
  tone: string
}> = [
  {
    id: 'detection',
    label: '检测',
    description: '摄像头、识别灵敏度与行为阈值',
    icon: Camera,
    tone: 'bg-accent-soft text-accent'
  },
  {
    id: 'reminder',
    label: '提醒',
    description: '久坐节奏、午间静默与通知方式',
    icon: Clock3,
    tone: 'bg-warning-soft text-warning'
  },
  {
    id: 'island',
    label: '灵动岛',
    description: '顶部状态、行为提醒与窗口协同',
    icon: Sparkles,
    tone: 'bg-accent-soft text-accent'
  },
  {
    id: 'runtime',
    label: '运行',
    description: '工作时段、后台运行与开机启动',
    icon: Activity,
    tone: 'bg-info-soft text-info'
  },
  {
    id: 'privacy',
    label: '数据与隐私',
    description: '本地统计、导出与数据清理',
    icon: ShieldCheck,
    tone: 'bg-neutral-soft text-muted'
  }
]

export function SettingsPage({
  snapshot,
  error,
  onSave,
  onExport,
  onDeleteData,
  onEnableCamera,
  onRecalibrate
}: {
  snapshot: AppSnapshot
  error: string | null
  onSave: (settings: AppSettings) => Promise<boolean>
  onExport: () => void
  onDeleteData: () => void
  onEnableCamera: () => void
  onRecalibrate: () => void
}) {
  const [draft, setDraft] = useState(snapshot.settings)
  const [activeTab, setActiveTab] = useState<SettingsTab>('detection')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const persistedKey = JSON.stringify(snapshot.settings)
  const lastSyncedKey = useRef(persistedKey)
  useEffect(() => {
    setDraft(current => (JSON.stringify(current) === lastSyncedKey.current ? snapshot.settings : current))
    lastSyncedKey.current = persistedKey
  }, [persistedKey, snapshot.settings])
  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSaveState('idle')
    setDraft(current => ({ ...current, [key]: value }))
  }
  const setSedentarySeconds = (seconds: number) => {
    setSaveState('idle')
    setDraft(current => ({
      ...current,
      sedentarySeconds: seconds,
      sedentaryMinutes: Math.min(120, Math.max(1, Math.ceil(seconds / 60)))
    }))
  }
  const changed = useMemo(() => JSON.stringify(draft) !== JSON.stringify(snapshot.settings), [draft, snapshot.settings])
  const save = async () => {
    setSaveState('saving')
    const ok = await onSave(draft)
    setSaveState(ok ? 'saved' : 'error')
    if (ok) window.setTimeout(() => setSaveState('idle'), 2_000)
  }
  const saveButton = (
    <button className={primaryButtonClass} disabled={!changed || saveState === 'saving'} onClick={() => void save()}>
      {saveState === 'saving' ? '正在保存…' : saveState === 'saved' ? '已保存并生效' : '保存并应用'}
    </button>
  )
  const activeMeta = settingsTabs.find(tab => tab.id === activeTab) ?? settingsTabs[0]!
  const ActiveIcon = activeMeta.icon

  return (
    <div className="relative mx-auto grid h-full min-h-0 w-full max-w-[1680px] grid-rows-[auto_minmax(0,1fr)] gap-5 overflow-hidden px-[clamp(18px,3vw,56px)] py-[clamp(16px,2.4vh,32px)]">
      <header className="flex min-h-17 items-center justify-between gap-6">
        <div className="min-w-0">
          <span className={eyebrowClass}>偏好与隐私</span>
          <h1 className="mb-1 mt-1.5 truncate text-[clamp(28px,2.2vw,38px)] font-black leading-tight tracking-[-.035em]">让提醒适合你的节奏</h1>
          <p className="m-0 truncate text-xs leading-5 text-muted 2xl:text-sm">切换分类不会丢失修改；保存后立即作用于当前监测。</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {changed && (
            <span className="hidden items-center gap-1.5 text-xs font-bold text-warning sm:flex">
              <i className="size-1.5 rounded-full bg-warning" />
              有未保存的更改
            </span>
          )}
          {saveButton}
        </div>
      </header>

      <div className="grid min-h-0 grid-cols-[88px_minmax(0,1fr)] gap-4 min-[1040px]:grid-cols-[200px_minmax(0,1fr)] 2xl:grid-cols-[240px_minmax(0,1fr)] 2xl:gap-6">
        <nav className="flex min-h-0 flex-col gap-1.5 rounded-[18px] border border-edge bg-panel-muted p-2" role="tablist" aria-label="偏好设置分类" aria-orientation="vertical">
          <span className="hidden px-3 pb-1 pt-2 text-xs font-extrabold tracking-[.14em] text-subtle min-[1040px]:block">设置分类</span>
          {settingsTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              id={`settings-tab-${id}`}
              title={label}
              className={cn(
                'relative flex h-16 min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl px-2 text-[11px] font-bold text-muted transition hover:bg-panel hover:text-foreground min-[1040px]:h-14 min-[1040px]:flex-row min-[1040px]:justify-start min-[1040px]:gap-3 min-[1040px]:px-4 min-[1040px]:text-sm 2xl:h-16 2xl:text-base',
                activeTab === id && 'bg-panel text-accent shadow-control before:absolute before:bottom-2 before:left-0 before:top-2 before:w-0.5 before:rounded-full before:bg-accent'
              )}
              role="tab"
              aria-selected={activeTab === id}
              aria-controls={`settings-panel-${id}`}
              tabIndex={activeTab === id ? 0 : -1}
              onClick={() => setActiveTab(id)}
            >
              <Icon className="shrink-0" size={19} />
              <span className="max-w-full truncate">{label}</span>
              <ChevronRight className="ml-auto hidden text-subtle min-[1040px]:block" size={15} />
            </button>
          ))}
          <div className="mt-auto hidden rounded-xl border border-edge-soft bg-panel/70 p-4 min-[1040px]:block">
            <strong className="block text-xs">统一保存</strong>
            <p className="mb-0 mt-1 text-[11px] leading-4 text-muted">切换分类不会丢失当前修改。</p>
          </div>
        </nav>

        <section className={cn(settingsPanelClass, 'min-h-0 overflow-y-auto p-[clamp(20px,2.2vw,36px)]')} id={`settings-panel-${activeTab}`} role="tabpanel" aria-labelledby={`settings-tab-${activeTab}`}>
          <div className={sectionTitleClass}>
            <span className={cn('grid size-12 place-items-center rounded-[15px] 2xl:size-14', activeMeta.tone)}>
              <ActiveIcon size={24} />
            </span>
            <div className="min-w-0">
              <h2>{activeMeta.label}</h2>
              <p>{activeMeta.description}</p>
            </div>
          </div>

          {activeTab === 'detection' && (
            <div>
              <Toggle checked={draft.cameraEnabled} onChange={value => set('cameraEnabled', value)} label="使用摄像头进行姿态检测" description="关闭后自动切换到普通定时久坐提醒" />
              <div className={fieldGridClass}>
                <div className={selectFieldClass}>
                  <span>检测灵敏度</span>
                  <SelectField
                    value={draft.sensitivity}
                    options={[
                      { value: 'low', label: '较低 · 减少误报' },
                      { value: 'balanced', label: '平衡 · 推荐' },
                      { value: 'high', label: '较高 · 更早识别' }
                    ]}
                    ariaLabel="检测灵敏度"
                    onChange={value => set('sensitivity', value)}
                  />
                </div>
                <div className={selectFieldClass}>
                  <span>低头提醒阈值</span>
                  <SelectField value={draft.headDownMinutes} options={[1, 2, 3, 5, 10].map(value => ({ value, label: `${value} 分钟` }))} ariaLabel="低头提醒阈值" onChange={value => set('headDownMinutes', value)} />
                </div>
              </div>
              {snapshot.monitoringMode === 'camera' && snapshot.calibrated ? (
                <button className="inline-flex items-center gap-2 pt-4 text-sm font-bold text-accent hover:text-accent-strong" onClick={onRecalibrate}>
                  <RotateCcw size={18} /> 重新校准正常坐姿
                </button>
              ) : (
                <button className="inline-flex items-center gap-2 pt-4 text-sm font-bold text-accent hover:text-accent-strong" onClick={onEnableCamera}>
                  <Camera size={18} /> {snapshot.calibrated ? '重新启用姿势检测' : '开启姿势检测并校准'}
                </button>
              )}
            </div>
          )}

          {activeTab === 'reminder' && (
            <div className="grid min-h-0 gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(310px,.85fr)]">
              <section className="min-w-0 rounded-[16px] border border-edge-soft bg-panel-muted/65 p-4 2xl:p-5" aria-labelledby="reminder-cadence-title">
                <div className="mb-4">
                  <h3 className="m-0 text-base font-black 2xl:text-lg" id="reminder-cadence-title">
                    久坐节奏
                  </h3>
                  <p className="mb-0 mt-1 text-[11px] leading-5 text-muted 2xl:text-xs">设置首次提醒、重复间隔和休息时长</p>
                </div>
                <SedentaryThresholdControl seconds={draft.sedentarySeconds} onChange={setSedentarySeconds} />
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className={selectFieldClass}>
                    <span>重复提醒</span>
                    <SelectField
                      disabled={draft.sedentarySeconds <= 30}
                      value={draft.repeatReminderMinutes}
                      options={
                        draft.sedentarySeconds <= 30
                          ? [
                              {
                                value: draft.repeatReminderMinutes,
                                label: `${draft.sedentarySeconds} 秒 · 跟随测试阈值`
                              }
                            ]
                          : [5, 10, 15, 20, 30].map(value => ({ value, label: `${value} 分钟` }))
                      }
                      ariaLabel="重复提醒"
                      onChange={value => set('repeatReminderMinutes', value)}
                    />
                  </div>
                  <div className={selectFieldClass}>
                    <span>有效休息</span>
                    <SelectField
                      value={draft.breakMinutes}
                      options={[
                        { value: 1, label: '1 分钟 · 快速活动' },
                        { value: 2, label: '2 分钟 · 轻量休息' },
                        { value: 3, label: '3 分钟 · 日常节奏' },
                        { value: 5, label: '5 分钟 · 健康推荐' },
                        { value: 10, label: '10 分钟 · 充分休息' }
                      ]}
                      ariaLabel="有效休息"
                      onChange={value => set('breakMinutes', value)}
                    />
                  </div>
                </div>
              </section>

              <section className="min-w-0 rounded-[16px] border border-edge-soft bg-panel-muted/65 p-4 2xl:p-5" aria-labelledby="quiet-hours-title">
                <div className="mb-4">
                  <h3 className="m-0 text-base font-black 2xl:text-lg" id="quiet-hours-title">
                    静默时段
                  </h3>
                  <p className="mb-0 mt-1 text-[11px] leading-5 text-muted 2xl:text-xs">需要安静工作时，暂停午间提醒</p>
                </div>
                <Toggle className="min-h-0 border-0 py-0" checked={draft.quietHoursEnabled} onChange={value => set('quietHoursEnabled', value)} label="上午 / 下午模式（午间静默）" description="关闭为连续工作；开启后午间暂停提醒" />
                <div
                  className={cn(
                    'mt-5 grid grid-cols-1 gap-4 border-t border-edge-soft pt-5 sm:grid-cols-2 [&_label]:flex [&_label]:flex-col [&_label]:gap-2.5 [&_label>span]:text-xs [&_label>span]:font-bold [&_label>span]:text-muted [&_input]:h-11 [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-edge [&_input]:bg-field [&_input]:px-4 [&_input]:text-[13px] disabled:[&_input]:cursor-not-allowed',
                    !draft.quietHoursEnabled && 'opacity-50'
                  )}
                >
                  <label>
                    <span>午间静默开始</span>
                    <input type="time" disabled={!draft.quietHoursEnabled} value={draft.quietStart} onChange={event => set('quietStart', event.target.value)} />
                  </label>
                  <label>
                    <span>午间静默结束</span>
                    <input type="time" disabled={!draft.quietHoursEnabled} value={draft.quietEnd} onChange={event => set('quietEnd', event.target.value)} />
                  </label>
                </div>
              </section>

              <section className="rounded-[16px] border border-edge-soft bg-panel-muted/65 p-4 xl:col-span-2 2xl:p-5" aria-labelledby="notification-style-title">
                <div>
                  <h3 className="m-0 text-base font-black 2xl:text-lg" id="notification-style-title">
                    通知方式
                  </h3>
                  <p className="mb-0 mt-1 text-[11px] leading-5 text-muted 2xl:text-xs">选择提醒是否重复、静音或播放声音</p>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-edge-soft bg-panel px-4 py-3">
                    <Toggle
                      className="min-h-0 border-0 py-0"
                      checked={draft.repeatReminders}
                      onChange={value => set('repeatReminders', value)}
                      label="持续行为重复提醒"
                      description={draft.sedentarySeconds <= 30 ? `测试时每 ${draft.sedentarySeconds} 秒重复` : '遵守同类提醒冷却时间'}
                    />
                  </div>
                  <div className="rounded-xl border border-edge-soft bg-panel px-4 py-3">
                    <Toggle className="min-h-0 border-0 py-0" checked={draft.meetingMode} onChange={value => set('meetingMode', value)} label="会议模式" description="仅显示安静通知" />
                  </div>
                  <div className="rounded-xl border border-edge-soft bg-panel px-4 py-3">
                    <Toggle className="min-h-0 border-0 py-0" checked={draft.soundEnabled} onChange={value => set('soundEnabled', value)} label="通知声音" description="会议模式下仍保持静音" />
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'island' && (
            <div>
              <Toggle checked={draft.islandEnabled} onChange={value => set('islandEnabled', value)} label="启用灵动岛" description="总开关；关闭后保留下面的行为偏好" />
              <div className={cn('grid gap-x-5 md:grid-cols-2', !draft.islandEnabled && 'pointer-events-none opacity-50')}>
                <Toggle checked={draft.islandReminderEnabled} onChange={value => set('islandReminderEnabled', value)} label="久坐提醒" description="显示休息、稍后和忽略操作" />
                <Toggle checked={draft.islandAwayEnabled} onChange={value => set('islandAwayEnabled', value)} label="离座状态" description="确认无人后保持显示计时暂停" />
                <Toggle checked={draft.islandHeadDownEnabled} onChange={value => set('islandHeadDownEnabled', value)} label="低头状态" description="持续确认低头后显示提示" />
                <Toggle checked={draft.islandBreakEnabled} onChange={value => set('islandBreakEnabled', value)} label="休息倒计时" description="休息期间显示倒计时与操作" />
                <Toggle checked={draft.islandPersistentStatusEnabled} onChange={value => set('islandPersistentStatusEnabled', value)} label="持续检测状态" description="控制紧凑状态是否常驻；关闭后仍可悬停查看详情" />
                <Toggle checked={draft.islandPausedStatusEnabled} onChange={value => set('islandPausedStatusEnabled', value)} label="暂停状态" description="暂停检测时显示恢复时间与暂停状态" />
                <Toggle checked={draft.islandPeekThroughEnabled} onChange={value => set('islandPeekThroughEnabled', value)} label="鼠标放大镜效果" description="鼠标经过灵动岛时显示局部放大镜；关闭后仅隐藏放大镜" />
                <Toggle checked={draft.islandAllowWithMainWindow} onChange={value => set('islandAllowWithMainWindow', value)} label="与普通窗口同时显示" description="主窗口可见时也显示灵动岛" />
              </div>
              <Toggle checked={draft.islandPermanentCloseEnabled} onChange={value => set('islandPermanentCloseEnabled', value)} label="允许从灵动岛彻底关闭" description="开启后关闭菜单才显示彻底关闭选项" />
            </div>
          )}

          {activeTab === 'runtime' && (
            <div>
              <div className={fieldGridClass}>
                <label>
                  <span>工作开始</span>
                  <input type="time" value={draft.workdayStart} onChange={event => set('workdayStart', event.target.value)} />
                </label>
                <label>
                  <span>工作结束</span>
                  <input type="time" value={draft.workdayEnd} onChange={event => set('workdayEnd', event.target.value)} />
                </label>
              </div>
              <div className="grid gap-x-5 md:grid-cols-2">
                <Toggle checked={draft.runInBackground} onChange={value => set('runInBackground', value)} label="关闭窗口后在后台运行" description="隐藏后继续低功耗监测" />
                <Toggle checked={draft.autostart} onChange={value => set('autostart', value)} label="开机自动启动" description="登录系统后自动守护工作节奏" />
                <Toggle checked={draft.weekendEnabled} onChange={value => set('weekendEnabled', value)} label="周末启用" description="周六和周日也执行工作时段规则" />
              </div>
            </div>
          )}

          {activeTab === 'privacy' && (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="rounded-[14px] border border-edge-soft bg-panel-muted p-4">
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent">
                      <ShieldCheck size={18} />
                    </span>
                    <div>
                      <strong className="text-xs">原始画面不落盘</strong>
                      <p className="m-0 mt-0.5 text-[8px] text-muted">摄像头画面仅在本机内存中处理。</p>
                    </div>
                  </div>
                  <ul className="mt-3 grid list-none gap-2 p-0 text-[9px] text-muted [&_li]:flex [&_li]:items-center [&_li]:gap-2 [&_svg]:text-accent">
                    <li>
                      <Eye size={14} /> 不进行身份识别
                    </li>
                    <li>
                      <CameraOff size={14} /> 不保存视频或截图
                    </li>
                    <li>
                      <LockKeyhole size={14} /> 不上传摄像头数据
                    </li>
                  </ul>
                  <Toggle checked={draft.statisticsEnabled} onChange={value => set('statisticsEnabled', value)} label="保存本地行为统计" description="关闭后停止累计，已有数据不自动删除" />
                </div>
              </div>
              <div>
                <div className="rounded-[14px] border border-edge-soft bg-panel-muted p-4">
                  <strong className="text-xs">本地数据管理</strong>
                  <p className="mb-3 mt-1 text-[9px] leading-4 text-muted">导出内容仅包含日期、时长、次数与结构化行为历史，不含图片。</p>
                  <div className="grid gap-2">
                    <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-edge bg-panel px-4 text-[10px] font-bold text-muted hover:bg-panel-muted" onClick={onExport}>
                      <Download size={16} /> 导出 CSV
                    </button>
                    <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-[10px] font-bold text-danger hover:bg-danger-soft" onClick={onDeleteData}>
                      <Trash2 size={16} /> 删除全部统计与行为历史
                    </button>
                  </div>
                  <p className="mb-0 mt-3 text-[8px] leading-3.5 text-subtle">健康提醒用于日常行为提醒，不用于疾病诊断或替代医生建议。</p>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {saveState === 'error' && (
        <div className="absolute bottom-4 left-1/2 z-20 w-[min(520px,calc(100%-32px))] -translate-x-1/2 rounded-xl border border-warning/35 bg-warning-soft p-3 text-warning-foreground shadow-panel" role="alert">
          <strong className="text-xs">设置没有保存</strong>
          <span className="ml-2 text-[9px]">{error ?? '请检查输入范围后重试，原有设置仍保持有效。'}</span>
        </div>
      )}
    </div>
  )
}
