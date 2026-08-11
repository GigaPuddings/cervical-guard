import { isTauri } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { getWeatherForecast, loadPreferredWeatherLocation, WEATHER_PREFERENCE_EVENT } from "./repository";
import { toWeatherSummary } from "./presentation";
import type { WeatherForecast, WeatherLocation } from "./types";

function reasonMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "天气暂时无法加载";
}

export async function publishWeatherToReminderIsland(forecast: WeatherForecast | null): Promise<void> {
  if (!isTauri()) return;
  try {
    await emitTo("reminder-island", "weather://summary", forecast ? toWeatherSummary(forecast) : null);
  } catch {
    // 灵动岛天气属于增强信息，事件窗口尚未就绪时不影响主流程。
  }
}

export interface PrimaryWeatherState {
  location: WeatherLocation | null;
  forecast: WeatherForecast | null;
  loading: boolean;
  error: string | null;
  refresh: (force?: boolean) => Promise<void>;
}

export function usePrimaryWeather(): PrimaryWeatherState {
  const [location, setLocation] = useState<WeatherLocation | null>(loadPreferredWeatherLocation);
  const [forecast, setForecast] = useState<WeatherForecast | null>(null);
  const [loading, setLoading] = useState(Boolean(location));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (force = false) => {
    const nextLocation = loadPreferredWeatherLocation();
    setLocation(nextLocation);
    if (!nextLocation) {
      setForecast(null);
      setLoading(false);
      setError(null);
      void publishWeatherToReminderIsland(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await getWeatherForecast(nextLocation, force);
      setForecast(next);
      void publishWeatherToReminderIsland(next);
    } catch (reason) {
      setError(reasonMessage(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onPreferenceChange = () => void refresh();
    window.addEventListener(WEATHER_PREFERENCE_EVENT, onPreferenceChange);
    return () => window.removeEventListener(WEATHER_PREFERENCE_EVENT, onPreferenceChange);
  }, [refresh]);

  return { location, forecast, loading, error, refresh };
}
