import { z } from "zod";
import type { CitySearchResult, DailyWeather, WeatherForecast, WeatherLocation } from "./types";

const FORECAST_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const GEOCODING_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";
const REQUEST_TIMEOUT_MS = 8_000;

const geocodingSchema = z.object({
  results: z.array(z.object({
    id: z.number(),
    name: z.string(),
    latitude: z.number(),
    longitude: z.number(),
    timezone: z.string().optional(),
    country: z.string().optional(),
    country_code: z.string().optional(),
    admin1: z.string().optional(),
    admin2: z.string().optional(),
    feature_code: z.string().optional(),
    population: z.number().nullable().optional(),
  })).optional(),
});

const forecastResponseSchema = z.object({
  timezone: z.string(),
  timezone_abbreviation: z.string().default(""),
  current: z.object({
    time: z.string(),
    temperature_2m: z.number(),
    apparent_temperature: z.number(),
    relative_humidity_2m: z.number(),
    precipitation: z.number(),
    cloud_cover: z.number(),
    uv_index: z.number(),
    weather_code: z.number(),
    wind_speed_10m: z.number(),
    wind_gusts_10m: z.number(),
    is_day: z.number(),
  }),
  daily: z.object({
    time: z.array(z.string()),
    weather_code: z.array(z.number()),
    temperature_2m_max: z.array(z.number()),
    temperature_2m_min: z.array(z.number()),
    apparent_temperature_max: z.array(z.number()),
    precipitation_probability_max: z.array(z.number()),
    precipitation_sum: z.array(z.number()),
    uv_index_max: z.array(z.number()),
    sunrise: z.array(z.string()),
    sunset: z.array(z.string()),
  }),
});

async function requestJson(url: URL, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener("abort", abortFromCaller, { once: true });
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
    if (!response.ok) throw new Error(`天气服务暂不可用（HTTP ${response.status}）`);
    return await response.json();
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === "AbortError") {
      if (signal?.aborted) throw reason;
      throw new Error("天气服务响应超时，请稍后重试", { cause: reason });
    }
    if (reason instanceof Error && reason.message.startsWith("天气服务暂不可用")) throw reason;
    if (reason instanceof SyntaxError) throw new Error("天气服务返回了无法识别的数据", { cause: reason });
    throw new Error("天气服务连接失败，请检查网络后重试", { cause: reason });
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

export async function searchChineseCities(query: string, signal?: AbortSignal): Promise<CitySearchResult[]> {
  const keyword = query.trim();
  if (keyword.length < 2) return [];
  const url = new URL(GEOCODING_ENDPOINT);
  url.search = new URLSearchParams({
    name: keyword,
    count: "12",
    language: "zh",
    format: "json",
    countryCode: "CN",
  }).toString();
  const parsed = geocodingSchema.parse(await requestJson(url, signal));
  return rankChineseCityResults(parsed.results ?? [], keyword);
}

type GeocodingCandidate = NonNullable<z.infer<typeof geocodingSchema>["results"]>[number];

const ADMINISTRATIVE_CENTER_CODES = new Set(["PPLC", "PPLA", "PPLA2", "PPLA3", "PPLA4"]);

function normalizedCityName(value: string): string {
  return value.trim().replace(/[市县区旗]$/u, "").toLocaleLowerCase("zh-CN");
}

/**
 * Open-Meteo 的地名检索会同时返回城市、村镇和自然地名。产品入口明确是
 * “选择城市”，因此只保留行政中心或有明确城市规模的人口聚居地，并优先
 * 精确名称、行政级别和人口。这样“南京”不会混入云南的同名村落。
 */
