import { CloudSun, Droplets, RefreshCw, SunMedium, Umbrella, Wind } from "lucide-react";
import { weatherCodeLabel } from "./openMeteo";
import { locationSubtitle, uvIndexLabel, weatherHealthAdvice, windLevelLabel } from "./presentation";
import { usePrimaryWeather, type PrimaryWeatherState } from "./usePrimaryWeather";
import { WeatherGlyph } from "./WeatherGlyph";

export function TodayWeatherHeader() {
  const { location, forecast, loading, error } = usePrimaryWeather();

  if (!location) return null;

  if (!forecast) {
    return (
      <div className="flex h-[58px] w-full items-center gap-3 text-left" role="status" aria-live="polite">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-info-soft text-info">{loading ? <RefreshCw className="animate-spin" size={18} /> : <CloudSun size={20} />}</span>
        <div className="min-w-0 flex-1"><h3 className="text-[12px] font-bold">{location.name}天气{loading ? "正在更新" : "暂不可用"}</h3><p className="mt-0.5 truncate text-[9px] text-muted">{error ?? "正在读取最近天气"}</p></div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[88px] w-full min-w-0 items-center gap-3 text-left" aria-label={`${location.name}今日天气`} role="status">
      <span className="grid size-16 shrink-0 place-items-center text-info"><WeatherGlyph code={forecast.current.weatherCode} size={54} /></span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline gap-3"><strong className="shrink-0 text-[36px] leading-none tracking-[-.04em]">{Math.round(forecast.current.temperature)}°</strong><b className="truncate text-[15px]">{weatherCodeLabel(forecast.current.weatherCode)}</b></span>
        <span className="mt-3 block truncate text-[12px] text-muted">湿度 {Math.round(forecast.current.humidity)}% · {windLevelLabel(forecast.current.windSpeed)} {Math.round(forecast.current.windSpeed)} km/h</span>
      </span>
    </div>
  );
}

export function BreakWeatherPanel({ weather }: { weather: PrimaryWeatherState }) {
  const { location, forecast, loading, error } = weather;

  if (!location) return null;

  return (
    <aside className="rounded-[22px] border border-inverse/15 bg-inverse/10 p-4 text-left backdrop-blur-sm" aria-label="休息时天气与健康提示">
      <div className="flex items-center justify-between gap-2"><span className="text-[8px] font-extrabold tracking-[.14em] text-break-soft">天气与休息</span><span className="max-w-[118px] truncate text-[8px] text-inverse-muted">{locationSubtitle(location)}</span></div>
      {!forecast ? (
        <div className="mt-5 text-center">{loading ? <RefreshCw className="mx-auto animate-spin text-break-soft" size={24} /> : <CloudSun className="mx-auto text-break-soft" size={26} />}<strong className="mt-3 block text-xs">{location.name}天气{loading ? "更新中" : "暂不可用"}</strong>{error && <p className="mt-2 text-[8px] text-inverse-muted">{error}</p>}</div>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-3"><span className="grid size-12 place-items-center rounded-2xl bg-inverse/10 text-break-soft"><WeatherGlyph code={forecast.current.weatherCode} size={26} /></span><div><strong className="text-2xl leading-none">{Math.round(forecast.current.temperature)}°</strong><span className="mt-1 block text-[9px] text-inverse-muted">{location.name} · {weatherCodeLabel(forecast.current.weatherCode)}</span></div></div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <DarkMetric icon={Droplets} label="湿度" value={`${Math.round(forecast.current.humidity)}%`} />
            <DarkMetric icon={SunMedium} label="紫外线" value={`${forecast.current.uvIndex.toFixed(1)} · ${uvIndexLabel(forecast.current.uvIndex)}`} />
            <DarkMetric icon={Wind} label={windLevelLabel(forecast.current.windSpeed)} value={`${Math.round(forecast.current.windSpeed)} km/h`} />
            <DarkMetric icon={Umbrella} label="今日降水" value={`${(forecast.daily[0]?.precipitationSum ?? 0).toFixed(1)} mm`} />
          </div>
          <div className="mt-3 rounded-xl bg-inverse/10 p-3"><span className="text-[7px] font-bold tracking-[.12em] text-break-soft">健康提示</span><p className="mt-1 text-[9px] leading-4 text-inverse-muted">{weatherHealthAdvice(forecast, "break")}</p></div>
        </>
      )}
    </aside>
  );
}

function DarkMetric({ icon: Icon, label, value }: { icon: typeof Droplets; label: string; value: string }) {
  return <div className="min-w-0 rounded-xl border border-inverse/10 bg-inverse/5 p-2.5"><span className="flex items-center gap-1 text-[7px] text-inverse-muted"><Icon size={11} className="text-break-soft" />{label}</span><strong className="mt-1 block truncate text-[9px]">{value}</strong></div>;
}
