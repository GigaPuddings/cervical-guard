import { weatherCodeLabel } from './openMeteo'
import type { Language } from '../../i18n'
import { defineMessages, messageText } from '../../runtimeI18n'
import type { WeatherForecast, WeatherLocation, WeatherSummary } from './types'

/** Open-Meteo 行政区/国家名是外部数据;这里维护出现频率高的术语词汇表。 */
const geoTermMessages = defineMessages({
  china: { zh: '中国', en: 'China' }
})

export function localizeGeoTerm(value: string, language: Language = 'zh-CN'): string {
  if (value === geoTermMessages.china.zh) return messageText(geoTermMessages.china, language)
  return value
}

export function locationSubtitle(location: WeatherLocation, language: Language = 'zh-CN'): string {
  return [location.admin1, location.country]
    .filter((value, index, all) => value && all.indexOf(value) === index)
    .map(value => localizeGeoTerm(value, language))
    .join(' · ')
}

export function formatWeatherUpdatedAt(forecast: WeatherForecast, language: Language = 'zh-CN'): string {
  const date = new Date(forecast.fetchedAt)
  const unknownLabel = messageText(
    defineMessages({ unknown: { zh: '更新时间未知', en: 'Update time unknown' } }).unknown,
    language
  )
  if (Number.isNaN(date.getTime())) return unknownLabel
  const time = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }).format(date)
  return language === 'en-US' ? `Updated ${time}` : `${time} 更新`
}

const windLevelMessages = defineMessages({
  calm: { zh: '静风', en: 'Calm' },
  light: { zh: '微风', en: 'Light breeze' },
  moderate: { zh: '和风', en: 'Moderate breeze' },
  fresh: { zh: '劲风', en: 'Strong breeze' },
  strong: { zh: '强风', en: 'High wind' }
})

export function windLevelLabel(speed: number, language: Language = 'zh-CN'): string {
  if (speed < 1) return messageText(windLevelMessages.calm, language)
  if (speed < 12) return messageText(windLevelMessages.light, language)
  if (speed < 20) return messageText(windLevelMessages.moderate, language)
  if (speed < 29) return messageText(windLevelMessages.fresh, language)
  return messageText(windLevelMessages.strong, language)
}

const uvIndexMessages = defineMessages({
  low: { zh: '低', en: 'Low' },
  moderate: { zh: '中等', en: 'Moderate' },
  high: { zh: '较高', en: 'High' },
  veryHigh: { zh: '很高', en: 'Very high' },
  extreme: { zh: '极高', en: 'Extreme' }
})

export function uvIndexLabel(index: number, language: Language = 'zh-CN'): string {
  if (index < 3) return messageText(uvIndexMessages.low, language)
  if (index < 6) return messageText(uvIndexMessages.moderate, language)
  if (index < 8) return messageText(uvIndexMessages.high, language)
  if (index < 11) return messageText(uvIndexMessages.veryHigh, language)
  return messageText(uvIndexMessages.extreme, language)
}

export function humidityLevelLabel(humidity: number, language: Language = 'zh-CN'): string {
  if (humidity < 35) return language === 'en-US' ? 'Dry' : '偏干'
  if (humidity < 65) return language === 'en-US' ? 'Comfortable' : '舒适'
  if (humidity < 80) return language === 'en-US' ? 'High' : '偏高'
  return language === 'en-US' ? 'Very high' : '湿度很高'
}

export function cloudCoverLabel(cloudCover: number, language: Language = 'zh-CN'): string {
  if (cloudCover < 20) return language === 'en-US' ? 'Mostly clear' : '晴朗少云'
  if (cloudCover < 50) return language === 'en-US' ? 'Partly cloudy' : '晴间多云'
  if (cloudCover < 80) return language === 'en-US' ? 'Cloudy' : '多云'
  return language === 'en-US' ? 'Overcast' : '阴天'
}

export function precipitationAmountLabel(amount: number, language: Language = 'zh-CN'): string {
  if (amount < 0.1) return language === 'en-US' ? 'No measurable rain' : '无明显降水'
  if (amount < 10) return language === 'en-US' ? 'Light rainfall' : '降水较少'
  if (amount < 25) return language === 'en-US' ? 'Moderate rainfall' : '中等降水'
  if (amount < 50) return language === 'en-US' ? 'Heavy rainfall' : '降水较多'
  return language === 'en-US' ? 'Very heavy rainfall' : '强降水'
}

