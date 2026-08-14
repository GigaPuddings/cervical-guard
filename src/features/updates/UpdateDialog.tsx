import { DownloadCloud, LoaderCircle, RefreshCw, Sparkles, X } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { copy, type Language } from '../../i18n'
import { shouldShowActualDownloadProgress, shouldShowDeferredUpdateAction, type AppUpdater } from './updateTypes'

const MarkdownPreview = lazy(() => import('./MarkdownPreview'))

function formatBytes(value: number, language: Language): string {
  if (value < 1_024) return `${value} B`
  if (value < 1_048_576) return `${(value / 1_024).toFixed(1)} KB`
  return `${(value / 1_048_576).toFixed(1)} MB`
}

export function UpdateDialog({ updater, language }: { updater: AppUpdater; language: Language }) {
  if (!updater.dialogOpen) return null
  const t = copy[language].updater
  const busy = updater.stage === 'checking' || updater.stage === 'downloading' || updater.stage === 'restarting'
  const published = updater.date ? new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(updater.date)) : ''
  const status =
    updater.stage === 'checking' ? t.checking : updater.stage === 'latest' ? t.latest : updater.stage === 'available' ? t.available(updater.version) : updater.stage === 'downloading' ? (updater.downloadStarted ? t.downloading(updater.progress) : t.preparingDownload) : updater.stage === 'restarting' ? t.restart : updater.stage === 'error' ? `${t.failed}: ${updater.error}` : t.description

  return (
    <div
      className="fixed inset-0 z-100 grid place-items-center bg-panel-strong/45 p-4 backdrop-blur-[3px]"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) updater.close()
      }}
    >
      <section className="flex max-h-[min(680px,calc(100vh-32px))] w-full max-w-155 flex-col overflow-hidden rounded-[14px] border border-edge bg-panel shadow-panel" role="dialog" aria-modal="true" aria-labelledby="update-dialog-title">
        <header className="flex items-start gap-4 border-b border-edge px-6 py-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
            <Sparkles size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-lg font-black" id="update-dialog-title">
              {t.title}
            </h2>
            <p className="mb-0 mt-1 text-[11px] leading-5 text-muted">{status}</p>
          </div>
          <button className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-panel-muted hover:text-foreground" aria-label={language === 'en-US' ? 'Close' : '关闭'} onClick={updater.close}>
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto px-6 py-5">
          <div className="grid gap-3 rounded-2xl bg-panel-muted p-4 sm:grid-cols-2">
            <div>
              <small className="block text-[9px] font-bold text-subtle">{t.currentVersion}</small>
              <strong className="mt-1 block text-sm">v{updater.currentVersion}</strong>
            </div>
            <div>
              <small className="block text-[9px] font-bold text-subtle">{t.latestVersion}</small>
              <strong className="mt-1 block text-sm text-accent">{updater.version ? `v${updater.version}` : updater.stage === 'latest' ? `v${updater.currentVersion}` : '—'}</strong>
            </div>
          </div>

          {updater.updateAvailable && (
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="m-0 text-xs font-extrabold">{t.releaseNotes}</h3>
                {published && <time className="text-[9px] text-subtle">{published}</time>}
              </div>
              <div className="max-h-65 overflow-y-auto rounded-xl border border-edge-soft bg-panel-muted px-4 py-3 text-[10px] leading-5 text-muted">
                <Suspense fallback={<p className="my-2 animate-pulse text-subtle">{t.loadingReleaseNotes}</p>}>
                  <MarkdownPreview markdown={updater.notes || t.noReleaseNotes} />
                </Suspense>
              </div>
            </div>
          )}

          {updater.stage === 'downloading' && !updater.downloadStarted && (
            <div className="mt-5 flex items-center gap-3 rounded-2xl border border-accent/20 bg-accent-soft/45 p-4 text-[10px] font-bold text-accent" role="status" aria-live="polite">
              <LoaderCircle className="animate-spin" size={17} />
              <span>{t.preparingDownload}</span>
            </div>
          )}

          {shouldShowActualDownloadProgress(updater.stage, updater.downloadStarted) && (
            <div className="mt-5 rounded-2xl border border-accent/20 bg-accent-soft/45 p-4" role="status" aria-live="polite">
              <div className="flex items-center justify-between text-[10px] font-bold">
                <span>{t.downloadProgress}</span>
                <span>{updater.totalBytes > 0 ? `${formatBytes(updater.downloadedBytes, language)} / ${formatBytes(updater.totalBytes, language)}` : formatBytes(updater.downloadedBytes, language)}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-edge">
                <i className="block h-full rounded-full bg-accent transition-[width]" style={{ width: updater.totalBytes > 0 ? `${updater.progress}%` : '0%' }} />
              </div>
              <p className="mb-0 mt-2 text-right text-[10px] font-extrabold text-accent">{updater.totalBytes > 0 ? `${updater.progress}%` : formatBytes(updater.downloadedBytes, language)}</p>
              <div className="mt-2 text-[9px] text-muted">
                <span>
                  {t.speed}: {updater.bytesPerSecond > 0 ? `${formatBytes(updater.bytesPerSecond, language)}/s` : '—'}
                </span>
              </div>
              <p className="mb-0 mt-2 text-[9px] leading-4 text-subtle">{t.backgroundHint}</p>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap justify-end gap-2 border-t border-edge bg-panel-muted/55 px-6 py-4">
          {shouldShowDeferredUpdateAction(updater.stage, updater.updateAvailable) && (
            <button className="inline-flex min-h-10 items-center justify-center rounded-xl border border-edge bg-panel px-4 text-[11px] font-bold text-muted hover:bg-panel-muted" onClick={updater.close}>
              {updater.stage === 'downloading' ? t.backgroundDownload : t.later}
            </button>
          )}
          {updater.updateAvailable && updater.stage !== 'downloading' && updater.stage !== 'restarting' ? (
            <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-[11px] font-bold text-inverse hover:bg-accent-strong" onClick={() => void updater.install()}>
              <DownloadCloud size={16} />
              {t.install}
            </button>
          ) : updater.stage !== 'downloading' && updater.stage !== 'restarting' ? (
            <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-[11px] font-bold text-inverse hover:bg-accent-strong disabled:opacity-45" disabled={busy} onClick={() => void updater.check(true)}>
              {updater.stage === 'checking' ? <LoaderCircle className="animate-spin" size={16} /> : <RefreshCw size={16} />}
              {t.check}
            </button>
          ) : null}
        </footer>
      </section>
    </div>
  )
}
