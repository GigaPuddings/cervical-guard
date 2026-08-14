import { CloudSun, RefreshCw } from 'lucide-react'
import { weatherCodeLabel } from './openMeteo'
import { windLevelLabel } from './presentation'
import { usePrimaryWeather } from './usePrimaryWeather'
import { WeatherGlyph } from './WeatherGlyph'

export function TodayWeatherHeader() {
  const { location, forecast, loading, error } = usePrimaryWeather()

  if (!location) return null

  if (!forecast) {
    return (
      <div className="flex h-14.5 w-full items-center gap-3 text-left" role="status" aria-live="polite">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-info-soft text-info">{loading ? <RefreshCw className="animate-spin" size={18} /> : <CloudSun size={20} />}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[12px] font-bold">
            {location.name}天气{loading ? '正在更新' : '暂不可用'}
          </h3>
          <p className="mt-0.5 truncate text-[9px] text-muted">{error ?? '正在读取最近天气'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-22 w-full min-w-0 items-center gap-3 text-left" aria-label={`${location.name}今日天气`} role="status">
      <span className="grid size-16 shrink-0 place-items-center text-info">
        <WeatherGlyph code={forecast.current.weatherCode} size={54} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline gap-3">
          <strong className="shrink-0 text-[36px] leading-none tracking-[-.04em]">{Math.round(forecast.current.temperature)}°</strong>
          <b className="truncate text-[15px]">{weatherCodeLabel(forecast.current.weatherCode)}</b>
        </span>
        <span className="mt-3 block truncate text-[12px] text-muted">
          湿度 {Math.round(forecast.current.humidity)}% · {windLevelLabel(forecast.current.windSpeed)} {Math.round(forecast.current.windSpeed)} km/h
        </span>
      </span>
    </div>
  )
}
