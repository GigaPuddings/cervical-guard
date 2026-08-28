import { isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import packageJson from '../../../package.json'
import { copy, type Language } from '../../i18n'
import type { AppUpdater, UpdateResource, UpdateStage } from './updateTypes'

function shouldCheckWhenOpened(stage: UpdateStage): boolean {
  return stage === 'idle' || stage === 'latest' || stage === 'error'
}

function reasonText(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

export function useAppUpdater(language: Language): AppUpdater {
  const t = copy[language].updater
  const updateRef = useRef<UpdateResource>(null)
  const checkingRef = useRef(false)
  const stageRef = useRef<UpdateStage>('idle')
  const proxyRef = useRef<string | undefined>(undefined)
  const startupCheckedRef = useRef(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [stage, setStage] = useState<UpdateStage>('idle')
  const [currentVersion, setCurrentVersion] = useState(packageJson.version)
  const [version, setVersion] = useState('')
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState('')
  const [progress, setProgress] = useState(0)
  const [downloadedBytes, setDownloadedBytes] = useState(0)
  const [totalBytes, setTotalBytes] = useState(0)
  const [bytesPerSecond, setBytesPerSecond] = useState(0)
  const [downloadStarted, setDownloadStarted] = useState(false)
  const [error, setError] = useState('')
  const updateAvailable = Boolean(version) && stage !== 'latest' && stage !== 'restarting'

  const changeStage = useCallback((next: UpdateStage) => {
    stageRef.current = next
    setStage(next)
  }, [])

  const resolveProxy = useCallback(async () => {
    if (isTauri()) {
      proxyRef.current = await invoke<string | null>('get_update_proxy')
        .then(value => value ?? undefined)
        .catch(() => undefined)
    }
    return proxyRef.current
  }, [])

  const checkUpdate = useCallback(
    async (reveal = true) => {
      if (reveal) setDialogOpen(true)
      if (checkingRef.current || stageRef.current === 'downloading' || stageRef.current === 'restarting') return
      if (!isTauri()) {
        // 浏览器仅用于本地界面开发：用“已是最新版本”呈现完整更新页，
        // 生产桌面构建仍通过 Tauri updater 获取真实版本和签名更新。
        setError('')
        setVersion('')
        setNotes('')
        setDate('')
        changeStage('latest')
        return
      }
      checkingRef.current = true
      changeStage('checking')
      setError('')
      try {
        await updateRef.current?.close()
        updateRef.current = null
        setVersion('')
        setNotes('')
        setDate('')
        setDownloadStarted(false)
        const { check } = await import('@tauri-apps/plugin-updater')
        const proxy = await resolveProxy()
        const update = await check(proxy ? { timeout: 30_000, proxy } : { timeout: 30_000 })
        updateRef.current = update
        if (!update) {
          setVersion('')
          setNotes('')
          setDate('')
          changeStage('latest')
          return
        }
        setCurrentVersion(update.currentVersion || packageJson.version)
        setVersion(update.version)
        setNotes(update.body?.trim() ?? '')
        setDate(update.date ?? '')
        changeStage('available')
      } catch (reason) {
        setError(reasonText(reason))
        changeStage('error')
      } finally {
        checkingRef.current = false
      }
    },
    [changeStage, resolveProxy, t.browserOnly]
  )

  const install = useCallback(async () => {
    const update = updateRef.current
    if (!update) return
    setDialogOpen(true)
    if (stageRef.current === 'downloading' || stageRef.current === 'restarting') return
    changeStage('downloading')
    setError('')
    setProgress(0)
    setDownloadedBytes(0)
    setTotalBytes(0)
    setBytesPerSecond(0)
    setDownloadStarted(false)
    let downloaded = 0
    let total = 0
    let measuredAt = performance.now()
    let measuredBytes = 0
    try {
      await update.downloadAndInstall(
        event => {
          if (event.event === 'Started') {
            setDownloadStarted(true)
            total = event.data.contentLength ?? 0
            setTotalBytes(total)
          }
          if (event.event === 'Progress') {
            // 防御旧版本插件未先发 Started 的情况；收到真实字节后仍应切到真实进度。
            setDownloadStarted(true)
            downloaded += event.data.chunkLength
            setDownloadedBytes(downloaded)
            const now = performance.now()
            const elapsed = now - measuredAt
            if (elapsed >= 750) {
              setBytesPerSecond(Math.round(((downloaded - measuredBytes) * 1_000) / elapsed))
              measuredAt = now
              measuredBytes = downloaded
            }
          }
          if (event.event === 'Finished') {
            setDownloadStarted(true)
            setProgress(100)
          } else if (total > 0) setProgress(Math.min(99, Math.round((downloaded / total) * 100)))
        },
        { timeout: 30 * 60_000 }
      )
      setProgress(100)
      changeStage('restarting')
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    } catch (reason) {
      setError(reasonText(reason))
      changeStage('error')
    }
  }, [changeStage])

  useEffect(() => {
    if (!isTauri()) return
    let active = true
    let unlisten: (() => void) | undefined
    void listen('updater://open', () => {
      if (!active) return
      setDialogOpen(true)
      if (shouldCheckWhenOpened(stageRef.current)) void checkUpdate(false)
    }).then(dispose => {
      if (active) unlisten = dispose
      else dispose()
    })
    return () => {
      active = false
      unlisten?.()
    }
  }, [checkUpdate])

  useEffect(() => {
    if (!isTauri() || startupCheckedRef.current) return
    const timer = window.setTimeout(() => {
      startupCheckedRef.current = true
      void checkUpdate(false)
    }, 3_500)
    return () => window.clearTimeout(timer)
  }, [checkUpdate])

  useEffect(() => {
    if (!isTauri()) return
    // 托盘文案语言由后端统一读取设置,前端只同步更新状态。
    void invoke('set_update_tray_status', {
      stage,
      version: version || null,
      progress
    }).catch(() => undefined)
  }, [progress, stage, version])

  useEffect(
    () => () => {
      void updateRef.current?.close()
    },
    []
  )

  return {
    stage,
    currentVersion,
    version,
    notes,
    date,
    progress,
    downloadedBytes,
    totalBytes,
    bytesPerSecond,
    downloadStarted,
    error,
    dialogOpen,
    updateAvailable,
    open: () => {
      setDialogOpen(true)
      if (shouldCheckWhenOpened(stageRef.current)) void checkUpdate(false)
    },
    close: () => setDialogOpen(false),
    check: checkUpdate,
    install
  }
}