export function precipitationProbabilityLabel(probability: number, language: Language = 'zh-CN'): string {
  if (probability < 20) return language === 'en-US' ? 'Low' : '较低'
  if (probability < 50) return language === 'en-US' ? 'Possible' : '可能降水'
  if (probability < 80) return language === 'en-US' ? 'High' : '较高'
  return language === 'en-US' ? 'Very high' : '很高'
}

const uvProtectionMessages = defineMessages({
  none: { zh: '无需额外防护', en: 'No extra protection needed' },
  recommended: { zh: '建议防晒', en: 'Sun protection recommended' },
  extra: { zh: '加强防晒', en: 'Extra sun protection' },
  avoid: { zh: '避免暴晒', en: 'Avoid direct sun' }
})

export function uvProtectionLabel(index: number, language: Language = 'zh-CN'): string {
  if (index < 3) return messageText(uvProtectionMessages.none, language)
  if (index < 6) return messageText(uvProtectionMessages.recommended, language)
  if (index < 8) return messageText(uvProtectionMessages.extra, language)
  return messageText(uvProtectionMessages.avoid, language)
}

export interface WeatherActivityGuidance {
  summary: string
  detail: string
  tags: string[]
  activityLabel: string
  thermalLabel: string
  clothing: string
  temperaturePosition: number
  apparentPosition: number
}

function clampPercent(value: number): number {
  return Math.min(96, Math.max(4, value))
}

function temperaturePosition(value: number, minimum: number, maximum: number): number {
  const span = maximum - minimum
  return span <= 0 ? 50 : clampPercent(((value - minimum) / span) * 100)
}

