import { z } from 'zod'
import { fetchOpenMeteoForecast } from './openMeteo'
import { MAX_WEATHER_LOCATIONS, WEATHER_CACHE_TTL_MS, WEATHER_MANUAL_REFRESH_MIN_MS, WEATHER_STALE_FALLBACK_MS, type WeatherForecast, type WeatherLocation } from './types'

const LOCATIONS_KEY = 'cervical-guard-weather-locations-v1'
const FORECASTS_KEY = 'cervical-guard-weather-cache-v3'
const PREFERRED_LOCATION_KEY = 'cervical-guard-weather-preferred-v1'
export const WEATHER_PREFERENCE_EVENT = 'cervical-guard:weather-preference-changed'

const locationSchema = z.object({
  id: z.string(),
  name: z.string(),
  admin1: z.string(),
  country: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timezone: z.string(),
  source: z.enum(['search', 'device'])
})

const forecastSchema = z.object({
  location: locationSchema,
  timezone: z.string(),
  timezoneAbbreviation: z.string(),
  current: z.object({
    time: z.string(),
    temperature: z.number(),
    apparentTemperature: z.number(),
    humidity: z.number(),
    precipitation: z.number(),
    cloudCover: z.number(),
    uvIndex: z.number(),
    weatherCode: z.number(),
    windSpeed: z.number(),
    windGusts: z.number(),
    isDay: z.boolean()
  }),
  daily: z.array(
    z.object({
      date: z.string(),
      weatherCode: z.number(),
      temperatureMax: z.number(),
      temperatureMin: z.number(),
      apparentTemperatureMax: z.number(),
      precipitationProbability: z.number(),
      precipitationSum: z.number(),
      uvIndexMax: z.number(),
      sunrise: z.string(),
      sunset: z.string()
    })
  ),
  fetchedAt: z.string(),
  stale: z.boolean()
})

const forecastMapSchema = z.record(z.string(), forecastSchema)
const inFlight = new Map<string, Promise<WeatherForecast>>()

const DEFAULT_SHANGHAI: WeatherLocation = {
  id: 'city:1796236',
  name: '上海',
  admin1: '上海市',
  country: '中国',
  latitude: 31.22222,
  longitude: 121.45806,
  timezone: 'Asia/Shanghai',
  source: 'search'
}

function loadJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 天气偏好和缓存不是核心健康数据，存储失败时保持当前会话可用即可。
  }
}

function loadText(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function saveText(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    // 首选地点和天气缓存一样属于非核心偏好，失败时不影响健康提醒。
  }
}

export function loadWeatherLocations(): WeatherLocation[] {
  const raw = loadJson(LOCATIONS_KEY)
  if (raw === null) return [DEFAULT_SHANGHAI]
  const parsed = z.array(locationSchema).safeParse(raw)
  return parsed.success ? parsed.data.slice(0, MAX_WEATHER_LOCATIONS) : []
}

export function saveWeatherLocations(locations: WeatherLocation[]): void {
  saveJson(LOCATIONS_KEY, locations.slice(0, MAX_WEATHER_LOCATIONS))
  const preferred = loadText(PREFERRED_LOCATION_KEY)
  if (preferred && !locations.some(location => location.id === preferred)) {
    saveText(PREFERRED_LOCATION_KEY, locations[0]?.id ?? null)
  }
  window.dispatchEvent(new Event(WEATHER_PREFERENCE_EVENT))
}

export function loadPreferredWeatherLocation(): WeatherLocation | null {
  const locations = loadWeatherLocations()
  const preferredId = loadText(PREFERRED_LOCATION_KEY)
  return locations.find(location => location.id === preferredId) ?? locations[0] ?? null
}

export function savePreferredWeatherLocation(locationId: string): void {
  const location = loadWeatherLocations().find(item => item.id === locationId)
  if (!location) return
  saveText(PREFERRED_LOCATION_KEY, locationId)
  window.dispatchEvent(new Event(WEATHER_PREFERENCE_EVENT))
}

function loadForecasts(): Record<string, WeatherForecast> {
  const parsed = forecastMapSchema.safeParse(loadJson(FORECASTS_KEY))
  return parsed.success ? parsed.data : {}
}

function saveForecast(forecast: WeatherForecast): void {
  const forecasts = loadForecasts()
  forecasts[forecast.location.id] = forecast
  saveJson(FORECASTS_KEY, forecasts)
}

export function removeCachedForecast(locationId: string): void {
  const forecasts = loadForecasts()
  delete forecasts[locationId]
  saveJson(FORECASTS_KEY, forecasts)
}

export async function getWeatherForecast(location: WeatherLocation, force = false, signal?: AbortSignal): Promise<WeatherForecast> {
  const cached = loadForecasts()[location.id]
  const cachedAge = cached ? Date.now() - Date.parse(cached.fetchedAt) : Number.POSITIVE_INFINITY
  if (cached && ((!force && cachedAge <= WEATHER_CACHE_TTL_MS) || (force && cachedAge <= WEATHER_MANUAL_REFRESH_MIN_MS))) {
    return { ...cached, location, stale: false }
  }

  const existing = inFlight.get(location.id)
  if (existing) return existing

  const request = fetchOpenMeteoForecast(location, signal)
    .then(forecast => {
      saveForecast(forecast)
      return forecast
    })
    .catch((reason: unknown) => {
      if (cached && cachedAge <= WEATHER_STALE_FALLBACK_MS) return { ...cached, location, stale: true }
      throw reason
    })
    .finally(() => {
      if (inFlight.get(location.id) === request) inFlight.delete(location.id)
    })
  inFlight.set(location.id, request)
  return request
}
