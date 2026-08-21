import { isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Calibration } from './features/calibration/Calibration'
import { Dashboard } from './features/dashboard/Dashboard'
import { Onboarding } from './features/onboarding/Onboarding'
import { HelpDialog } from './features/help/HelpDialog'
import { BreakIsland } from './features/reminders/BreakIsland'
import { ReminderOverlay } from './features/reminders/ReminderOverlay'
import { coreClient } from './infra/client'
import { mockCore } from './infra/mockCore'
import { useAppStore } from './store'
import type { AppSettings, AppSnapshot, CalibrationResult, VisionObservation } from './types'
import { downloadText } from './utils'
import { useVisionMonitor } from './vision/useVisionMonitor'
import { languageOf, localizeBackendMessage, type Language } from './i18n'
import { defineMessages, localizeMessages, translateNow } from './runtimeI18n'
import { UpdateDialog, useAppUpdater } from './features/updates/UpdatePanel'

const appMessages = defineMessages({
  operationUnavailable: '操作暂时无法完成',
  title: '健康提醒 · 姿态与久坐',
  cameraFailure: '摄像头或姿态模型无法启动',
  unavailableMark: '健',
  unavailableTitle: '本地状态暂不可用',
  unavailableHint: '请关闭后重新打开应用',
  exportFilename: '健康提醒统计',
  confirmDelete: '确认删除全部本地统计数据？此操作无法撤销。设置和校准信息会保留。',
  previewReminder: '预览提醒'
})

function errorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : fallback
}