export function weatherActivityGuidance(forecast: WeatherForecast, language: Language = 'zh-CN'): WeatherActivityGuidance {
  const today = forecast.daily[0]
  const minimum = today?.temperatureMin ?? forecast.current.temperature
  const maximum = today?.temperatureMax ?? forecast.current.temperature
  const apparentMaximum = today?.apparentTemperatureMax ?? forecast.current.apparentTemperature
  const rainProbability = today?.precipitationProbability ?? 0
  const precipitation = today?.precipitationSum ?? forecast.current.precipitation
  const uvIndex = Math.max(forecast.current.uvIndex, today?.uvIndexMax ?? 0)
  const temperatureGap = Math.max(0, maximum - minimum)
  const storm = forecast.current.weatherCode >= 95
  const rainy = forecast.current.precipitation > 0 || rainProbability >= 60 || precipitation >= 10
  const hot = apparentMaximum >= 32
  const cold = maximum <= 10

  if (language === 'en-US') {
    let detail = `Today ranges from ${Math.round(minimum)}–${Math.round(maximum)}°C, a swing of about ${Math.round(temperatureGap)}°C.`
    if (storm) detail += ' Stay indoors and away from open windows during thunderstorms.'
    else if (rainy) detail += ` Rain probability is ${Math.round(rainProbability)}%; use an indoor route for movement breaks.`
    else if (uvIndex >= 6) detail += ` Peak UV is ${uvIndex.toFixed(1)}; avoid the strongest sunlight for outdoor activity.`
    else detail += ' Conditions are steady enough for light to moderate activity.'

    let thermalLabel = 'Comfortable feel'
    let clothing = temperatureGap >= 8 ? 'Wear light layers and keep your neck and shoulders warm morning and evening' : 'Wear light, comfortable clothing'
    if (apparentMaximum >= 35) {
      thermalLabel = 'Feels hot'
      clothing = 'Choose light, breathable clothing and keep shaded and hydrated'
    } else if (apparentMaximum >= 28) {
      thermalLabel = 'Feels warm'
      clothing = rainy ? 'Choose breathable clothing and carry rain gear' : 'Choose light, breathable clothing'
    } else if (apparentMaximum <= 5) {
      thermalLabel = 'Feels cold'
      clothing = 'Wear a warm coat and protect your neck and shoulders'
    } else if (apparentMaximum <= 15) {
      thermalLabel = 'Feels cool'
      clothing = rainy ? 'Add a windproof, water-resistant layer and keep your neck warm' : 'Add a light jacket and keep your neck warm'
    } else if (rainy) {
      clothing = 'Choose quick-drying clothing and carry rain gear'
    }

    const tags: string[] = []
    if (storm || rainProbability >= 70 || precipitation >= 25) tags.push('Best option: short indoor walks')
    else if (hot || uvIndex >= 6) tags.push('Best time: 06:00–09:00, 17:00–19:00')
    else if (cold) tags.push('Best time: 10:00–15:00')
    else tags.push('Best time: 09:00–11:00, 16:00–18:00')
    if (rainy) tags.push('Carry rain gear')
    if (hot || forecast.current.humidity >= 70) tags.push('Hydrate before and after activity')
    if (uvIndex >= 3) tags.push(uvIndex >= 8 ? 'Avoid strong sunlight' : 'Use sun protection')
    tags.push('Stretch after activity')

    return {
      summary: weatherHealthAdvice(forecast, 'overview', language),
      detail,
      tags: tags.slice(0, 4),
      activityLabel: storm || rainProbability >= 70 || precipitation >= 25 ? 'Indoor activity recommended' : hot || uvIndex >= 8 ? 'Short outdoor activity' : 'Good for outdoor activity',
      thermalLabel,
      clothing,
      temperaturePosition: temperaturePosition(forecast.current.temperature, minimum, maximum),
      apparentPosition: temperaturePosition(forecast.current.apparentTemperature, minimum, Math.max(maximum, apparentMaximum))
    }
  }

  let detail = `今日温度 ${Math.round(minimum)}–${Math.round(maximum)}°，昼夜温差约 ${Math.round(temperatureGap)}°。`
  if (storm) detail += ' 雷暴期间避免户外活动和靠近敞开窗边。'
  else if (rainy) detail += ` 降水概率 ${Math.round(rainProbability)}%，优先选择室内通道活动。`
  else if (uvIndex >= 6) detail += ` 最高紫外线指数 ${uvIndex.toFixed(1)}，户外活动请避开日照最强时段。`
  else detail += ' 天气较平稳，可安排轻中等强度活动。'

  let thermalLabel = '体感舒适'
  let clothing = temperatureGap >= 8 ? '建议分层穿着，早晚注意颈肩保暖' : '建议穿着轻便舒适衣物'
  if (apparentMaximum >= 35) {
    thermalLabel = '体感炎热'
    clothing = '建议穿着轻薄透气衣物，并注意遮阳补水'
  } else if (apparentMaximum >= 28) {
    thermalLabel = '体感偏热'
    clothing = rainy ? '建议穿着透气衣物并携带雨具' : '建议穿着轻薄透气衣物'
  } else if (apparentMaximum <= 5) {
    thermalLabel = '体感寒冷'
    clothing = '建议穿着保暖外套并保护颈肩'
  } else if (apparentMaximum <= 15) {
    thermalLabel = '体感偏凉'
    clothing = rainy ? '建议增加防风防水外层，注意颈肩保暖' : '建议增加轻薄外套，注意颈肩保暖'
  } else if (rainy) {
    clothing = '建议穿着快干衣物并携带雨具'
  }

  const tags: string[] = []
  if (storm || rainProbability >= 70 || precipitation >= 25) tags.push('最佳活动方式：室内分段走动')
  else if (hot || uvIndex >= 6) tags.push('最佳运动时段：06:00–09:00，17:00–19:00')
  else if (cold) tags.push('最佳运动时段：10:00–15:00')
  else tags.push('最佳运动时段：09:00–11:00，16:00–18:00')
  if (rainy) tags.push('外出携带雨具')
  if (hot || forecast.current.humidity >= 70) tags.push('活动前后注意补水')
  if (uvIndex >= 3) tags.push(uvIndex >= 8 ? '避免强日照' : '外出注意防晒')
  tags.push('运动后拉伸放松')

  return {
    summary: weatherHealthAdvice(forecast, 'overview', language),
    detail,
    tags: tags.slice(0, 4),
    activityLabel: storm || rainProbability >= 70 || precipitation >= 25 ? '建议室内活动' : hot || uvIndex >= 8 ? '适合短时户外活动' : '适合户外活动',
    thermalLabel,
    clothing,
    temperaturePosition: temperaturePosition(forecast.current.temperature, minimum, maximum),
    apparentPosition: temperaturePosition(forecast.current.apparentTemperature, minimum, Math.max(maximum, apparentMaximum))
  }
}

