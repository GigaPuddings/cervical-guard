import { Activity, Cloud, CloudRain, Droplets, Leaf, MapPin, RefreshCw, SunMedium, Thermometer, Umbrella, Wind } from 'lucide-react'
import { EmptyState } from '../../components/EmptyState'
import { WeatherCard } from '../../components/WeatherCard'
import type { Language } from '../../i18n'
import { defineMessages, localizeMessages, translateNow } from '../../runtimeI18n'
import { cloudCoverLabel, formatWeatherUpdatedAt, humidityLevelLabel, locationSubtitle, precipitationAmountLabel, precipitationProbabilityLabel, uvIndexLabel, uvProtectionLabel, weatherActivityGuidance, windLevelLabel } from './presentation'
import { weatherCodeLabel } from './openMeteo'
import type { WeatherForecast, WeatherLocation } from './types'
import { useCityHeroImage } from './cityHero'
import { WeatherGlyph } from './WeatherGlyph'

const detailMessages = defineMessages({
  addFirstCity: '添加第一个城市',
  addFirstDescription: '天气详情、今日概览和休息建议会共用你选择的首选地点。',
  loading: '正在获取天气…',
  loadFailed: '天气加载失败',
  retry: '重试',
  feelsLike: '体感',
  humidity: '湿度',
  humidityHigh: '偏高',
  uv: '紫外线',
  wind: '风速',
  precipitationToday: '降水量',
  cloudCover: '云量',
  precipitationProbability: '降水概率',
  advice: '今日运动与护颈建议',
  todayRange: '今日温度范围',
  feelsWarm: '体感偏热',
  clothing: '建议穿着轻薄透气衣物',
  outside: '适合户外活动',
  dataUpdated: '数据更新',
  today: '今天',
  rain: '降水',
  source: '数据来源：Open-Meteo',
  hydrate: '注意补水',
  stretch: '运动后拉伸放松',
  sunscreen: '注意防晒',
  heroAlt: '上海浦东城市天际线',
  sunscreenAdvice: '建议防晒',
  little: '较少',
  partlyCloudy: '晴间多云',
  low: '较低',
  uvAdvice: '紫外线较强时请注意防晒，并适当补水与短暂放松肩颈。',
  dailyNeckAdvice: '温差较大时注意颈肩保暖；推荐轻中等强度活动，并搭配肩颈拉伸来缓解久坐紧张感。',
  aiReference: 'AI 健康建议仅供日常参考'
})

export function WeatherDetail({ language, location, forecast, error, loading, onRefresh }: { language: Language; location: WeatherLocation | undefined; forecast: WeatherForecast | undefined; error: string | undefined; loading: boolean; onRefresh: () => void; onRemove: () => void }) {
  const messages = localizeMessages(detailMessages, language)
  const t = (value: string) => translateNow(value, language)
  if (!location)
    return (
      <article className="rounded-[16px] border border-dashed border-edge bg-panel-muted">
        <EmptyState icon={MapPin} title={messages.addFirstCity} description={messages.addFirstDescription} />
      </article>
    )
  if (!forecast && loading)
    return (
      <article className="grid min-h-0 place-content-center justify-items-center rounded-[16px] border border-edge bg-panel text-muted shadow-panel">
        <RefreshCw className="animate-spin text-accent" size={24} />
        <span className="mt-3 text-[11px]">{messages.loading}</span>
      </article>
    )
  if (!forecast && error)
    return (
      <article className="grid min-h-0 place-content-center justify-items-center rounded-[16px] border border-edge bg-panel px-6 text-center shadow-panel">
        <Cloud size={28} className="text-muted" />
        <strong className="mt-3 text-[13px]">{messages.loadFailed}</strong>
        <span className="mt-2 text-[10px] text-danger">{t(error)}</span>
        <button className="mt-4 rounded-[10px] bg-accent px-4 py-2 text-[10px] font-bold text-inverse" onClick={onRefresh}>
          {messages.retry}
        </button>
      </article>
    )
  if (!forecast) return null
  return <WeatherDetailContent language={language} location={location} forecast={forecast} onRefresh={onRefresh} />
}

