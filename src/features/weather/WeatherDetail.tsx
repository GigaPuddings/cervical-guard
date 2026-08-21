import { Activity, Cloud, CloudSun, Droplets, MapPin, RefreshCw, SunMedium, Trash2, Umbrella, Wind } from 'lucide-react'
import type { Language } from '../../i18n'
import { defineMessages, localizeMessages, translateNow } from '../../runtimeI18n'
import { formatWeatherUpdatedAt, locationSubtitle, uvIndexLabel, weatherHealthAdvice, windLevelLabel } from './presentation'
import { weatherCodeLabel } from './openMeteo'
import type { WeatherForecast, WeatherLocation } from './types'
import { WeatherGlyph } from './WeatherGlyph'

const detailMessages = defineMessages({
  addFirstCity: '添加第一个城市',
  addFirstDescription: '天气详情、今日概览和休息建议会共用你选择的首选地点。',
  refresh: '刷新',
  weather: '天气',
  remove: '移除',
  loading: '正在获取',
  loadingSuffix: '天气…',
  loadFailed: '天气加载失败',
  retry: '重试',
  offline: '离线缓存',
  feelsLike: '体感',
  cloudCover: '云量',
  humidity: '湿度',
  uv: '紫外线',
  precipitationToday: '今日降水量',
  precipitationProbability: '降水概率',
  advice: '结合天气的休息建议',
  todayRange: '今日环境范围',
  precipitation: '降水',
  peakUv: 'UV 峰值',
  today: '今天',
  rain: '雨',
  disclaimer: '模型预报仅供生活参考，不参与医疗判断或自动修改提醒。'
})

export function WeatherDetail({ language, location, forecast, error, loading, onRefresh, onRemove }: { language: Language; location: WeatherLocation | undefined; forecast: WeatherForecast | undefined; error: string | undefined; loading: boolean; onRefresh: () => void; onRemove: () => void }) {
  const messages = localizeMessages(detailMessages, language)
  const t = (value: string) => translateNow(value, language)
  if (!location) {
    return (
      <article className="grid min-h-0 place-content-center justify-items-center rounded-2xl border border-dashed border-edge bg-panel-muted text-center">
        <span className="grid size-14 place-items-center rounded-3xl bg-info-soft text-info">
          <CloudSun size={27} />
        </span>
        <h2 className="mt-4 text-[clamp(14px,1vw,18px)] font-black">{messages.addFirstCity}</h2>
        <p className="mt-1 max-w-85 text-[clamp(10px,.7vw,12px)] leading-5 text-muted">{messages.addFirstDescription}</p>
      </article>
    )
  }

  return (
    <article className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-edge bg-panel shadow-panel">
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-edge px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-info-soft text-info">
            <MapPin size={17} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-[clamp(13px,1vw,17px)] font-black">{location.name}</h2>
            <p className="mt-0.5 truncate text-[clamp(9px,.65vw,12px)] text-muted">{locationSubtitle(location, language)}</p>
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button className="grid size-8 place-items-center rounded-lg text-muted hover:bg-panel-muted hover:text-accent disabled:opacity-40" aria-label={`${messages.refresh} ${location.name} ${messages.weather}`} disabled={loading} onClick={onRefresh}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button className="grid size-8 place-items-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger" aria-label={`${messages.remove} ${location.name}`} onClick={onRemove}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      {!forecast && loading && (
        <div className="grid min-h-0 flex-1 place-content-center justify-items-center gap-3 text-muted">
          <RefreshCw className="animate-spin" size={24} />
          <span className="text-[clamp(10px,.72vw,13px)]">{messages.loading} {location.name} {messages.loadingSuffix}</span>
        </div>
      )}
      {!forecast && error && (
        <div className="grid min-h-0 flex-1 place-content-center justify-items-center gap-3 px-6 text-center">
          <CloudSun className="text-muted" size={29} />
          <strong className="text-[clamp(12px,.85vw,15px)]">{messages.loadFailed}</strong>
          <span className="text-[clamp(10px,.72vw,13px)] text-danger">{t(error)}</span>
          <button className="rounded-lg bg-accent px-3 py-2 text-[clamp(10px,.72vw,13px)] font-bold text-inverse" onClick={onRefresh}>
            {messages.retry}
          </button>
        </div>
      )}
      {forecast && <WeatherDetailContent language={language} forecast={forecast} />}
    </article>
  )
}

