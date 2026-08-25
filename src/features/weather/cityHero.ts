import { useEffect, useState } from 'react'
import { z } from 'zod'
import shanghaiHero from '../../assets/shanghai-weather-hero.png'
import type { WeatherLocation } from './types'

const CITY_IMAGE_ENDPOINT = 'https://zh.wikipedia.org/w/api.php'

const pageImagesResponseSchema = z.object({
  query: z.object({
    pages: z.array(z.object({
      pageid: z.number().optional(),
      title: z.string(),
      thumbnail: z.object({
        source: z.string().url(),
        width: z.number(),
        height: z.number()
      }).optional()
    }))
  }).optional()
})

export interface CityHeroImage {
  src: string
  alt: string
  sourceLabel: string | null
  sourceUrl: string | null
}

const imageCache = new Map<string, CityHeroImage | null>()
const inFlight = new Map<string, Promise<CityHeroImage | null>>()

function bundledCityHero(location: WeatherLocation): CityHeroImage | null {
  if (location.name !== '上海') return null
  return {
    src: shanghaiHero,
    alt: '上海浦东城市天际线',
    sourceLabel: null,
    sourceUrl: null
  }
}

export function cityHeroApiUrl(location: WeatherLocation): string {
  const cityTitle = location.name.endsWith('市') ? location.name : `${location.name}市`
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    origin: '*',
    redirects: '1',
    prop: 'pageimages',
    piprop: 'thumbnail|name',
    pithumbsize: '1600',
    pilicense: 'free',
    titles: `${location.name}|${cityTitle}`
  })
  return `${CITY_IMAGE_ENDPOINT}?${params.toString()}`
}

export async function fetchCityHeroImage(location: WeatherLocation, signal?: AbortSignal): Promise<CityHeroImage | null> {
  const bundled = bundledCityHero(location)
  if (bundled) return bundled
  if (imageCache.has(location.id)) return imageCache.get(location.id) ?? null
  const existing = inFlight.get(location.id)
  if (existing) return existing

  const request = fetch(cityHeroApiUrl(location), signal ? { signal } : undefined)
    .then(async response => {
      if (!response.ok) throw new Error(`城市图片请求失败：${response.status}`)
      const parsed = pageImagesResponseSchema.parse(await response.json())
      const normalizedName = location.name.replace(/市$/u, '')
      const pages = parsed.query?.pages ?? []
      const page = pages.find(item => item.thumbnail && item.title.replace(/市$/u, '').includes(normalizedName))
        ?? pages.find(item => item.thumbnail)
      if (!page?.thumbnail) return null
      return {
        src: page.thumbnail.source,
        alt: `${location.name}城市景观`,
        sourceLabel: '图片：维基百科',
        sourceUrl: `https://zh.wikipedia.org/wiki/${encodeURIComponent(page.title.replaceAll(' ', '_'))}`
      }
    })
    .then(image => {
      imageCache.set(location.id, image)
      return image
    })
    .finally(() => {
      if (inFlight.get(location.id) === request) inFlight.delete(location.id)
    })

  inFlight.set(location.id, request)
  return request
}

export function useCityHeroImage(location: WeatherLocation): CityHeroImage | null {
  const [image, setImage] = useState<CityHeroImage | null>(() => bundledCityHero(location))

  useEffect(() => {
    const bundled = bundledCityHero(location)
    setImage(bundled)
    if (bundled) return

    let active = true
    void fetchCityHeroImage(location)
      .then(next => { if (active) setImage(next) })
      .catch(() => { if (active) setImage(null) })
    return () => { active = false }
  }, [location])

  return image
}
