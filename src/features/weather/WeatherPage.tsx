import {
  Activity,
  Cloud,
  CloudSun,
  Droplets,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  SunMedium,
  Trash2,
  Umbrella,
  Wind,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../utils";
import { searchChineseCities, weatherCodeLabel } from "./openMeteo";
import {
  formatWeatherUpdatedAt,
  locationSubtitle,
  uvIndexLabel,
  weatherHealthAdvice,
  windLevelLabel,
} from "./presentation";
import {
  getWeatherForecast,
  loadPreferredWeatherLocation,
  loadWeatherLocations,
  removeCachedForecast,
  savePreferredWeatherLocation,
  saveWeatherLocations,
} from "./repository";
import { MAX_WEATHER_LOCATIONS, type CitySearchResult, type WeatherForecast, type WeatherLocation } from "./types";
import { publishWeatherToReminderIsland } from "./usePrimaryWeather";
import { WeatherGlyph } from "./WeatherGlyph";

export function reasonMessage(reason: unknown): string {
  if (reason instanceof DOMException && reason.name === "AbortError") return "请求已取消";
  if (reason instanceof Error) return reason.message;
  // Tauri `invoke` 会直接以 Rust command 返回的 String 作为 rejection，
  // 不是 JavaScript Error。必须保留该文本，才能显示 Windows 权限/来源诊断。
  if (typeof reason === "string" && reason.trim()) return reason.trim();
  return "操作暂时无法完成";
}

export function WeatherPage() {
  const [locations, setLocations] = useState<WeatherLocation[]>(loadWeatherLocations);
  const [activeLocationId, setActiveLocationId] = useState<string | null>(() => loadPreferredWeatherLocation()?.id ?? null);
  const [forecasts, setForecasts] = useState<Record<string, WeatherForecast>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CitySearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requestedIds = useRef(new Set<string>());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const refreshOne = useCallback(async (location: WeatherLocation, force = false) => {
    setLoadingIds((current) => new Set(current).add(location.id));
    setErrors((current) => {
      const next = { ...current };
      delete next[location.id];
      return next;
    });
    try {
      const forecast = await getWeatherForecast(location, force);
      if (mounted.current) setForecasts((current) => ({ ...current, [location.id]: forecast }));
    } catch (reason) {
      if (mounted.current) setErrors((current) => ({ ...current, [location.id]: reasonMessage(reason) }));
    } finally {
      if (mounted.current) setLoadingIds((current) => {
        const next = new Set(current);
        next.delete(location.id);
        return next;
      });
    }
  }, []);

  useEffect(() => {
    for (const location of locations) {
      if (requestedIds.current.has(location.id)) continue;
      requestedIds.current.add(location.id);
      void refreshOne(location);
    }
  }, [locations, refreshOne]);

  useEffect(() => {
    if (locations.length === 0) {
      setActiveLocationId(null);
      return;
    }
    if (!activeLocationId || !locations.some((location) => location.id === activeLocationId)) {
      const nextId = loadPreferredWeatherLocation()?.id ?? locations[0]!.id;
      setActiveLocationId(nextId);
      savePreferredWeatherLocation(nextId);
    }
  }, [activeLocationId, locations]);

  const selectedIds = useMemo(() => new Set(locations.map((location) => location.id)), [locations]);
  const activeLocation = locations.find((location) => location.id === activeLocationId) ?? locations[0];
  const activeForecast = activeLocation ? forecasts[activeLocation.id] : undefined;
  const atLimit = locations.length >= MAX_WEATHER_LOCATIONS;

  useEffect(() => {
    if (activeForecast) void publishWeatherToReminderIsland(activeForecast);
    else if (!activeLocation) void publishWeatherToReminderIsland(null);
  }, [activeForecast, activeLocation]);

  const persistLocations = (next: WeatherLocation[]) => {
    setLocations(next);
    saveWeatherLocations(next);
  };

  const selectLocation = (location: WeatherLocation) => {
    setActiveLocationId(location.id);
    savePreferredWeatherLocation(location.id);
  };

  const addLocation = (location: WeatherLocation) => {
    if (selectedIds.has(location.id)) {
      setNotice(`${location.name} 已在关注列表中`);
      return;
    }
    if (atLimit) {
      setNotice(`最多关注 ${MAX_WEATHER_LOCATIONS} 个地点，请先移除一个`);
      return;
    }
    persistLocations([...locations, location]);
    setActiveLocationId(location.id);
    window.setTimeout(() => savePreferredWeatherLocation(location.id), 0);
    setNotice(`已添加 ${location.name}，并设为概览天气`);
    setResults([]);
    setQuery("");
  };

  const removeLocation = (location: WeatherLocation) => {
    const next = locations.filter((item) => item.id !== location.id);
    persistLocations(next);
    requestedIds.current.delete(location.id);
    removeCachedForecast(location.id);
    setForecasts((current) => {
      const copy = { ...current };
      delete copy[location.id];
      return copy;
    });
    if (activeLocationId === location.id) {
      const nextId = next[0]?.id ?? null;
      setActiveLocationId(nextId);
      if (nextId) window.setTimeout(() => savePreferredWeatherLocation(nextId), 0);
    }
  };

  const search = async () => {
    if (query.trim().length < 2) {
      setSearchError("请输入至少 2 个字符，例如“北京”或“杭州市”");
      return;
    }
    setSearching(true);
    setSearchError(null);
    setNotice(null);
    try {
      const next = await searchChineseCities(query);
      setResults(next);
      if (next.length === 0) setSearchError("没有找到匹配的中国城市，请尝试输入完整城市名");
    } catch (reason) {
      setSearchError(reasonMessage(reason));
    } finally {
      setSearching(false);
    }
  };

  const refreshAll = () => {
    for (const location of locations) void refreshOne(location, true);
  };

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-[1500px] flex-col gap-3 overflow-hidden px-[clamp(16px,3vw,34px)] py-4">
      <header className="flex shrink-0 items-end justify-between gap-4">
        <div className="min-w-0"><span className="text-[clamp(10px,.72vw,13px)] font-extrabold tracking-[.16em] text-info">天气与活动</span><h1 className="mt-1 truncate text-[clamp(24px,2.2vw,35px)] font-black leading-none tracking-[-.035em]">今天适合怎么动一动</h1></div>
        <button className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl border border-edge bg-panel px-3 text-[clamp(10px,.72vw,13px)] font-bold shadow-control hover:bg-panel-muted disabled:opacity-50" disabled={locations.length === 0 || loadingIds.size > 0} onClick={refreshAll}><RefreshCw size={16} className={loadingIds.size > 0 ? "animate-spin" : ""} /> 刷新全部</button>
      </header>

      <section className="relative z-20 shrink-0 rounded-2xl border border-edge bg-panel p-2.5 shadow-panel">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <label className="relative min-w-0">
            <span className="sr-only">搜索中国城市</span><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={15} />
            <input className="h-10 w-full rounded-xl border border-edge bg-field pl-9 pr-3 text-[clamp(11px,.82vw,15px)] outline-none placeholder:text-subtle focus:border-accent" value={query} placeholder="输入城市名，例如：南京、杭州、深圳" onChange={(event) => { setQuery(event.target.value); setResults([]); setSearchError(null); }} onKeyDown={(event) => { if (event.key === "Enter") void search(); }} />
          </label>
          <button className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-accent px-3 text-[clamp(10px,.76vw,14px)] font-bold text-inverse hover:bg-accent-strong disabled:opacity-50" disabled={searching} onClick={() => void search()}>{searching ? <RefreshCw className="animate-spin" size={15} /> : <Search size={15} />} 搜索</button>
        </div>
        <div className="mt-1.5 flex h-4 items-center justify-between gap-3 px-1 text-[clamp(8px,.62vw,11px)] text-muted"><span className={cn("truncate", searchError && "text-danger", notice && !searchError && "text-info")}>{searchError ?? notice ?? `仅展示中国城市行政中心 · 已选 ${locations.length}/${MAX_WEATHER_LOCATIONS}`}</span><span className="shrink-0">搜索并选择城市，不读取设备位置</span></div>
        {results.length > 0 && (
          <div className="absolute left-2.5 right-2.5 top-[calc(100%-2px)] grid max-h-[230px] grid-cols-2 gap-2 overflow-y-auto rounded-2xl border border-edge bg-panel p-2.5 shadow-[0_20px_50px_rgba(25,48,31,.16)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="城市搜索结果">
            {results.map((result) => (
              <button key={result.id} className="flex min-w-0 items-center gap-2 rounded-xl border border-edge bg-panel-muted px-3 py-2 text-left hover:border-accent disabled:opacity-50" disabled={selectedIds.has(result.id)} onClick={() => addLocation(result)}>
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">{selectedIds.has(result.id) ? <MapPin size={14} /> : <Plus size={14} />}</span>
                <span className="min-w-0"><strong className="block truncate text-[clamp(11px,.78vw,14px)]">{result.name}</strong><small className="mt-0.5 block truncate text-[clamp(8px,.62vw,11px)] text-muted">{locationSubtitle(result)}</small></span>
                <span className="ml-auto shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[clamp(7px,.52vw,9px)] font-bold text-accent">城市</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="grid min-h-0 flex-1 grid-cols-[clamp(188px,16vw,250px)_minmax(0,1fr)] gap-3">
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-edge bg-panel shadow-panel">
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-edge px-3"><strong className="text-[clamp(11px,.82vw,15px)]">关注地点</strong><span className="text-[clamp(9px,.64vw,11px)] text-muted">{locations.length}/{MAX_WEATHER_LOCATIONS}</span></div>
          {locations.length === 0 ? (
            <div className="grid min-h-0 flex-1 place-content-center justify-items-center px-4 text-center"><span className="grid size-10 place-items-center rounded-2xl bg-info-soft text-info"><MapPin size={18} /></span><strong className="mt-3 text-[clamp(11px,.8vw,14px)]">还没有地点</strong><p className="mt-1 text-[clamp(9px,.65vw,11px)] leading-4 text-muted">输入城市名称并搜索添加</p></div>
          ) : (
            <div className="grid min-h-0 flex-1 content-start gap-1 overflow-y-auto p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {locations.map((location) => {
                const selected = location.id === activeLocation?.id;
                const forecast = forecasts[location.id];
                return (
                  <div key={location.id} className={cn("group flex h-[clamp(40px,3.4vw,48px)] items-center rounded-xl border px-1.5", selected ? "border-accent-soft-strong bg-accent-soft" : "border-transparent hover:bg-panel-muted")}>
                    <button className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-pressed={selected} onClick={() => selectLocation(location)}>
                      <span className={cn("grid size-[clamp(28px,2.4vw,36px)] shrink-0 place-items-center rounded-lg", selected ? "bg-panel text-accent" : "bg-panel-muted text-muted")}>{forecast ? <WeatherGlyph code={forecast.current.weatherCode} size={15} /> : <MapPin size={15} />}</span>
                      <span className="min-w-0"><strong className="block truncate text-[clamp(11px,.8vw,14px)]">{location.name}</strong><small className="block truncate text-[clamp(8px,.6vw,11px)] text-muted">{forecast ? `${Math.round(forecast.current.temperature)}° · ${weatherCodeLabel(forecast.current.weatherCode)}` : location.admin1 || "等待天气"}</small></span>
                    </button>
                    <button className="grid size-6 shrink-0 place-items-center rounded-md text-subtle opacity-0 hover:bg-danger-soft hover:text-danger group-hover:opacity-100 focus:opacity-100" aria-label={`移除${location.name}`} onClick={() => removeLocation(location)}><Trash2 size={12} /></button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="shrink-0 border-t border-edge px-3 py-2 text-[clamp(8px,.58vw,10px)] leading-4 text-muted">点击地点会设为今日概览、休息页和灵动岛的首选天气。</div>
        </aside>

        <WeatherDetail
          location={activeLocation}
          forecast={activeForecast}
          error={activeLocation ? errors[activeLocation.id] : undefined}
          loading={activeLocation ? loadingIds.has(activeLocation.id) : false}
          onRefresh={() => { if (activeLocation) void refreshOne(activeLocation, true); }}
          onRemove={() => { if (activeLocation) removeLocation(activeLocation); }}
        />
      </section>
    </div>
  );
}

function WeatherDetail({ location, forecast, error, loading, onRefresh, onRemove }: {
  location: WeatherLocation | undefined;
  forecast: WeatherForecast | undefined;
  error: string | undefined;
  loading: boolean;
  onRefresh: () => void;
  onRemove: () => void;
}) {
  if (!location) {
    return <article className="grid min-h-0 place-content-center justify-items-center rounded-2xl border border-dashed border-edge bg-panel-muted text-center"><span className="grid size-14 place-items-center rounded-3xl bg-info-soft text-info"><CloudSun size={27} /></span><h2 className="mt-4 text-[clamp(14px,1vw,18px)] font-black">添加第一个城市</h2><p className="mt-1 max-w-[340px] text-[clamp(10px,.7vw,12px)] leading-5 text-muted">天气详情、今日概览和休息建议会共用你选择的首选地点。</p></article>;
  }

  return (
    <article className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-edge bg-panel shadow-panel">
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-edge px-4">
        <div className="flex min-w-0 items-center gap-2.5"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-info-soft text-info"><MapPin size={17} /></span><div className="min-w-0"><h2 className="truncate text-[clamp(13px,1vw,17px)] font-black">{location.name}</h2><p className="mt-0.5 truncate text-[clamp(9px,.65vw,12px)] text-muted">{locationSubtitle(location)}</p></div></div>
        <div className="flex shrink-0 gap-1"><button className="grid size-8 place-items-center rounded-lg text-muted hover:bg-panel-muted hover:text-accent disabled:opacity-40" aria-label={`刷新${location.name}天气`} disabled={loading} onClick={onRefresh}><RefreshCw size={15} className={loading ? "animate-spin" : ""} /></button><button className="grid size-8 place-items-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger" aria-label={`移除${location.name}`} onClick={onRemove}><Trash2 size={15} /></button></div>
      </div>

      {!forecast && loading && <div className="grid min-h-0 flex-1 place-content-center justify-items-center gap-3 text-muted"><RefreshCw className="animate-spin" size={24} /><span className="text-[clamp(10px,.72vw,13px)]">正在获取{location.name}天气…</span></div>}
      {!forecast && error && <div className="grid min-h-0 flex-1 place-content-center justify-items-center gap-3 px-6 text-center"><CloudSun className="text-muted" size={29} /><strong className="text-[clamp(12px,.85vw,15px)]">天气加载失败</strong><span className="text-[clamp(10px,.72vw,13px)] text-danger">{error}</span><button className="rounded-lg bg-accent px-3 py-2 text-[clamp(10px,.72vw,13px)] font-bold text-inverse" onClick={onRefresh}>重试</button></div>}
      {forecast && <WeatherDetailContent forecast={forecast} />}
    </article>
  );
}

function WeatherDetailContent({ forecast }: { forecast: WeatherForecast }) {
  const today = forecast.daily[0];
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 p-3">
      <div className="grid h-[clamp(138px,24vh,190px)] shrink-0 grid-cols-[152px_minmax(0,1fr)] gap-2.5">
        <div className="rounded-2xl bg-info-soft p-3 text-info">
          <div className="flex items-center justify-between"><span className="grid size-10 place-items-center rounded-xl bg-panel"><WeatherGlyph code={forecast.current.weatherCode} size={24} /></span><small className="text-[clamp(8px,.6vw,11px)] font-bold">{forecast.stale ? "离线缓存" : formatWeatherUpdatedAt(forecast)}</small></div>
          <strong className="mt-3 block text-[clamp(38px,3.2vw,54px)] leading-none tracking-[-.06em]">{Math.round(forecast.current.temperature)}°</strong>
          <span className="mt-1.5 block text-[clamp(11px,.9vw,15px)] font-bold">{weatherCodeLabel(forecast.current.weatherCode)}</span>
          <small className="mt-0.5 block text-[clamp(9px,.65vw,12px)]">体感 {Math.round(forecast.current.apparentTemperature)}° · 云量 {Math.round(forecast.current.cloudCover)}%</small>
        </div>
        <div className="grid min-w-0 grid-cols-3 grid-rows-2 gap-2">
          <WeatherMetric icon={Droplets} label="湿度" value={`${Math.round(forecast.current.humidity)}%`} />
          <WeatherMetric icon={SunMedium} label={`紫外线 · ${uvIndexLabel(forecast.current.uvIndex)}`} value={forecast.current.uvIndex.toFixed(1)} />
          <WeatherMetric icon={Wind} label={windLevelLabel(forecast.current.windSpeed)} value={`${Math.round(forecast.current.windSpeed)} km/h`} />
          <WeatherMetric icon={Umbrella} label="今日降水量" value={`${(today?.precipitationSum ?? 0).toFixed(1)} mm`} />
          <WeatherMetric icon={Cloud} label="云量" value={`${Math.round(forecast.current.cloudCover)}%`} />
          <WeatherMetric icon={Umbrella} label="降水概率" value={`${Math.round(today?.precipitationProbability ?? 0)}%`} />
        </div>
      </div>

      <div className="grid min-h-[58px] flex-1 grid-cols-[minmax(0,1.2fr)_minmax(145px,.8fr)] gap-2.5">
        <div className="flex min-w-0 items-center gap-3 rounded-xl border border-info/15 bg-info-soft/65 px-3 py-2 text-info"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-panel"><Activity size={17} /></span><div className="min-w-0"><strong className="block text-[clamp(10px,.72vw,13px)]">结合天气的休息建议</strong><p className="mt-1 text-[clamp(10px,.72vw,13px)] leading-[1.55]">{weatherHealthAdvice(forecast)}</p></div></div>
        <div className="flex min-w-0 items-center gap-3 rounded-xl border border-edge bg-panel-muted px-3 py-2"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-panel text-accent"><SunMedium size={17} /></span><div className="min-w-0"><span className="block text-[clamp(9px,.65vw,11px)] text-muted">今日环境范围</span><strong className="mt-1 block text-[clamp(13px,1vw,17px)]">{Math.round(today?.temperatureMin ?? 0)}–{Math.round(today?.temperatureMax ?? 0)}°</strong><small className="mt-0.5 block truncate text-[clamp(8px,.6vw,11px)] text-muted">降水 {today?.precipitationProbability.toFixed(0) ?? 0}% · UV 峰值 {today?.uvIndexMax.toFixed(1) ?? "0.0"}</small></div></div>
      </div>

      <div className="grid h-[clamp(82px,13vh,104px)] shrink-0 grid-cols-5 overflow-hidden rounded-xl border border-edge bg-panel-muted/70">
        {forecast.daily.map((day, index) => (
          <div key={day.date} className="grid min-w-0 place-content-center justify-items-center gap-1 border-r border-edge px-1 text-center last:border-r-0">
            <span className="text-[clamp(9px,.65vw,11px)] font-bold text-muted">{index === 0 ? "今天" : new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(new Date(`${day.date}T12:00:00`))}</span>
            <span className="text-info"><WeatherGlyph code={day.weatherCode} size={17} /></span>
            <strong className="text-[clamp(10px,.78vw,13px)]">{Math.round(day.temperatureMax)}° <span className="font-normal text-muted">{Math.round(day.temperatureMin)}°</span></strong>
            <small className="truncate text-[clamp(8px,.58vw,10px)] text-info">雨 {day.precipitationProbability.toFixed(0)}% · UV {day.uvIndexMax.toFixed(1)}</small>
          </div>
        ))}
      </div>

      <footer className="flex h-4 shrink-0 items-center justify-between gap-3 text-[clamp(8px,.56vw,10px)] text-muted"><span className="truncate">模型预报仅供生活参考，不参与医疗判断或自动修改提醒。</span><a className="shrink-0 font-bold text-accent hover:underline" href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo · CC BY 4.0</a></footer>
    </div>
  );
}

function WeatherMetric({ icon: Icon, label, value }: { icon: typeof Droplets; label: string; value: string }) {
  return <div className="min-w-0 rounded-xl border border-edge bg-panel px-2.5 py-2.5"><Icon size={15} className="text-accent" /><span className="mt-1.5 block truncate text-[clamp(9px,.68vw,12px)] text-muted">{label}</span><strong className="mt-0.5 block truncate text-[clamp(11px,.88vw,15px)]">{value}</strong></div>;
}