export function rankChineseCityResults(items: GeocodingCandidate[], query: string): CitySearchResult[] {
  const normalizedQuery = normalizedCityName(query);
  const ranked = items
    .filter((item) => ADMINISTRATIVE_CENTER_CODES.has(item.feature_code ?? "") || (item.population ?? 0) >= 50_000)
    .map((item) => {
      const featureWeight = item.feature_code === "PPLC"
        ? 5
        : item.feature_code === "PPLA"
          ? 4
          : item.feature_code === "PPLA2"
            ? 3
            : item.feature_code === "PPLA3"
              ? 2
              : 1;
      const exactWeight = normalizedCityName(item.name) === normalizedQuery ? 1 : 0;
      return {
        score: exactWeight * 1_000_000_000 + featureWeight * 100_000_000 + (item.population ?? 0),
        value: {
          id: `city:${item.id}`,
          geonameId: item.id,
          name: item.name,
          admin1: item.admin1 ?? "",
          country: item.country ?? item.country_code ?? "中国",
          latitude: item.latitude,
          longitude: item.longitude,
          timezone: item.timezone ?? "Asia/Shanghai",
          source: "search" as const,
        },
      };
    })
    .sort((left, right) => right.score - left.score);

  const seen = new Set<string>();
  const results: CitySearchResult[] = [];
  for (const item of ranked) {
    const key = `${normalizedCityName(item.value.name)}:${item.value.admin1}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(item.value);
    if (results.length === 6) break;
  }
  return results;
}

export async function fetchOpenMeteoForecast(location: WeatherLocation, signal?: AbortSignal): Promise<WeatherForecast> {
  const url = new URL(FORECAST_ENDPOINT);
  url.search = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: [
      "temperature_2m",
      "apparent_temperature",
      "relative_humidity_2m",
      "precipitation",
      "cloud_cover",
      "uv_index",
      "weather_code",
      "wind_speed_10m",
      "wind_gusts_10m",
      "is_day",
    ].join(","),
    daily: [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "apparent_temperature_max",
      "precipitation_probability_max",
      "precipitation_sum",
      "uv_index_max",
      "sunrise",
      "sunset",
    ].join(","),
    timezone: "auto",
    forecast_days: "5",
  }).toString();
  const parsed = forecastResponseSchema.parse(await requestJson(url, signal));
  const length = Math.min(
    parsed.daily.time.length,
    parsed.daily.weather_code.length,
    parsed.daily.temperature_2m_max.length,
    parsed.daily.temperature_2m_min.length,
    parsed.daily.apparent_temperature_max.length,
    parsed.daily.precipitation_probability_max.length,
    parsed.daily.precipitation_sum.length,
    parsed.daily.uv_index_max.length,
    parsed.daily.sunrise.length,
    parsed.daily.sunset.length,
  );
  const daily: DailyWeather[] = [];
  for (let index = 0; index < length; index += 1) {
    daily.push({
      date: parsed.daily.time[index]!,
      weatherCode: parsed.daily.weather_code[index]!,
      temperatureMax: parsed.daily.temperature_2m_max[index]!,
      temperatureMin: parsed.daily.temperature_2m_min[index]!,
      apparentTemperatureMax: parsed.daily.apparent_temperature_max[index]!,
      precipitationProbability: parsed.daily.precipitation_probability_max[index]!,
      precipitationSum: parsed.daily.precipitation_sum[index]!,
      uvIndexMax: parsed.daily.uv_index_max[index]!,
      sunrise: parsed.daily.sunrise[index]!,
      sunset: parsed.daily.sunset[index]!,
    });
  }
  if (daily.length === 0) throw new Error("天气服务没有返回逐日预报");
  return {
    location,
    timezone: parsed.timezone,
    timezoneAbbreviation: parsed.timezone_abbreviation,
    current: {
      time: parsed.current.time,
      temperature: parsed.current.temperature_2m,
      apparentTemperature: parsed.current.apparent_temperature,
      humidity: parsed.current.relative_humidity_2m,
      precipitation: parsed.current.precipitation,
      cloudCover: parsed.current.cloud_cover,
      uvIndex: parsed.current.uv_index,
      weatherCode: parsed.current.weather_code,
      windSpeed: parsed.current.wind_speed_10m,
      windGusts: parsed.current.wind_gusts_10m,
      isDay: parsed.current.is_day === 1,
    },
    daily,
    fetchedAt: new Date().toISOString(),
    stale: false,
  };
}

export function weatherCodeLabel(code: number): string {
  if (code === 0) return "晴";
  if (code === 1) return "大部晴朗";
  if (code === 2) return "局部多云";
  if (code === 3) return "阴";
  if (code === 45 || code === 48) return "有雾";
  if (code >= 51 && code <= 57) return "毛毛雨";
  if (code >= 61 && code <= 67) return "有雨";
  if (code >= 71 && code <= 77) return "有雪";
  if (code >= 80 && code <= 82) return "阵雨";
  if (code === 85 || code === 86) return "阵雪";
  if (code === 95 || code === 96 || code === 99) return "雷暴";
  return "天气变化中";
}

export function outdoorActivityAdvice(forecast: WeatherForecast): string {
  const today = forecast.daily[0];
  const rainProbability = today?.precipitationProbability ?? 0;
  if (forecast.current.weatherCode >= 95) return "当前可能有雷暴，休息活动优先安排在室内。";
  if (rainProbability >= 70 || forecast.current.precipitation > 0) return "降水概率较高，起身活动建议优先选择室内。";
  if (forecast.current.apparentTemperature >= 35) return "体感炎热，短暂活动时注意补水，避免暴晒。";
  if (forecast.current.apparentTemperature <= 2) return "体感较冷，外出活动前注意保暖。";
  if (forecast.current.windGusts >= 50) return "阵风较强，开窗或外出活动时请留意安全。";
  return "天气适合短暂起身活动，工作间隙可以走动几分钟。";
}