const healthAdviceMessages = defineMessages({
  stormOverview: { zh: '雷暴天气优先在室内活动，并远离敞开的窗边。', en: 'Stay active indoors during thunderstorms and keep away from open windows.' },
  rainBreak: { zh: '有降水，休息时可在室内走动，避免久坐后立即冒雨外出。', en: 'When it is raining, walk indoors during breaks instead of heading straight outside.' },
  rainOverview: { zh: '有降水，起身活动优先选择室内通道。', en: 'When it is raining, choose an indoor route for movement breaks.' },
  uvBreak: { zh: '紫外线很强，这轮休息在室内放松肩颈更稳妥。', en: 'UV is very high; relax your neck and shoulders indoors for this break.' },
  uvOverview: { zh: '紫外线很强，短时外出也要做好遮阳。', en: 'UV is very high; use sun protection even for a short trip outside.' },
  hot: { zh: '体感炎热，起身后先补水，再做轻缓活动。', en: 'It feels hot. Hydrate before starting gentle movement.' },
  cold: { zh: '体感较冷，先活动肩背和脚踝，再考虑到室外走动。', en: 'It feels cold. Warm up your shoulders, back, and ankles before going outside.' },
  humid: { zh: '湿度偏高，活动强度保持轻缓，及时补水并留意闷热感。', en: 'Humidity is high. Keep activity light, hydrate, and watch for stuffiness.' },
  windy: { zh: '风力较强，开窗和外出活动时注意避开强阵风。', en: 'Wind is strong. Avoid gusts when opening windows or moving outdoors.' },
  calmBreak: { zh: '天气较平稳，可以走几步、看看远处，让肩颈和眼睛一起放松。', en: 'Conditions are stable. Walk a little and look into the distance to relax your neck, shoulders, and eyes.' },
  calmOverview: { zh: '天气较平稳，工作间隙适合起身走动几分钟。', en: 'Conditions are stable; a short walk fits well between work sessions.' }
})

export function weatherHealthAdvice(
  forecast: WeatherForecast,
  context: 'overview' | 'break' = 'overview',
  language: Language = 'zh-CN'
): string {
  const today = forecast.daily[0]
  const rainProbability = today?.precipitationProbability ?? 0
  const uvIndex = Math.max(forecast.current.uvIndex, today?.uvIndexMax ?? 0)
  if (forecast.current.weatherCode >= 95) return messageText(healthAdviceMessages.stormOverview, language)
  if (forecast.current.precipitation > 0 || rainProbability >= 70) return messageText(context === 'break' ? healthAdviceMessages.rainBreak : healthAdviceMessages.rainOverview, language)
  if (uvIndex >= 8) return messageText(context === 'break' ? healthAdviceMessages.uvBreak : healthAdviceMessages.uvOverview, language)
  if (forecast.current.apparentTemperature >= 35) return messageText(healthAdviceMessages.hot, language)
  if (forecast.current.apparentTemperature <= 2) return messageText(healthAdviceMessages.cold, language)
  if (forecast.current.humidity >= 80) return messageText(healthAdviceMessages.humid, language)
  if (forecast.current.windSpeed >= 29 || forecast.current.windGusts >= 50) return messageText(healthAdviceMessages.windy, language)
  return messageText(context === 'break' ? healthAdviceMessages.calmBreak : healthAdviceMessages.calmOverview, language)
}

export function toWeatherSummary(forecast: WeatherForecast): WeatherSummary {
  return {
    location: forecast.location.name,
    // 灵动岛页面维护自己的条件词翻译表,因此这里固定输出中文标签。
    condition: weatherCodeLabel(forecast.current.weatherCode, 'zh-CN'),
    temperature: forecast.current.temperature,
    humidity: forecast.current.humidity,
    uvIndex: forecast.current.uvIndex,
    windSpeed: forecast.current.windSpeed,
    windLevel: windLevelLabel(forecast.current.windSpeed, 'zh-CN'),
    precipitation: forecast.daily[0]?.precipitationSum ?? forecast.current.precipitation,
    weatherCode: forecast.current.weatherCode
  }
}
