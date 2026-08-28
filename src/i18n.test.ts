import { describe, expect, it } from 'vitest'
import { copy, languageOf } from './i18n'

describe('language', () => {
  it('falls back to Chinese for unknown values', () => {
    expect(languageOf('en-US')).toBe('en-US')
    expect(languageOf('zh-CN')).toBe('zh-CN')
    expect(languageOf('fr-FR')).toBe('zh-CN')
    expect(languageOf(undefined)).toBe('zh-CN')
  })

  it('keeps onboarding and updater copy for both languages', () => {
    for (const language of ['zh-CN', 'en-US'] as const) {
      expect(copy[language].appName).toBeTruthy()
      expect(copy[language].onboarding.description).toBeTruthy()
      expect(copy[language].updater.available('0.2.0')).toContain('0.2.0')
    }
  })

  it('keeps camera setup copy aligned across languages', () => {
    expect(copy['zh-CN'].camera.unsupported).toContain('摄像头')
    expect(copy['en-US'].camera.unsupported.toLowerCase()).toContain('camera')
  })
})
