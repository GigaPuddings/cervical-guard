import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { UpdateDialog } from './UpdateDialog'
import type { AppUpdater } from './updateTypes'

function latestUpdater(): AppUpdater {
  return {
    stage: 'latest',
    currentVersion: '0.1.14',
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

    expect(html).toContain('complete bilingual copy across app and island')
    expect(html).toContain('问题修复')
    expect(html).not.toContain('联动低头检测开关')
    expect(html).toContain('update-illustration')
    expect(html).not.toContain('正在渲染更新日志')
  })
})