function WeatherDetailContent({ language, forecast }: { language: Language; forecast: WeatherForecast }) {
  const today = forecast.daily[0]
  const messages = localizeMessages(detailMessages, language)
  const t = (value: string) => translateNow(value, language)
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 p-3">
      <div className="grid h-[clamp(138px,24vh,190px)] shrink-0 grid-cols-[152px_minmax(0,1fr)] gap-2.5">
        <div className="rounded-2xl bg-info-soft p-3 text-info">
          <div className="flex items-center justify-between">
            <span className="grid size-10 place-items-center rounded-xl bg-panel">
              <WeatherGlyph code={forecast.current.weatherCode} size={24} />
            </span>
            <small className="text-[clamp(8px,.6vw,11px)] font-bold">{forecast.stale ? messages.offline : formatWeatherUpdatedAt(forecast, language)}</small>
          </div>
          <strong className="mt-3 block text-[clamp(38px,3.2vw,54px)] leading-none tracking-[-.06em]">{Math.round(forecast.current.temperature)}°</strong>
          <span className="mt-1.5 block text-[clamp(11px,.9vw,15px)] font-bold">{t(weatherCodeLabel(forecast.current.weatherCode))}</span>
          <small className="mt-0.5 block text-[clamp(9px,.65vw,12px)]">
            {messages.feelsLike} {Math.round(forecast.current.apparentTemperature)}° · {messages.cloudCover} {Math.round(forecast.current.cloudCover)}%
          </small>
        </div>
        <div className="grid min-w-0 grid-cols-3 grid-rows-2 gap-2">
          <WeatherMetric icon={Droplets} label={messages.humidity} value={`${Math.round(forecast.current.humidity)}%`} />
          <WeatherMetric icon={SunMedium} label={`${messages.uv} · ${t(uvIndexLabel(forecast.current.uvIndex))}`} value={forecast.current.uvIndex.toFixed(1)} />
          <WeatherMetric icon={Wind} label={t(windLevelLabel(forecast.current.windSpeed))} value={`${Math.round(forecast.current.windSpeed)} km/h`} />
          <WeatherMetric icon={Umbrella} label={messages.precipitationToday} value={`${(today?.precipitationSum ?? 0).toFixed(1)} mm`} />
          <WeatherMetric icon={Cloud} label={messages.cloudCover} value={`${Math.round(forecast.current.cloudCover)}%`} />
          <WeatherMetric icon={Umbrella} label={messages.precipitationProbability} value={`${Math.round(today?.precipitationProbability ?? 0)}%`} />
        </div>
      </div>
      <div className="grid min-h-14.5 flex-1 grid-cols-[minmax(0,1.2fr)_minmax(145px,.8fr)] gap-2.5">
        <div className="flex min-w-0 items-center gap-3 rounded-xl border border-info/15 bg-info-soft/65 px-3 py-2 text-info">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-panel">
            <Activity size={17} />
          </span>
          <div className="min-w-0">
            <strong className="block text-[clamp(10px,.72vw,13px)]">{messages.advice}</strong>
            <p className="mt-1 text-[clamp(10px,.72vw,13px)] leading-[1.55]">{t(weatherHealthAdvice(forecast))}</p>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-3 rounded-xl border border-edge bg-panel-muted px-3 py-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-panel text-accent">
            <SunMedium size={17} />
          </span>
          <div className="min-w-0">
            <span className="block text-[clamp(9px,.65vw,11px)] text-muted">{messages.todayRange}</span>
            <strong className="mt-1 block text-[clamp(13px,1vw,17px)]">
              {Math.round(today?.temperatureMin ?? 0)}–{Math.round(today?.temperatureMax ?? 0)}°
            </strong>
            <small className="mt-0.5 block truncate text-[clamp(8px,.6vw,11px)] text-muted">
              {messages.precipitation} {today?.precipitationProbability.toFixed(0) ?? 0}% · {messages.peakUv} {today?.uvIndexMax.toFixed(1) ?? '0.0'}
            </small>
          </div>
        </div>
      </div>
      <div className="grid h-[clamp(82px,13vh,104px)] shrink-0 grid-cols-5 overflow-hidden rounded-xl border border-edge bg-panel-muted/70">
        {forecast.daily.map((day, index) => (
          <div key={day.date} className="grid min-w-0 place-content-center justify-items-center gap-1 border-r border-edge px-1 text-center last:border-r-0">
            <span className="text-[clamp(9px,.65vw,11px)] font-bold text-muted">{index === 0 ? messages.today : new Intl.DateTimeFormat(language, { weekday: 'short' }).format(new Date(`${day.date}T12:00:00`))}</span>
            <span className="text-info">
              <WeatherGlyph code={day.weatherCode} size={17} />
            </span>
            <strong className="text-[clamp(10px,.78vw,13px)]">
              {Math.round(day.temperatureMax)}° <span className="font-normal text-muted">{Math.round(day.temperatureMin)}°</span>
            </strong>
            <small className="truncate text-[clamp(8px,.58vw,10px)] text-info">
              {messages.rain} {day.precipitationProbability.toFixed(0)}% · UV {day.uvIndexMax.toFixed(1)}
            </small>
          </div>
        ))}
      </div>
      <footer className="flex h-4 shrink-0 items-center justify-between gap-3 text-[clamp(8px,.56vw,10px)] text-muted">
        <span className="truncate">{messages.disclaimer}</span>
        <a className="shrink-0 font-bold text-accent hover:underline" href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          Open-Meteo · CC BY 4.0
        </a>
      </footer>
    </div>
  )
}

function WeatherMetric({ icon: Icon, label, value }: { icon: typeof Droplets; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-edge bg-panel px-2.5 py-2.5">
      <Icon size={15} className="text-accent" />
      <span className="mt-1.5 block truncate text-[clamp(9px,.68vw,12px)] text-muted">{label}</span>
      <strong className="mt-0.5 block truncate text-[clamp(11px,.88vw,15px)]">{value}</strong>
    </div>
  )
}
