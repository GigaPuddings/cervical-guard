import { describe, expect, it, vi } from 'vitest'
import { cityHeroApiUrl, fetchCityHeroImage } from './cityHero'
import type { WeatherLocation } from './types'

const beijing: WeatherLocation = {
  id: 'city:test-beijing',
  name: '北京',
  admin1: '北京市',
  country: '中国',
  latitude: 39.9,
  longitude: 116.4,
  timezone: 'Asia/Shanghai',
  source: 'search'
}

describe('city weather hero image', () => {
  it('queries the selected city and its municipality title for a freely licensed page image', () => {
    const url = new URL(cityHeroApiUrl(beijing))
    expect(url.origin).toBe('https://zh.wikipedia.org')
    expect(url.searchParams.get('titles')).toBe('北京|北京市')
    expect(url.searchParams.get('pilicense')).toBe('free')
    expect(url.searchParams.get('pithumbsize')).toBe('1600')
  })

  it('returns the selected city image and attribution link', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      query: {
        pages: [{
          pageid: 123,
          title: '北京市',
          thumbnail: { source: 'https://upload.wikimedia.org/beijing.jpg', width: 1600, height: 1067 }
        }]
      }
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const image = await fetchCityHeroImage(beijing)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(image).toMatchObject({
      src: 'https://upload.wikimedia.org/beijing.jpg',
      alt: '北京城市景观',
      sourceLabel: '图片：维基百科'
    })
    expect(image?.sourceUrl).toContain('%E5%8C%97%E4%BA%AC%E5%B8%82')
    vi.unstubAllGlobals()
  })
})
