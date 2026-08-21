import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { UpdateDialog } from './UpdateDialog'
import { bundledReleaseNotes } from './releaseNotes'
import type { AppUpdater } from './updateTypes'

function plainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(?:x27|39);/g, "'")
    .replace(/[*_`#>-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function latestUpdater(): AppUpdater {
  return {
    stage: 'latest',
    currentVersion: __APP_VERSION__,
    version: '',
    notes: '',
    date: '',
    progress: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    bytesPerSecond: 0,
    downloadStarted: false,
    error: '',
    dialogOpen: true,
    updateAvailable: false,
    open: vi.fn(),
    close: vi.fn(),
    check: vi.fn(async () => undefined),
    install: vi.fn(async () => undefined)
  }
}

describe('native-ready update dialog', () => {
  it('renders Git-generated current-version notes and the packaged illustration without an async placeholder', () => {
    const html = renderToStaticMarkup(<UpdateDialog updater={latestUpdater()} language="zh-CN" />)
    const expectedNotes = bundledReleaseNotes(__APP_VERSION__, 'zh-CN')

    expect(plainText(html)).toContain(plainText(expectedNotes))
    expect(html).not.toContain('此构建未包含可验证的版本日志')
    expect(html).toContain('update-illustration')
    expect(html).not.toContain('正在渲染更新日志')
  })
})
