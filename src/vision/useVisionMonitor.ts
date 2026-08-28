import type { RefObject } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { coreClient } from '../infra/client'
import { languageOf, type Language } from '../i18n'
import { defineMessages, messageText, type MessagePair } from '../runtimeI18n'
import type { CameraDevice, LandmarkPoint, VisionFrame, VisionObservation } from '../types'
import { PREVIEW_START_TIMEOUT_MS, shouldReportPreviewFailure } from './previewPolicy'

export type VisionStatus = 'idle' | 'requesting' | 'loading_model' | 'ready' | 'error'

const visionMessages = defineMessages({
  startFailed: {
    zh: '摄像头或本地姿态模型无法启动',
    en: 'The camera or posture model could not start'
  },
  desktopOnly: {
    zh: '请在桌面应用中运行',
    en: 'Please run the app in the desktop application'
  },
  previewStalled: {
    zh: '视频预览暂时未取得画面，但本地姿态分析仍会继续。请重试预览。',
    en: 'The video preview has not produced a frame yet, but local posture analysis continues. Retry the preview.'
  }
})

interface UseVisionOptions {
  active: boolean
  cameraId: string
  baseline: number | null
  headDownEnabled?: boolean
  /** 用于生成会话启动失败等兜底文案;预览错误以消息对返回,由展示层本地化。 */
  language?: Language
  onObservation?: (observation: VisionObservation) => void
}

interface VisionMonitor {
  /** 预览图像元素引用（由 Tauri 本地帧事件刷新）。 */
  previewRef: RefObject<HTMLImageElement | null>
  /** 最新 JPEG data URL，用于在 Dashboard 中渲染可见预览。 */
  streamUrl: string | null
  status: VisionStatus
  /** 后端错误(已由后端本地化)或本地兜底文案(按当前语言生成)。 */
  error: string | null
  /** 首帧是否已渲染完成(用于控制 loading 遮罩的消失时机)。 */
  previewReady: boolean
  /** 仅代表预览流失败；姿态推理仍可能正常运行。消息对由展示层本地化。 */
  previewError: MessagePair | null
  observation: VisionObservation | null
  /** 最近一帧的 17 个关键点(归一化坐标 [0,1]),用于 canvas 叠加绘制。 */
  landmarks: LandmarkPoint[]
  calibrationSamples: number[]
  devices: CameraDevice[]
  resetSamples: () => void
  retryPreview: () => void
}

/** React 状态更新节流间隔(≈12 FPS),回调全速触发。 */
const UI_UPDATE_INTERVAL_MS = 80