function currentLocalDateKey(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function App() {
  const { snapshot, page, statistics, behaviorHistory, busy, error, setSnapshot, setPage, setStatistics, setBehaviorHistory, setBusy, setError } = useAppStore()
  const [showIntro, setShowIntro] = useState(false)
  const [cameraFailure, setCameraFailure] = useState<string | null>(null)
  const [cameraSetupError, setCameraSetupError] = useState<string | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const ingesting = useRef(false)
  const snapshotEpoch = useRef(0)
  const lastReminderId = useRef<string | null>(null)
  const fallbackStarted = useRef(false)
  const calibrationOrigin = useRef<'onboarding' | 'dashboard'>('onboarding')
  const language = languageOf(snapshot?.settings.language ?? window.localStorage.getItem('cervical-guard-language'))
  const messages = useMemo(() => localizeMessages(appMessages, language), [language])
  const updater = useAppUpdater(language)

  const run = useCallback(
    async (operation: () => Promise<AppSnapshot>) => {
      const epoch = ++snapshotEpoch.current
      setBusy(true)
      try {
        const next = await operation()
        if (epoch === snapshotEpoch.current) setSnapshot(next)
        return next
      } catch (reason) {
        setError(errorMessage(reason, messages.operationUnavailable))
        return null
      } finally {
        setBusy(false)
      }
    },
    [messages.operationUnavailable, setBusy, setError, setSnapshot]
  )

  useEffect(() => {
    let cancelled = false
    const epoch = snapshotEpoch.current
    void coreClient
      .getSnapshot()
      .then(value => {
        if (!cancelled && epoch === snapshotEpoch.current) setSnapshot(value)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorMessage(reason, messages.operationUnavailable))
      })
    return () => {
      cancelled = true
    }
  }, [messages.operationUnavailable, setError, setSnapshot])

  useEffect(() => {
    if (!isTauri()) return
    let active = true
    let unlisten: (() => void) | undefined
    void listen<AppSnapshot>('monitoring://snapshot', event => {
      if (active) setSnapshot(event.payload)
    })
      .then(dispose => {
        if (active) unlisten = dispose
        else dispose()
      })
      .catch((reason: unknown) => {
        if (active) setError(errorMessage(reason, messages.operationUnavailable))
      })
    return () => {
      active = false
      unlisten?.()
    }
  }, [messages.operationUnavailable, setError, setSnapshot])

  useEffect(() => {
    // Tauri 后台每秒广播完整快照；同时轮询会产生重复 IPC，并可能让较早发出的
    // 旧响应覆盖刚收到的“开始休息”等新状态。浏览器模拟环境才需要主动轮询。
    if (isTauri() || !snapshot || snapshot.lifecycle === 'unavailable' || snapshot.lifecycle === 'calibrating') return
    const timer = window.setInterval(() => {
      const epoch = snapshotEpoch.current
      void coreClient
        .getSnapshot()
        .then(value => {
          if (epoch === snapshotEpoch.current) setSnapshot(value)
        })
        .catch(() => undefined)
    }, 1_000)
    return () => window.clearInterval(timer)
  }, [setSnapshot, snapshot?.lifecycle])

  useEffect(() => {
    if (page !== 'statistics') return
    void Promise.all([coreClient.getStatistics(30), coreClient.getBehaviorHistoryForDate(currentLocalDateKey())])
      .then(([rows, events]) => {
        setStatistics(rows)
        setBehaviorHistory(events)
      })
      .catch((reason: unknown) => setError(errorMessage(reason, messages.operationUnavailable)))
  }, [messages.operationUnavailable, page, setBehaviorHistory, setError, setStatistics])

  const loadBehaviorHistoryDate = useCallback(async (localDate: string) => {
    try {
      setBehaviorHistory(await coreClient.getBehaviorHistoryForDate(localDate))
    } catch (reason) {
      setError(errorMessage(reason, messages.operationUnavailable))
    }
  }, [messages.operationUnavailable, setBehaviorHistory, setError])

  useEffect(() => {
    const reminder = snapshot?.currentReminder
    if (!reminder || reminder.id === lastReminderId.current) return
    lastReminderId.current = reminder.id
    if (!isTauri()) {
      const silent = !snapshot.settings.soundEnabled || snapshot.settings.meetingMode
      void coreClient.notify(translateNow(reminder.title, language), translateNow(reminder.message, language), silent)
    }
  }, [language, snapshot?.currentReminder, snapshot?.settings.meetingMode, snapshot?.settings.soundEnabled])

  const onObservation = useCallback(
    (observation: VisionObservation) => {
      if (ingesting.current) return
      ingesting.current = true
      const epoch = snapshotEpoch.current
      void coreClient
        .ingestObservation(observation)
        .then(value => {
          if (epoch === snapshotEpoch.current) setSnapshot(value)
        })
        .catch((reason: unknown) => setCameraFailure(errorMessage(reason, messages.operationUnavailable)))
        .finally(() => {
          ingesting.current = false
        })
    },
    [messages.operationUnavailable, setSnapshot]
  )

  // 休息期间也保持摄像头低功耗运行：既能在休息中感知离座行为，
  // 也让休息结束的瞬间检测管线已就绪，避免重新打开摄像头导致的 ingest 失败。
  const cameraActive = Boolean(snapshot && (snapshot.lifecycle === 'monitoring' || snapshot.lifecycle === 'break') && snapshot.monitoringMode === 'camera' && snapshot.calibrated)
  const vision = useVisionMonitor({
    active: cameraActive,
    cameraId: snapshot?.settings.cameraId ?? 'default',
    baseline: snapshot?.calibrationBaseline ?? null,
    headDownEnabled: snapshot?.settings.islandHeadDownEnabled ?? false,
    onObservation
  })

  useEffect(() => {
    if (!snapshot) return
    document.documentElement.lang = language
    document.title = messages.title
  }, [language, messages.title])

  // 摄像头管线恢复就绪后，清除上一轮残留的失败提示（如休息切换期间的瞬时错误）。
  useEffect(() => {
    if (cameraActive && vision.status === 'ready') setCameraFailure(null)
  }, [cameraActive, vision.status])

  useEffect(() => {
    if (!cameraActive || vision.status !== 'error' || fallbackStarted.current) return
    fallbackStarted.current = true
    setCameraFailure(vision.error ?? messages.cameraFailure)
    void coreClient
      .startMonitoring('timer')
      .then(setSnapshot)
      .catch((reason: unknown) => setError(errorMessage(reason, messages.operationUnavailable)))
  }, [cameraActive, messages.cameraFailure, messages.operationUnavailable, setError, setSnapshot, vision.error, vision.status])

  useEffect(() => {
    if (cameraActive) fallbackStarted.current = false
  }, [cameraActive])

  // 手动暂停会按设计停止摄像头会话，不属于设备故障。恢复后等待当前会话
  // 自己产生错误或超时，不能沿用暂停前残留的失败横幅。
  useEffect(() => {
    if (snapshot?.lifecycle === 'paused' || cameraActive) setCameraFailure(null)
  }, [cameraActive, snapshot?.lifecycle])

  if (!snapshot) {
    return (
      <div className="grid h-full place-content-center justify-items-center gap-3.5 bg-canvas text-xs text-muted">
        <div className="grid size-13 place-items-center rounded-[17px_17px_17px_6px] bg-accent text-[19px] font-extrabold text-inverse shadow-panel">{messages.unavailableMark}</div>
        <strong>{messages.unavailableTitle}</strong>
        <span>{messages.unavailableHint}</span>
        {error && <small className="text-danger">{localizeBackendMessage(error, language)}</small>}
      </div>
    )
  }

  const startCameraOnboarding = async () => {
    setBusy(true)
    setCameraSetupError(null)
    try {
      // 生产环境先完成系统权限和设备能力预检。失败时保留首次欢迎页，
      // 避免用户进入校准后才发现摄像头不可用。
      await coreClient.listCameras()
      calibrationOrigin.current = 'onboarding'
      setShowIntro(false)
      await run(() => coreClient.finishOnboarding('camera', 'prompt'))
    } catch (reason) {
      setCameraSetupError(errorMessage(reason, messages.operationUnavailable))
    } finally {
      setBusy(false)
    }
  }
  const startTimerOnboarding = async (permission: AppSnapshot['permission'] = 'prompt') => {
    setShowIntro(false)
    await run(() => coreClient.finishOnboarding('timer', permission))
  }
  const finishCalibration = async (baseline: number, cameraId: string) => {
    const result: CalibrationResult = { baseline, cameraId }
    await run(() => coreClient.saveCalibration(result))
  }
  const saveSettings = async (settings: AppSettings) => {
    const next = await run(() => coreClient.updateSettings(settings))
    return Boolean(next)
  }
  const changeLanguage = async (language: Language) => {
    document.documentElement.lang = language
    window.localStorage.setItem('cervical-guard-language', language)
    await saveSettings({ ...snapshot.settings, language })
  }
  const exportStatistics = async () => {
    try {
      const csv = await coreClient.exportStatistics()
      downloadText(`${messages.exportFilename}_${new Date().toISOString().slice(0, 10)}.csv`, csv)
    } catch (reason) {
      setError(errorMessage(reason, messages.operationUnavailable))
    }
  }
  const deleteData = async () => {
    if (!window.confirm(messages.confirmDelete)) return
    await run(() => coreClient.deleteLocalData())
    setStatistics([])
    setBehaviorHistory([])
  }
  const recalibrate = async () => {
    setBusy(true)
    setError(null)
    try {
      calibrationOrigin.current = 'dashboard'
      // 先切到校准页，再由校准页异步枚举摄像头。Windows 驱动查询偶尔较慢，
      // 若在入口处等待会让按钮长时间没有任何视觉反馈。
      const next = await run(() => coreClient.startCalibration())
      if (next) setPage('today')
    } catch (reason) {
      setError(errorMessage(reason, messages.operationUnavailable))
    } finally {
      setBusy(false)
    }
  }
  const enableCameraDetection = async () => {
    setBusy(true)
    setCameraSetupError(null)
    setError(null)
    try {
      // 已有有效校准时直接从临时定时降级恢复摄像头；首次使用才进入校准。
      let next: AppSnapshot | null
      if (snapshot.calibrated && snapshot.permission === 'granted') {
        next = await run(() => coreClient.startMonitoring('camera'))
      } else {
        calibrationOrigin.current = 'dashboard'
        // 校准页自身负责设备和权限检测，因此这里必须先完成页面切换，不能让
        // 同步设备枚举把“开启姿势检测”表现成无法点击。
        next = await run(() => coreClient.startCalibration())
      }
      if (next) setPage('today')
    } catch (reason) {
      setError(errorMessage(reason, messages.operationUnavailable))
    } finally {
      setBusy(false)
    }
  }
  const leaveCalibration = async () => {
    if (calibrationOrigin.current === 'onboarding') {
      setShowIntro(true)
      return
    }
    const mode = snapshot.calibrated && snapshot.permission === 'granted' && snapshot.settings.cameraEnabled ? 'camera' : 'timer'
    const next = await run(() => coreClient.startMonitoring(mode))
    if (next) setPage('today')
  }

  if (showIntro || snapshot.lifecycle === 'unavailable') {
    return <Onboarding busy={busy} language={language} cameraError={localizeBackendMessage(cameraSetupError, language)} onLanguage={language => void changeLanguage(language)} onCamera={() => void startCameraOnboarding()} onTimer={() => void startTimerOnboarding('prompt')} />
  }

  if (snapshot.lifecycle === 'calibrating') {
    return <Calibration initialCameraId={snapshot.settings.cameraId} language={language} busy={busy} onComplete={(baseline, cameraId) => void finishCalibration(baseline, cameraId)} onTimerFallback={() => void startTimerOnboarding('denied')} onBack={() => void leaveCalibration()} />
  }

  return (
    <>
      {/* 隐藏的 Tauri 事件预览接收器：不随页面切换卸载 */}
      <img ref={vision.previewRef} className="pointer-events-none fixed -left-0.5 -top-0.5 size-px opacity-0" alt="" aria-hidden="true" />
      <Dashboard
        snapshot={snapshot}
        page={page}
        statistics={statistics}
        behaviorHistory={behaviorHistory}
        visionStatus={vision.status}
        streamUrl={vision.streamUrl}
        previewError={vision.previewError}
        onRetryPreview={vision.retryPreview}
        onHelp={() => setHelpOpen(true)}
        onLanguage={nextLanguage => void changeLanguage(nextLanguage)}
        updater={updater}
        landmarks={vision.landmarks}
        error={localizeBackendMessage(snapshot.lifecycle === 'paused' ? null : (cameraFailure ?? error), language)}
        onPage={setPage}
        onBehaviorHistoryDate={loadBehaviorHistoryDate}
        onPause={minutes => {
          setCameraFailure(null)
          void run(() => coreClient.pauseMonitoring(minutes))
        }}
        onResume={() => {
          setCameraFailure(null)
          void run(() => coreClient.resumeMonitoring())
        }}
        onStartBreak={() => void run(() => coreClient.startBreak())}
        onEndBreak={() => void run(() => coreClient.endBreak())}
        onSaveSettings={saveSettings}
        onExport={() => void exportStatistics()}
        onDeleteData={() => void deleteData()}
        onEnableCamera={() => void enableCameraDetection()}
        onRecalibrate={() => void recalibrate()}
      />
      <HelpDialog open={helpOpen} language={language} onClose={() => setHelpOpen(false)} />
      <UpdateDialog updater={updater} language={language} />
      {/* 浏览器开发环境保留页面内预览；桌面端只允许 Rust 创建的独立
          reminder-island 窗口承载提醒，避免在主窗口顶部重复渲染“伪灵动岛”。 */}
      {!isTauri() && snapshot.currentReminder && <ReminderOverlay reminder={snapshot.currentReminder} language={language} onBreak={() => void run(() => coreClient.startBreak())} onSnooze={() => void run(() => coreClient.snoozeReminder(10))} onDismiss={() => void run(() => coreClient.dismissReminder())} onPause={() => void run(() => coreClient.pauseMonitoring(60))} />}
      {!isTauri() && snapshot.lifecycle === 'break' && <BreakIsland snapshot={snapshot} language={language} onEnd={() => void run(() => coreClient.endBreak())} />}
      {!isTauri() && import.meta.env.DEV && (
        <button
          className="fixed bottom-3 right-3 z-80 rounded-lg border border-dashed border-edge bg-panel/85 px-2 py-1 text-[8px] text-muted"
          onClick={() => {
            mockCore.triggerDemoReminder()
            void coreClient.getSnapshot().then(setSnapshot)
          }}
        >
          {messages.previewReminder}
        </button>
      )}
    </>
  )
}
