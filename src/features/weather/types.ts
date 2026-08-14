export const MAX_WEATHER_LOCATIONS = 8
export const WEATHER_CACHE_TTL_MS = 15 * 60 * 1_000
export const WEATHER_STALE_FALLBACK_MS = 6 * 60 * 60 * 1_000
export const WEATHER_MANUAL_REFRESH_MIN_MS = 60 * 1_000

export type WeatherLocationSource = 'search' | 'device'

export interface WeatherLocation {
  id: string
  name: string
  admin1: string
  country: string
  latitude: number
  longitude: number
  timezone: string
  source: WeatherLocationSource
}

export interface CurrentWeather {
  time: string
  temperature: number
  apparentTemperature: number
  humidity: number
  precipitation: number
  cloudCover: number
  uvIndex: number
  weatherCode: number
  windSpeed: number
  windGusts: number
  isDay: boolean
}

export interface DailyWeather {
  date: string
  weatherCode: number
  temperatureMax: number
  temperatureMin: number
  apparentTemperatureMax: number
  precipitationProbability: number
  precipitationSum: number
  uvIndexMax: number
  sunrise: string
  sunset: string
}

export interface WeatherForecast {
  location: WeatherLocation
  timezone: string
  timezoneAbbreviation: string
  current: CurrentWeather
  daily: DailyWeather[]
  fetchedAt: string
  stale: boolean
}

export interface CitySearchResult extends WeatherLocation {
  geonameId: number
}

export interface WeatherSummary {
  location: string
  condition: string
  temperature: number
  humidity: number
  uvIndex: number
  windSpeed: number
  windLevel: string
  precipitation: number
  weatherCode: number
}