export function useVisionMonitor(options: UseVisionOptions): VisionMonitor {
  const previewRef = useRef<HTMLImageElement>(null)
  const callbackRef = useRef(options.onObservation)
  const [status, setStatus] = useState<VisionStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [streamUrl, setStreamUrl] = useState<string | null>(null)
  const [observation, setObservation] = useState<VisionObservation | null>(null)
  const [landmarks, setLandmarks] = useState<LandmarkPoint[]>([])
  const [calibrationSamples, setCalibrationSamples] = useState<number[]>([])
  const [devices, setDevices] = useState<CameraDevice[]>([])
  const [previewReady, setPreviewReady] = useState(false)
  const [previewError, setPreviewError] = useState<MessagePair | null>(null)
  const previewFailures = useRef(0)
  const retryTimer = useRef<number | null>(null)

  callbackRef.current = options.onObservation
  const resetSamples = useCallback(() => setCalibrationSamples([]), [])
  const retryPreview = useCallback(() => {
    setPreviewReady(false)
    setPreviewError(null)
    previewFailures.current = 0
    // 后端持续推送预览帧；清空旧帧后，下一帧会自动完成重试。
    setStreamUrl(null)
    if (retryTimer.current !== null) window.clearTimeout(retryTimer.current)
    retryTimer.current = window.setTimeout(() => {
      retryTimer.current = null
      setPreviewError(visionMessages.previewStalled)
    }, PREVIEW_START_TIMEOUT_MS)
  }, [])

  useEffect(() => {
    if (!streamUrl || !previewRef.current) return
    const img = previewRef.current
    let active = true
    img.onload = () => {
      if (!active) return
      previewFailures.current = 0
      setPreviewReady(true)
      setPreviewError(null)
    }
    img.onerror = () => {
      if (!active) return
      previewFailures.current += 1
      if (!shouldReportPreviewFailure(previewFailures.current)) return
      setPreviewReady(false)
      setPreviewError(visionMessages.previewStalled)
    }
    img.src = streamUrl
    return () => {
      active = false
      img.onload = null
      img.onerror = null
    }
  }, [streamUrl])

  useEffect(() => {
    if (!options.active) {
      setStatus('idle')
      setStreamUrl(null)
      setPreviewError(null)
      // 清除上一轮残留的关键点与观测值,避免恢复检测时旧骨架闪现。
      setLandmarks([])
      setObservation(null)
      void coreClient.stopVision().catch(() => undefined)
      return
    }

    // 检测会话启动时立即清除上一轮残留状态,确保骨架不会在新画面到达前出现。
    setLandmarks([])
    setObservation(null)
    setCalibrationSamples([])
    setPreviewReady(false)
    setPreviewError(null)

    let cancelled = false
    let unlisten: (() => void) | null = null
    let previewWatchdog: number | null = null
    let previewReceived = false
    let lastUiUpdate = 0

    // ── 观测值处理:收到 vision://frame 事件 → 回调 + 状态更新 ──
    const handleFrame = (frame: VisionFrame) => {
      const item = frame.observation
      // 回调全速触发(ingestObservation 内部有 ingesting 去重)。
      callbackRef.current?.(item)

      // React 状态更新节流到 ≈12 FPS,减少重渲染。
      const now = performance.now()
      if (now - lastUiUpdate < UI_UPDATE_INTERVAL_MS) return
      lastUiUpdate = now

      setObservation(item)
      setLandmarks(frame.landmarks)
      if (frame.headRatio !== null && item.frameQuality === 'good' && item.posture.confidence >= 0.45) {
        setCalibrationSamples(current => [...current.slice(-79), frame.headRatio!])
      }
    }

    const start = async () => {
      try {
        setError(null)
        setStatus('requesting')

        if (!isTauri()) {
          setError(messageText(visionMessages.desktopOnly, languageOf(options.language)))
          setStatus('error')
          return
        }

        // 先挂载监听器再启动摄像头，确保相机很快就绪时也不会漏掉首帧或错误。
        const [unlistenFrame, unlistenPreview, unlistenError] = await Promise.all([
          listen<VisionFrame>('vision://frame', event => {
            if (cancelled) return
            handleFrame(event.payload)
          }),
          listen<string>('vision://preview', event => {
            if (cancelled || !event.payload.startsWith('data:image/jpeg;base64,')) return
            previewReceived = true
            if (previewWatchdog !== null) {
              window.clearTimeout(previewWatchdog)
              previewWatchdog = null
            }
            previewFailures.current = 0
            if (retryTimer.current !== null) {
              window.clearTimeout(retryTimer.current)
              retryTimer.current = null
            }
            setPreviewError(null)
            setStreamUrl(event.payload)
          }),
          listen<string>('vision://error', event => {
            if (cancelled) return
            setError(event.payload)
            setStatus('error')
          })
        ])
        if (cancelled) {
          unlistenFrame()
          unlistenPreview()
          unlistenError()
          return
        }
        unlisten = () => {
          unlistenFrame()
          unlistenPreview()
          unlistenError()
        }

        const cameraList = await coreClient.listCameras()
        if (cancelled) return
        setDevices(cameraList)
        const cameraId = options.cameraId && options.cameraId !== 'default' ? options.cameraId : (cameraList[0]?.id ?? '0')
        setStatus('loading_model')
        await coreClient.startVision(cameraId, options.baseline, options.headDownEnabled ?? true)
        if (cancelled) {
          await coreClient.stopVision()
          return
        }
        setStatus('ready')

        // 推理就绪并不等于 WebView 已收到预览帧；超时只影响预览提示，不降级姿态分析。
        previewWatchdog = window.setTimeout(() => {
          if (cancelled || previewReceived) return
          setPreviewReady(false)
          setPreviewError(visionMessages.previewStalled)
        }, PREVIEW_START_TIMEOUT_MS)
      } catch (reason) {
        if (cancelled) return
        const fallback = messageText(visionMessages.startFailed, languageOf(options.language))
        setError(typeof reason === 'string' && reason ? reason : reason instanceof Error && reason.message ? reason.message : fallback)
        setStatus('error')
      }
    }

    void start()
    return () => {
      cancelled = true
      if (unlisten) unlisten()
      if (previewWatchdog !== null) window.clearTimeout(previewWatchdog)
      if (retryTimer.current !== null) {
        window.clearTimeout(retryTimer.current)
        retryTimer.current = null
      }
      void coreClient.stopVision().catch(() => undefined)
      // 清除残留状态,避免恢复检测时旧骨架在新画面到达前闪现。
      setLandmarks([])
      setObservation(null)
    }
  }, [options.active, options.baseline, options.cameraId, options.headDownEnabled, options.language])

  return { previewRef, streamUrl, status, error, observation, landmarks, calibrationSamples, devices, resetSamples, previewReady, previewError, retryPreview }
}
