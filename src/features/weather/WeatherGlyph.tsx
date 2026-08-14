import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSun, Snowflake, Sun } from 'lucide-react'

export function WeatherGlyph({ code, size = 22, className }: { code: number; size?: number; className?: string }) {
  if (code === 0 || code === 1) return <Sun size={size} className={className} />
  if (code === 2) return <CloudSun size={size} className={className} />
  if (code === 3) return <Cloud size={size} className={className} />
  if (code === 45 || code === 48) return <CloudFog size={size} className={className} />
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return <CloudRain size={size} className={className} />
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return <Snowflake size={size} className={className} />
  if (code >= 95) return <CloudLightning size={size} className={className} />
  return <CloudSun size={size} className={className} />
}
