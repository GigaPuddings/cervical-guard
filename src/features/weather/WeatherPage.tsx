import { CloudSun, MapPin, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../../utils'
import type { Language } from '../../i18n'
import { translateNow } from '../../runtimeI18n'
import { searchChineseCities, weatherCodeLabel } from './openMeteo'
import { locationSubtitle } from './presentation'
import { getWeatherForecast, loadPreferredWeatherLocation, loadWeatherLocations, removeCachedForecast, savePreferredWeatherLocation, saveWeatherLocations } from './repository'
import { MAX_WEATHER_LOCATIONS, type CitySearchResult, type WeatherForecast, type WeatherLocation } from './types'
import { publishWeatherToReminderIsland } from './usePrimaryWeather'
import { WeatherGlyph } from './WeatherGlyph'
import { WeatherDetail } from './WeatherDetail'

export function reasonMessage(reason: unknown): string {
  if (reason instanceof DOMException && reason.name === 'AbortError') return '请求已取消'
  if (reason instanceof Error) return reason.message
  // Tauri `invoke` 会直接以 Rust command 返回的 String 作为 rejection，
  // 不是 JavaScript Error。必须保留该文本，才能显示 Windows 权限/来源诊断。
  if (typeof reason === 'string' && reason.trim()) return reason.trim()
  return '操作暂时无法完成'
}

export function locationNeedsLanguageRefresh(location: WeatherLocation, language: Language): boolean {
  const label = `${location.name} ${location.admin1} ${location.country}`
  const hasHan = (value: string) => /[\u3400-\u9fff]/u.test(value)
  return language === 'en-US'
    ? hasHan(label)
    : !hasHan(location.name) || Boolean(location.admin1 && !hasHan(location.admin1)) || !hasHan(location.country)
}

export function WeatherPage({ language }: { language: Language }) {
  const t = (value: string) => translateNow(value, language)
  const [locations, setLocations] = useState<WeatherLocation[]>(loadWeatherLocations)
  const [activeLocationId, setActiveLocationId] = useState<string | null>(() => loadPreferredWeatherLocation()?.id ?? null)
  const [forecasts, setForecasts] = useState<Record<string, WeatherForecast>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loadingIds, setLoadingIds] = useState<Set<string>>(() => new Set())
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CitySearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const requestedIds = useRef(new Set<string>())
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const refreshOne = useCallback(async (location: WeatherLocation, force = false) => {
    setLoadingIds(current => new Set(current).add(location.id))
    setErrors(current => {
      const next = { ...current }
      delete next[location.id]
      return next
    })
    try {
      const forecast = await getWeatherForecast(location, force)
      if (mounted.current) setForecasts(current => ({ ...current, [location.id]: forecast }))
    } catch (reason) {
      if (mounted.current) setErrors(current => ({ ...current, [location.id]: reasonMessage(reason) }))
    } finally {
      if (mounted.current)
        setLoadingIds(current => {
          const next = new Set(current)
          next.delete(location.id)
          return next
        })
    }
  }, [])

  useEffect(() => {
    for (const location of locations) {
      if (requestedIds.current.has(location.id)) continue
      requestedIds.current.add(location.id)
      void refreshOne(location)
    }
  }, [locations, refreshOne])

  useEffect(() => {
    const pending = locations.filter(location => locationNeedsLanguageRefresh(location, language))
    if (pending.length === 0) return

    let cancelled = false
    void Promise.all(pending.map(async location => {
      try {
        const matches = await searchChineseCities(location.name, undefined, language)
        const match = matches.find(candidate => candidate.id === location.id)
        return match
          ? { ...location, name: match.name, admin1: match.admin1, country: match.country }
          : location
      } catch {
        // Display metadata is optional. Keep the saved location and cached weather available offline.
        return location
      }
    })).then(localized => {
      if (cancelled || !mounted.current) return
      const byId = new Map(localized.map(location => [location.id, location]))
      const next = locations.map(location => byId.get(location.id) ?? location)
      const changed = next.some((location, index) => location.name !== locations[index]?.name
        || location.admin1 !== locations[index]?.admin1
        || location.country !== locations[index]?.country)
      if (!changed) return
      setLocations(next)
      saveWeatherLocations(next)
    })

    return () => {
      cancelled = true
    }
  }, [language, locations])

  useEffect(() => {
    if (locations.length === 0) {
      setActiveLocationId(null)
      return
    }
    if (!activeLocationId || !locations.some(location => location.id === activeLocationId)) {
      const nextId = loadPreferredWeatherLocation()?.id ?? locations[0]!.id
      setActiveLocationId(nextId)
      savePreferredWeatherLocation(nextId)
    }
  }, [activeLocationId, locations])

  const selectedIds = useMemo(() => new Set(locations.map(location => location.id)), [locations])
  const activeLocation = locations.find(location => location.id === activeLocationId) ?? locations[0]
  const activeForecast = activeLocation ? forecasts[activeLocation.id] : undefined
  const atLimit = locations.length >= MAX_WEATHER_LOCATIONS

  useEffect(() => {
    if (activeForecast) void publishWeatherToReminderIsland(activeForecast)
    else if (!activeLocation) void publishWeatherToReminderIsland(null)
  }, [activeForecast, activeLocation])

  const persistLocations = (next: WeatherLocation[]) => {
    setLocations(next)
    saveWeatherLocations(next)
  }

  const selectLocation = (location: WeatherLocation) => {
    setActiveLocationId(location.id)
    savePreferredWeatherLocation(location.id)
  }

  const addLocation = (location: WeatherLocation) => {
    if (selectedIds.has(location.id)) {
      setNotice(`${location.name} 已在关注列表中`)
      return
    }
    if (atLimit) {
      setNotice(`最多关注 ${MAX_WEATHER_LOCATIONS} 个地点，请先移除一个`)
      return
    }
    persistLocations([...locations, location])
    setActiveLocationId(location.id)
    window.setTimeout(() => savePreferredWeatherLocation(location.id), 0)
    setNotice(`已添加 ${location.name}，并设为概览天气`)
    setResults([])
    setQuery('')
  }

  const removeLocation = (location: WeatherLocation) => {
    const next = locations.filter(item => item.id !== location.id)
    persistLocations(next)
    requestedIds.current.delete(location.id)
    removeCachedForecast(location.id)
    setForecasts(current => {
      const copy = { ...current }
      delete copy[location.id]
      return copy
    })
    if (activeLocationId === location.id) {
      const nextId = next[0]?.id ?? null
      setActiveLocationId(nextId)
      if (nextId) window.setTimeout(() => savePreferredWeatherLocation(nextId), 0)
    }
  }

  const search = async () => {
    if (query.trim().length < 2) {
      setSearchError('请输入至少 2 个字符，例如“北京”或“杭州市”')
      return
    }
    setSearching(true)
    setSearchError(null)
    setNotice(null)
    try {
      const next = await searchChineseCities(query, undefined, language)
      setResults(next)
      if (next.length === 0) setSearchError('没有找到匹配的中国城市，请尝试输入完整城市名')
    } catch (reason) {
      setSearchError(reasonMessage(reason))
    } finally {
      setSearching(false)
    }
  }

  const refreshAll = () => {
    for (const location of locations) void refreshOne(location, true)
  }

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-375 flex-col gap-3 overflow-hidden px-[clamp(16px,3vw,34px)] py-4">
      <header className="flex shrink-0 items-end justify-between gap-4">
        <div className="min-w-0">
          <span className="text-[clamp(10px,.72vw,13px)] font-extrabold tracking-[.16em] text-info">天气与活动</span>
          <h1 className="mt-1 truncate text-[clamp(24px,2.2vw,35px)] font-black leading-none tracking-[-.035em]">今天适合怎么动一动</h1>
        </div>
        <button className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl border border-edge bg-panel px-3 text-[clamp(10px,.72vw,13px)] font-bold shadow-control hover:bg-panel-muted disabled:opacity-50" disabled={locations.length === 0 || loadingIds.size > 0} onClick={refreshAll}>
          <RefreshCw size={16} className={loadingIds.size > 0 ? 'animate-spin' : ''} /> 刷新全部
        </button>
      </header>

      <section className="relative z-20 shrink-0 rounded-2xl border border-edge bg-panel p-2.5 shadow-panel">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <label className="relative min-w-0">
            <span className="sr-only">搜索中国城市</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={15} />
            <input
              className="h-10 w-full rounded-xl border border-edge bg-field pl-9 pr-3 text-[clamp(11px,.82vw,15px)] outline-none placeholder:text-subtle focus:border-accent"
              value={query}
              placeholder="输入城市名，例如：南京、杭州、深圳"
              onChange={event => {
                setQuery(event.target.value)
                setResults([])
                setSearchError(null)
              }}
              onKeyDown={event => {
                if (event.key === 'Enter') void search()
              }}
            />
          </label>
          <button className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-accent px-3 text-[clamp(10px,.76vw,14px)] font-bold text-inverse hover:bg-accent-strong disabled:opacity-50" disabled={searching} onClick={() => void search()}>
            {searching ? <RefreshCw className="animate-spin" size={15} /> : <Search size={15} />} 搜索
          </button>
        </div>
        <div className="mt-1.5 flex h-4 items-center justify-between gap-3 px-1 text-[clamp(8px,.62vw,11px)] text-muted">
          <span className={cn('truncate', searchError && 'text-danger', notice && !searchError && 'text-info')}>{searchError ?? notice ?? `仅展示中国城市行政中心 · 已选 ${locations.length}/${MAX_WEATHER_LOCATIONS}`}</span>
          <span className="shrink-0">搜索并选择城市，不读取设备位置</span>
        </div>
        {results.length > 0 && (
          <div className="absolute left-2.5 right-2.5 top-[calc(100%-2px)] grid max-h-57.5 grid-cols-2 gap-2 overflow-y-auto rounded-2xl border border-edge bg-panel p-2.5 shadow-[0_20px_50px_rgba(25,48,31,.16)] scrollbar-none [&::-webkit-scrollbar]:hidden" aria-label="城市搜索结果">
            {results.map(result => (
              <button key={result.id} className="flex min-w-0 items-center gap-2 rounded-xl border border-edge bg-panel-muted px-3 py-2 text-left hover:border-accent disabled:opacity-50" disabled={selectedIds.has(result.id)} onClick={() => addLocation(result)}>
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">{selectedIds.has(result.id) ? <MapPin size={14} /> : <Plus size={14} />}</span>
                <span className="min-w-0">
                  <strong className="block truncate text-[clamp(11px,.78vw,14px)]">{result.name}</strong>
                  <small className="mt-0.5 block truncate text-[clamp(8px,.62vw,11px)] text-muted">{locationSubtitle(result, language)}</small>
                </span>
                <span className="ml-auto shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[clamp(7px,.52vw,9px)] font-bold text-accent">城市</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="grid min-h-0 flex-1 grid-cols-[clamp(188px,16vw,250px)_minmax(0,1fr)] gap-3">
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-edge bg-panel shadow-panel">
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-edge px-3">
            <strong className="text-[clamp(11px,.82vw,15px)]">关注地点</strong>
            <span className="text-[clamp(9px,.64vw,11px)] text-muted">
              {locations.length}/{MAX_WEATHER_LOCATIONS}
            </span>
          </div>
          {locations.length === 0 ? (
            <div className="grid min-h-0 flex-1 place-content-center justify-items-center px-4 text-center">
              <span className="grid size-10 place-items-center rounded-2xl bg-info-soft text-info">
                <MapPin size={18} />
              </span>
              <strong className="mt-3 text-[clamp(11px,.8vw,14px)]">还没有地点</strong>
              <p className="mt-1 text-[clamp(9px,.65vw,11px)] leading-4 text-muted">输入城市名称并搜索添加</p>
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 content-start gap-1 overflow-y-auto p-2 scrollbar-none [&::-webkit-scrollbar]:hidden">
              {locations.map(location => {
                const selected = location.id === activeLocation?.id
                const forecast = forecasts[location.id]
                return (
                  <div key={location.id} className={cn('group flex h-[clamp(40px,3.4vw,48px)] items-center rounded-xl border px-1.5', selected ? 'border-accent-soft-strong bg-accent-soft' : 'border-transparent hover:bg-panel-muted')}>
                    <button className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-pressed={selected} onClick={() => selectLocation(location)}>
                      <span className={cn('grid size-[clamp(28px,2.4vw,36px)] shrink-0 place-items-center rounded-lg', selected ? 'bg-panel text-accent' : 'bg-panel-muted text-muted')}>{forecast ? <WeatherGlyph code={forecast.current.weatherCode} size={15} /> : <MapPin size={15} />}</span>
                      <span className="min-w-0">
                        <strong className="block truncate text-[clamp(11px,.8vw,14px)]">{location.name}</strong>
                        <small className="block truncate text-[clamp(8px,.6vw,11px)] text-muted">{forecast ? `${Math.round(forecast.current.temperature)}° · ${t(weatherCodeLabel(forecast.current.weatherCode))}` : t(location.admin1 || '等待天气')}</small>
                      </span>
                    </button>
                    <button className="grid size-6 shrink-0 place-items-center rounded-md text-subtle opacity-0 hover:bg-danger-soft hover:text-danger group-hover:opacity-100 focus:opacity-100" aria-label={`移除${location.name}`} onClick={() => removeLocation(location)}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          <div className="shrink-0 border-t border-edge px-3 py-2 text-[clamp(8px,.58vw,10px)] leading-4 text-muted">点击地点会设为今日概览和灵动岛的首选天气。</div>
        </aside>

        <WeatherDetail
          language={language}
          location={activeLocation}
          forecast={activeForecast}
          error={activeLocation ? errors[activeLocation.id] : undefined}
          loading={activeLocation ? loadingIds.has(activeLocation.id) : false}
          onRefresh={() => {
            if (activeLocation) void refreshOne(activeLocation, true)
          }}
          onRemove={() => {
            if (activeLocation) removeLocation(activeLocation)
          }}
        />
      </section>
    </div>
  )
}
