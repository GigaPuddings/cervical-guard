import { describe, expect, it } from "vitest";
import { outdoorActivityAdvice, rankChineseCityResults, weatherCodeLabel } from "./openMeteo";
import { uvIndexLabel, weatherHealthAdvice, windLevelLabel } from "./presentation";
import type { WeatherForecast } from "./types";

function forecast(overrides: Partial<WeatherForecast["current"]> = {}, rainProbability = 10): WeatherForecast {
  return {
    location: { id: "city:1", name: "北京", admin1: "北京市", country: "中国", latitude: 39.9, longitude: 116.4, timezone: "Asia/Shanghai", source: "search" },
    timezone: "Asia/Shanghai",
    timezoneAbbreviation: "GMT+8",
    current: { time: "2026-08-11T12:00", temperature: 28, apparentTemperature: 30, humidity: 50, precipitation: 0, cloudCover: 20, uvIndex: 4, weatherCode: 1, windSpeed: 8, windGusts: 15, isDay: true, ...overrides },
    daily: [{ date: "2026-08-11", weatherCode: 1, temperatureMax: 31, temperatureMin: 21, apparentTemperatureMax: 33, precipitationProbability: rainProbability, precipitationSum: 0.4, uvIndexMax: 5, sunrise: "2026-08-11T05:20", sunset: "2026-08-11T19:15" }],
    fetchedAt: "2026-08-11T04:00:00.000Z",
    stale: false,
  };
}

describe("WMO weather labels", () => {
  it("maps representative conditions", () => {
    expect(weatherCodeLabel(0)).toBe("晴");
    expect(weatherCodeLabel(63)).toBe("有雨");
    expect(weatherCodeLabel(75)).toBe("有雪");
    expect(weatherCodeLabel(96)).toBe("雷暴");
    expect(weatherCodeLabel(999)).toBe("天气变化中");
  });
});

describe("Chinese city search ranking", () => {
  it("keeps Nanjing city and removes same-name villages", () => {
    const results = rankChineseCityResults([
      { id: 1799962, name: "南京", admin1: "江苏", latitude: 32.06167, longitude: 118.77778, feature_code: "PPLA", population: 9_314_685 },
      { id: 9924292, name: "南京", admin1: "云南", latitude: 23.4071, longitude: 99.7757, feature_code: "PPL", population: null },
      { id: 9931976, name: "南京", admin1: "云南", latitude: 23.7873, longitude: 101.084, feature_code: "PPL", population: null },
    ], "南京");

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ name: "南京", admin1: "江苏", geonameId: 1799962 });
  });
});

describe("weather presentation", () => {
  it("labels UV and wind levels", () => {
    expect(uvIndexLabel(2.9)).toBe("低");
    expect(uvIndexLabel(6)).toBe("较高");
    expect(windLevelLabel(8)).toBe("微风");
  });

  it("turns rain and high UV into health-aware break guidance", () => {
    expect(weatherHealthAdvice(forecast({ precipitation: 0.2 }), "break")).toContain("室内");
    expect(weatherHealthAdvice(forecast({ uvIndex: 9 }, 10), "break")).toContain("紫外线很强");
  });
});

describe("outdoor activity advice", () => {
  it("prioritizes severe conditions and rain", () => {
    expect(outdoorActivityAdvice(forecast({ weatherCode: 95 }))).toContain("雷暴");
    expect(outdoorActivityAdvice(forecast({}, 80))).toContain("室内");
  });

  it("handles heat and normal conditions", () => {
    expect(outdoorActivityAdvice(forecast({ apparentTemperature: 36 }))).toContain("补水");
    expect(outdoorActivityAdvice(forecast())).toContain("走动几分钟");
  });
});
