import { MapPin, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { SectionHeader } from '../../components/SectionHeader'
import type { Language } from '../../i18n'
import { defineMessages, localizeMessages, translateNow } from '../../runtimeI18n'
import { cn } from '../../utils'
import { searchChineseCities, weatherCodeLabel } from './openMeteo'
import { locationSubtitle } from './presentation'
import { getWeatherForecast, loadPreferredWeatherLocation, loadWeatherLocations, removeCachedForecast, savePreferredWeatherLocation, saveWeatherLocations } from './repository'
import { MAX_WEATHER_LOCATIONS, type CitySearchResult, type WeatherForecast, type WeatherLocation } from './types'
import { publishWeatherToReminderIsland } from './usePrimaryWeather'
import { WeatherDetail } from './WeatherDetail'
import { WeatherGlyph } from './WeatherGlyph'

const weatherPageMessages = defineMessages({
  requestCancelled: '请求已取消',
  operationUnavailable: '操作暂时无法完成',
  alreadySaved: '已在关注列表中',
  maxPrefix: '最多关注',
  maxSuffix: '个地点，请先移除一个',
  added: '已添加',
  addedSuffix: '，并设为概览天气',
  searchTooShort: '请输入至少 2 个字符，例如“北京”或“杭州市”',
  noSearchResults: '没有找到匹配的中国城市，请尝试输入完整城市名',
  eyebrow: '天气与活动',
  title: '今天适合怎么动一动',
  subtitle: '结合天气与环境，给你更合适的运动与护颈建议。',
  searchCity: '搜索中国城市',
  searchPlaceholder: '输入城市名，例如：南京、杭州、深圳',
  search: '搜索',
  selected: '已添加',
  defaultCity: '并设为默认城市',
  results: '城市搜索结果',
  city: '城市',
  savedPlaces: '关注地点',
  noPlaces: '还没有地点',
  addCityHint: '输入城市名称并搜索添加',
  addCity: '添加城市',
  waitingWeather: '等待天气',
  remove: '移除'
})

export function reasonMessage(reason: unknown): string {
  if (reason instanceof DOMException && reason.name === 'AbortError') return weatherPageMessages.requestCancelled
  if (reason instanceof Error) return reason.message
  if (typeof reason === 'string' && reason.trim()) return reason.trim()
  return weatherPageMessages.operationUnavailable
}

export function locationNeedsLanguageRefresh(location: WeatherLocation, language: Language): boolean {
  const label = `${location.name} ${location.admin1} ${location.country}`
  const hasHan = (value: string) => /[\u3400-\u9fff]/u.test(value)
  return language === 'en-US' ? hasHan(label) : !hasHan(location.name) || Boolean(location.admin1 && !hasHan(location.admin1)) || !hasHan(location.country)
}

export function WeatherPage({ language }: { language: Language }) {
  const messages = localizeMessages(weatherPageMessages, language)
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
    if (!locations.length) {
      setActiveLocationId(null)
      return
    }
    if (!activeLocationId || !locations.some(location => location.id === activeLocationId)) {
      const nextId = locations[0]!.id
      setActiveLocationId(nextId)
      saveWeatherLocations(locations)
      window.setTimeout(() => savePreferredWeatherLocation(nextId), 0)
    }
  }, [activeLocationId, locations])

  const selectedIds = useMemo(() => new Set(locations.map(location => location.id)), [locations])
  const activeLocation = locations.find(location => location.id === activeLocationId) ?? locations[0]
  const activeForecast = activeLocation ? forecasts[activeLocation.id] : undefined

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
      setNotice(`${location.name} ${messages.alreadySaved}`)
      return
    }
    if (locations.length >= MAX_WEATHER_LOCATIONS) {
      setNotice(`${messages.maxPrefix} ${MAX_WEATHER_LOCATIONS} ${messages.maxSuffix}`)
      return
    }
    persistLocations([...locations, location])
    setActiveLocationId(location.id)
    window.setTimeout(() => savePreferredWeatherLocation(location.id), 0)
    setNotice(`${messages.added} ${location.name}${messages.addedSuffix}`)
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
    if (activeLocationId === location.id) setActiveLocationId(next[0]?.id ?? null)
  }
  const search = async () => {
    if (query.trim().length < 2) {
      setSearchError(messages.searchTooShort)
      return
    }
    setSearching(true)
    setSearchError(null)
    setNotice(null)
    try {
      const next = await searchChineseCities(query, undefined, language)
      setResults(next)
      if (!next.length) setSearchError(messages.noSearchResults)
    } catch (reason) {
      setSearchError(reasonMessage(reason))
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="weather-page-layout themed-scrollbar mx-auto grid h-full min-h-0 w-full max-w-337 grid-rows-[109px_minmax(0,1fr)] gap-4 overflow-hidden px-7 pb-6 pt-8">
      <div className="weather-page-header grid grid-cols-[minmax(310px,.8fr)_minmax(480px,1.2fr)] items-start gap-8">
        <SectionHeader className="[&_h1]:mt-3 [&_h1]:text-[34px] [&_p]:mt-2.5 [&_p]:text-[13px]" eyebrow={messages.eyebrow} title={messages.title} subtitle={messages.subtitle} />
        <section className="weather-search-section relative z-30 mt-6">
          <div className="weather-search-box grid grid-cols-[minmax(0,1fr)_72px] gap-2 rounded-[14px] border border-edge bg-panel p-2 shadow-panel">
            <label className="relative min-w-0">
              <span className="sr-only">{messages.searchCity}</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
              <input
                className="weather-search-input h-9 w-full rounded-[10px] bg-field pl-9 pr-3 text-[11px] outline-none placeholder:text-subtle focus:ring-1 focus:ring-accent"
                value={query}
                placeholder={messages.searchPlaceholder}
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
            <button className="weather-search-button inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-accent text-[11px] font-bold text-inverse hover:bg-accent-strong disabled:opacity-50" disabled={searching} onClick={() => void search()}>
              {searching ? <RefreshCw className="animate-spin" size={14} /> : <Search size={14} />}
              {messages.search}
            </button>
          </div>
          <p className={cn('mt-1.5 px-2 text-[9px] text-muted', searchError && 'text-danger')}>{searchError ? t(searchError) : (notice ?? `${messages.selected} ${locations.map(location => location.name).join('、')}，${messages.defaultCity}`)}</p>
          {results.length ? (
            <div className="absolute inset-x-0 top-15.5 grid max-h-60 grid-cols-2 gap-2 overflow-y-auto rounded-[14px] border border-edge bg-panel p-2 shadow-panel" aria-label={messages.results}>
              {results.map(result => (
                <button key={result.id} className="flex min-w-0 items-center gap-2 rounded-[10px] bg-panel-muted px-3 py-2 text-left hover:bg-accent-soft disabled:opacity-50" disabled={selectedIds.has(result.id)} onClick={() => addLocation(result)}>
                  <span className="grid size-8 place-items-center rounded-[9px] bg-accent-soft text-accent">{selectedIds.has(result.id) ? <MapPin size={14} /> : <Plus size={14} />}</span>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-[11px]">{result.name}</strong>
                    <small className="block truncate text-[9px] text-muted">{locationSubtitle(result, language)}</small>
                  </span>
                  <span className="text-[8px] text-accent">{messages.city}</span>
                </button>
              ))}
            </div>
          ) : null}
        </section>
      </div>

      <div className="weather-main-grid -mx-3 grid min-h-0 grid-cols-[260px_minmax(0,1fr)] gap-6">
        <aside className="flex min-h-0 flex-col rounded-[16px] border border-edge bg-panel p-3 shadow-panel">
          <header className="weather-places-header flex h-13 items-center justify-between px-1">
            <strong className="text-[15px]">{messages.savedPlaces}</strong>
            <span className="text-[11px] text-muted">
              {locations.length}/{MAX_WEATHER_LOCATIONS}
            </span>
          </header>
          {locations.length ? (
            <div className="grid content-start gap-2 pt-1">
              {locations.map(location => {
                const selected = location.id === activeLocation?.id
                const forecast = forecasts[location.id]
                return (
                  <div className={cn('weather-location-card group flex items-center rounded-[12px] border px-2.5 py-2.5 bg-panel-muted', selected ? 'border-accent/35 bg-accent-soft' : 'border-transparent')} key={location.id}>
                    <button className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-pressed={selected} onClick={() => selectLocation(location)}>
                      <span className="weather-location-icon grid size-10.5 shrink-0 place-items-center rounded-[11px] bg-panel text-accent">
                        <MapPin size={18} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="weather-location-name block truncate text-[14px]">{location.name}</strong>
                        <small className="weather-location-meta mt-1 block truncate text-[10px] text-muted">{forecast ? `${Math.round(forecast.current.temperature)}° · ${t(weatherCodeLabel(forecast.current.weatherCode))}` : t(location.admin1 || messages.waitingWeather)}</small>
                      </span>
                      {forecast ? <WeatherGlyph className="weather-location-glyph shrink-0 text-accent" code={forecast.current.weatherCode} size={22} /> : null}
                    </button>
                    <button className="grid size-7 place-items-center rounded-[8px] text-subtle opacity-0 hover:bg-danger-soft hover:text-danger group-hover:opacity-100" aria-label={`${messages.remove} ${location.name}`} onClick={() => removeLocation(location)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyState icon={MapPin} title={messages.noPlaces} description={messages.addCityHint} />
          )}
          <button className="weather-add-city mt-4 flex h-12 items-center justify-center gap-2 rounded-[12px] border border-dashed border-edge text-[12px] text-muted hover:border-accent/35 hover:bg-accent-soft hover:text-accent" onClick={() => document.querySelector<HTMLInputElement>('input[placeholder]')?.focus()}>
            <Plus size={16} />
            {messages.addCity}
          </button>
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
      </div>
    </div>
  )
}
