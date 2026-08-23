import { describe, expect, it } from 'vitest'
import { isPrimaryWeatherRefreshDue } from './usePrimaryWeather'
import { WEATHER_CACHE_TTL_MS, type WeatherForecast } from './types'

function forecastAt(fetchedAt: string): WeatherForecast {
  return { fetchedAt } as WeatherForecast
}

describe('primary weather refresh policy', () => {
  const now = Date.parse('2026-08-22T08:30:00.000Z')

  it('refreshes when no forecast has been loaded', () => {
    expect(isPrimaryWeatherRefreshDue(null, now)).toBe(true)
  })

  it('keeps cached weather until the cache lifetime expires', () => {
    expect(isPrimaryWeatherRefreshDue(forecastAt(new Date(now - WEATHER_CACHE_TTL_MS + 1).toISOString()), now)).toBe(false)
    expect(isPrimaryWeatherRefreshDue(forecastAt(new Date(now - WEATHER_CACHE_TTL_MS).toISOString()), now)).toBe(true)
  })

  it('refreshes invalid timestamps instead of leaving stale weather mounted', () => {
    expect(isPrimaryWeatherRefreshDue(forecastAt('invalid'), now)).toBe(true)
  })
})
