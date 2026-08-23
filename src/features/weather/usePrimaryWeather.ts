import { isTauri } from '@tauri-apps/api/core'
import { emitTo } from '@tauri-apps/api/event'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getWeatherForecast, loadPreferredWeatherLocation, WEATHER_PREFERENCE_EVENT } from './repository'
import { toWeatherSummary } from './presentation'
import { WEATHER_CACHE_TTL_MS, type WeatherForecast, type WeatherLocation } from './types'

export const WEATHER_AUTO_REFRESH_CHECK_MS = 60 * 1_000

export function isPrimaryWeatherRefreshDue(forecast: WeatherForecast | null, now = Date.now()): boolean {
  if (!forecast) return true
  const fetchedAt = Date.parse(forecast.fetchedAt)
  return !Number.isFinite(fetchedAt) || now - fetchedAt >= WEATHER_CACHE_TTL_MS
}

function reasonMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : '天气暂时无法加载'
}

export async function publishWeatherToReminderIsland(forecast: WeatherForecast | null): Promise<void> {
  if (!isTauri()) return
  try {
    await emitTo('reminder-island', 'weather://summary', forecast ? toWeatherSummary(forecast) : null)
  } catch {
    // 灵动岛天气属于增强信息，事件窗口尚未就绪时不影响主流程。
  }
}

export interface PrimaryWeatherState {
  location: WeatherLocation | null
  forecast: WeatherForecast | null
  loading: boolean
  error: string | null
  refresh: (force?: boolean) => Promise<void>
}

export function usePrimaryWeather(): PrimaryWeatherState {
  const [location, setLocation] = useState<WeatherLocation | null>(loadPreferredWeatherLocation)
  const [forecast, setForecast] = useState<WeatherForecast | null>(null)
  const [loading, setLoading] = useState(Boolean(location))
  const [error, setError] = useState<string | null>(null)
  const forecastRef = useRef<WeatherForecast | null>(null)
  const refreshRequestRef = useRef(0)

  const refresh = useCallback(async (force = false) => {
    const requestId = ++refreshRequestRef.current
    const nextLocation = loadPreferredWeatherLocation()
    setLocation(nextLocation)
    if (!nextLocation) {
      forecastRef.current = null
      setForecast(null)
      setLoading(false)
      setError(null)
      void publishWeatherToReminderIsland(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const next = await getWeatherForecast(nextLocation, force)
      if (requestId !== refreshRequestRef.current) return
      forecastRef.current = next
      setForecast(next)
      void publishWeatherToReminderIsland(next)
    } catch (reason) {
      if (requestId === refreshRequestRef.current) setError(reasonMessage(reason))
    } finally {
      if (requestId === refreshRequestRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const onPreferenceChange = () => void refresh()
    const refreshIfDue = () => {
      if (document.visibilityState !== 'hidden' && isPrimaryWeatherRefreshDue(forecastRef.current)) {
        void refresh(true)
      }
    }
    const onVisibilityChange = () => refreshIfDue()
    const intervalId = window.setInterval(refreshIfDue, WEATHER_AUTO_REFRESH_CHECK_MS)
    window.addEventListener(WEATHER_PREFERENCE_EVENT, onPreferenceChange)
    window.addEventListener('focus', refreshIfDue)
    window.addEventListener('online', refreshIfDue)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener(WEATHER_PREFERENCE_EVENT, onPreferenceChange)
      window.removeEventListener('focus', refreshIfDue)
      window.removeEventListener('online', refreshIfDue)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [refresh])

  return { location, forecast, loading, error, refresh }
}