function WeatherDetailContent({ language, location, forecast, onRefresh }: { language: Language; location: WeatherLocation; forecast: WeatherForecast; onRefresh: () => void }) {
  const messages = localizeMessages(detailMessages, language)
  const t = (value: string) => translateNow(value, language)
  const today = forecast.daily[0]
  const rangeMin = Math.round(today?.temperatureMin ?? forecast.current.temperature)
  const rangeMax = Math.round(today?.temperatureMax ?? forecast.current.temperature)
  const guidance = weatherActivityGuidance(forecast, language)
  const cityHero = useCityHeroImage(location)
  const updatedAt = formatWeatherUpdatedAt(forecast, language)
  const headerUpdatedAt = language === 'en-US' ? updatedAt : `${messages.dataUpdated} ${updatedAt.slice(0, -3)}`

  return (
    <article className="weather-detail-card flex min-h-0 flex-col overflow-hidden rounded-[16px] border border-edge bg-panel px-4 py-4 shadow-panel">
      <header className="weather-detail-header flex shrink-0 items-center justify-between px-1">
        <div className="flex min-w-0 items-center gap-3">
          <span className="weather-detail-location-icon grid size-10.5 place-items-center rounded-[12px] bg-info-soft text-info">
            <MapPin size={19} />
          </span>
          <span className="min-w-0">
            <h2 className="weather-detail-location-title truncate text-[20px] font-black">{location.name}</h2>
            <p className="weather-detail-location-subtitle mt-0.5 truncate text-[11px] text-muted">{locationSubtitle(location, language)}</p>
          </span>
        </div>
        <button className="weather-detail-refresh flex items-center gap-2 rounded-[9px] px-2 py-1.5 text-[10px] text-muted hover:bg-panel-muted" onClick={onRefresh}>
          {headerUpdatedAt} <RefreshCw size={14} />
        </button>
      </header>

      <div className="weather-detail-hero-grid grid shrink-0 grid-cols-[minmax(400px,1.05fr)_minmax(480px,1.25fr)] gap-4">
        <section className="relative overflow-hidden rounded-[13px] bg-info text-inverse">
          {cityHero ? <img key={cityHero.src} className="absolute inset-0 size-full object-cover" src={cityHero.src} alt={cityHero.alt} /> : null}
          <div className="absolute inset-0 bg-panel-strong/12" />
          {cityHero?.sourceUrl ? (
            <a className="absolute right-3 top-3 z-10 rounded-full bg-panel-strong/45 px-2 py-1 text-[8px] text-inverse/90 backdrop-blur-sm hover:bg-panel-strong/65" href={cityHero.sourceUrl} target="_blank" rel="noreferrer">
              {language === 'en-US' ? 'Image: Wikipedia' : cityHero.sourceLabel}
            </a>
          ) : null}
          <div className="weather-hero-copy absolute inset-0 flex flex-col justify-between p-7 drop-shadow-[0_2px_8px_rgba(0,0,0,.35)]">
            <span className="weather-hero-condition flex items-center gap-2.5 text-[14px] font-bold">
              <WeatherGlyph code={forecast.current.weatherCode} size={31} />
              {t(weatherCodeLabel(forecast.current.weatherCode))}
            </span>
            <div>
              <strong className="weather-hero-temperature block text-[64px] font-black leading-none tracking-[-.055em]">{Math.round(forecast.current.temperature)}°</strong>
              <span className="weather-hero-feels mt-3 block text-[14px]">
                {messages.feelsLike} {Math.round(forecast.current.apparentTemperature)}°
              </span>
              <span className="weather-hero-activity mt-3 inline-flex rounded-full bg-panel/75 px-3 py-1 text-[10px] font-bold text-accent">{t(guidance.activityLabel)}</span>
            </div>
          </div>
        </section>
        <div className="grid min-w-0 grid-cols-3 grid-rows-2 gap-2.5">
          <WeatherCard icon={Droplets} label={messages.humidity} value={`${Math.round(forecast.current.humidity)}%`} note={humidityLevelLabel(forecast.current.humidity, language)} />
          <WeatherCard icon={SunMedium} label={messages.uv} value={`${t(uvIndexLabel(forecast.current.uvIndex))} · ${forecast.current.uvIndex.toFixed(1)}`} note={t(uvProtectionLabel(forecast.current.uvIndex))} />
          <WeatherCard icon={Wind} label={messages.wind} value={`${Math.round(forecast.current.windSpeed)} km/h`} note={t(windLevelLabel(forecast.current.windSpeed))} />
          <WeatherCard icon={CloudRain} label={messages.precipitationToday} value={`${(today?.precipitationSum ?? 0).toFixed(1)} mm`} note={precipitationAmountLabel(today?.precipitationSum ?? 0, language)} />
          <WeatherCard icon={Cloud} label={messages.cloudCover} value={`${Math.round(forecast.current.cloudCover)}%`} note={cloudCoverLabel(forecast.current.cloudCover, language)} />
          <WeatherCard icon={Umbrella} label={messages.precipitationProbability} value={`${Math.round(today?.precipitationProbability ?? 0)}%`} note={precipitationProbabilityLabel(today?.precipitationProbability ?? 0, language)} />
        </div>
      </div>

      <div className="weather-detail-advice-grid grid shrink-0 grid-cols-[minmax(0,1fr)_340px] gap-4">
        <section className="weather-advice-card flex min-w-0 flex-col justify-between rounded-[13px] border border-edge bg-panel px-4 py-4">
          <div className="flex items-start gap-3.5">
            <span className="weather-advice-icon grid size-11 shrink-0 place-items-center rounded-[12px] bg-accent-soft text-accent">
              <Leaf size={21} />
            </span>
            <div className="min-w-0">
              <strong className="weather-advice-title block text-[15px]">{messages.advice}</strong>
              <p className="weather-advice-copy mt-2 line-clamp-3 text-[11px] leading-5 text-muted">
                {t(guidance.summary)} {t(guidance.detail)}
              </p>
            </div>
          </div>
          <div className="weather-advice-tags flex flex-wrap items-center gap-2 text-[9px] text-accent">
            {guidance.tags.map(tag => (
              <span className="rounded-full bg-accent-soft px-3 py-1" key={tag}>
                {t(tag)}
              </span>
            ))}
          </div>
        </section>
        <section className="weather-range-card rounded-[13px] border border-accent/15 bg-accent-soft/55 px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="weather-range-icon grid size-11 place-items-center rounded-[12px] bg-panel text-accent">
              <Thermometer size={21} />
            </span>
            <div>
              <span className="weather-range-label block text-[10px] text-muted">{messages.todayRange}</span>
              <strong className="weather-range-value mt-1 block text-[23px] font-black">
                {rangeMin}–{rangeMax}°
              </strong>
            </div>
          </div>
          <div className="relative mt-4 h-1 rounded-full bg-[linear-gradient(90deg,#8FC58D_0%,#C9CC72_32%,#F0B72C_58%,#F3C88B_100%)]">
            <i className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#F0B72C]" style={{ left: `${guidance.temperaturePosition}%` }} />
            <i className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#EFA335]" style={{ left: `${guidance.apparentPosition}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[9px] text-muted">
            <span>{rangeMin}°</span>
            <span>{rangeMax}°</span>
          </div>
          <strong className="weather-range-feeling mt-2 block text-[10px] text-warning">{t(guidance.thermalLabel)}</strong>
          <small className="weather-range-clothing mt-0.5 block text-[9px] text-muted">{t(guidance.clothing)}</small>
        </section>
      </div>

      <div className="weather-detail-forecast-grid grid shrink-0 grid-cols-7 overflow-hidden rounded-[12px] border border-edge bg-panel-muted/55">
        {forecast.daily.slice(0, 7).map((day, index) => {
          const date = new Date(`${day.date}T12:00:00`)
          const dayLabel = index === 0 ? messages.today : `${new Intl.DateTimeFormat(language, { weekday: 'short' }).format(date)} · ${date.getMonth() + 1}/${date.getDate()}`
          return (
            <div className={`weather-forecast-day grid min-w-0 place-content-center justify-items-center gap-1.5 border-r border-edge-soft px-1 text-center last:border-r-0 ${index === 0 ? 'bg-accent-soft/45' : ''}`} key={day.date}>
              <span className="weather-forecast-label text-[10px] font-bold">
                {index === 0 ? (
                  dayLabel
                ) : (
                  <>
                    {new Intl.DateTimeFormat(language, { weekday: 'short' }).format(date)}
                    <em className="ml-1 font-normal not-italic text-muted">
                      · {date.getMonth() + 1}/{date.getDate()}
                    </em>
                  </>
                )}
              </span>
              <WeatherGlyph code={day.weatherCode} size={26} className="weather-forecast-glyph text-info" />
              <strong className="weather-forecast-temperature text-[11px]">
                {Math.round(day.temperatureMin)}° / {Math.round(day.temperatureMax)}°
              </strong>
              <span className="weather-forecast-condition text-[8px] text-muted">{t(weatherCodeLabel(day.weatherCode))}</span>
              <small className="weather-forecast-meta text-[7px] text-muted">
                {messages.rain} {day.precipitationProbability.toFixed(0)}% · UV {day.uvIndexMax.toFixed(1)}
              </small>
            </div>
          )
        })}
      </div>

      <footer className="weather-detail-footer mt-2 flex h-3 items-center justify-between text-[8px] text-muted">
        <span>
          {messages.source} · {formatWeatherUpdatedAt(forecast, language)}
        </span>
        <span className="flex items-center gap-1 text-accent">
          <Activity size={10} />
          {messages.aiReference}
        </span>
      </footer>
    </article>
  )
}
