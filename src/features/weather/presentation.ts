import { weatherCodeLabel } from './openMeteo'
import type { WeatherForecast, WeatherLocation, WeatherSummary } from './types'

export function locationSubtitle(location: WeatherLocation): string {
  return [location.admin1, location.country].filter((value, index, all) => value && all.indexOf(value) === index).join(' · ')
}

export function formatWeatherUpdatedAt(forecast: WeatherForecast): string {
  const date = new Date(forecast.fetchedAt)
  return Number.isNaN(date.getTime()) ? '更新时间未知' : `${new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(date)} 更新`
}

export function windLevelLabel(speed: number): string {
  if (speed < 1) return '静风'
  if (speed < 12) return '微风'
  if (speed < 20) return '和风'
  if (speed < 29) return '劲风'
  return '强风'
}

export function uvIndexLabel(index: number): string {
  if (index < 3) return '低'
  if (index < 6) return '中等'
  if (index < 8) return '较高'
  if (index < 11) return '很高'
  return '极高'
}

export function weatherHealthAdvice(forecast: WeatherForecast, context: 'overview' | 'break' = 'overview'): string {
  const today = forecast.daily[0]
  const rainProbability = today?.precipitationProbability ?? 0
  const uvIndex = Math.max(forecast.current.uvIndex, today?.uvIndexMax ?? 0)
  if (forecast.current.weatherCode >= 95) return '雷暴天气优先在室内活动，并远离敞开的窗边。'
  if (forecast.current.precipitation > 0 || rainProbability >= 70) return context === 'break' ? '有降水，休息时可在室内走动，避免久坐后立即冒雨外出。' : '有降水，起身活动优先选择室内通道。'
  if (uvIndex >= 8) return context === 'break' ? '紫外线很强，这轮休息在室内放松肩颈更稳妥。' : '紫外线很强，短时外出也要做好遮阳。'
  if (forecast.current.apparentTemperature >= 35) return '体感炎热，起身后先补水，再做轻缓活动。'
  if (forecast.current.apparentTemperature <= 2) return '体感较冷，先活动肩背和脚踝，再考虑到室外走动。'
  if (forecast.current.humidity >= 80) return '湿度偏高，活动强度保持轻缓，及时补水并留意闷热感。'
  if (forecast.current.windSpeed >= 29 || forecast.current.windGusts >= 50) return '风力较强，开窗和外出活动时注意避开强阵风。'
  return context === 'break' ? '天气较平稳，可以走几步、看看远处，让肩颈和眼睛一起放松。' : '天气较平稳，工作间隙适合起身走动几分钟。'
}

export function toWeatherSummary(forecast: WeatherForecast): WeatherSummary {
  return {
    location: forecast.location.name,
    condition: weatherCodeLabel(forecast.current.weatherCode),
    temperature: forecast.current.temperature,
    humidity: forecast.current.humidity,
    uvIndex: forecast.current.uvIndex,
    windSpeed: forecast.current.windSpeed,
    windLevel: windLevelLabel(forecast.current.windSpeed),
    precipitation: forecast.daily[0]?.precipitationSum ?? forecast.current.precipitation,
    weatherCode: forecast.current.weatherCode
  }
}
