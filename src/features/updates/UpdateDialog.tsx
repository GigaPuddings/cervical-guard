import { DownloadCloud, LoaderCircle, RefreshCw, Sparkles, X } from 'lucide-react'
import updateIllustrationUrl from '../../assets/update-illustration.png'
import { copy, type Language } from '../../i18n'
import MarkdownPreview from './MarkdownPreview'
import { shouldShowActualDownloadProgress, shouldShowDeferredUpdateAction, type AppUpdater } from './updateTypes'
import { bundledReleaseNotes } from './releaseNotes'

const preloadedUpdateIllustration = typeof Image === 'undefined' ? null : new Image()
if (preloadedUpdateIllustration) {
  preloadedUpdateIllustration.decoding = 'sync'
  preloadedUpdateIllustration.src = updateIllustrationUrl
  void preloadedUpdateIllustration.decode().catch(() => undefined)
}

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
  const displayVersion = updater.version || updater.currentVersion
  const releaseNotes = updater.updateAvailable ? updater.notes || t.noReleaseNotes : bundledReleaseNotes(updater.currentVersion, language)
  const status =
    updater.stage === 'checking' ? t.checking : updater.stage === 'latest' ? t.latest : updater.stage === 'available' ? t.available(updater.version) : updater.stage === 'downloading' ? (updater.downloadStarted ? t.downloading(updater.progress) : t.preparingDownload) : updater.stage === 'restarting' ? t.restart : updater.stage === 'error' ? `${t.failed}: ${updater.error}` : t.description

  return (
    <div
      className="fixed inset-0 z-100 grid place-items-center bg-panel-strong/40 p-4 backdrop-blur-[6px]"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) updater.close()
      }}
    >
      <section className="flex max-h-[min(720px,calc(100vh-32px))] w-full max-w-190 flex-col overflow-hidden rounded-[18px] border border-edge bg-panel shadow-[0_28px_90px_rgba(24,43,30,.24)]" role="dialog" aria-modal="true" aria-labelledby="update-dialog-title">
        <header className="flex items-start gap-4 px-8 pb-5 pt-7">
          <span className="grid size-13 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <Sparkles size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-[22px] font-black tracking-[-.025em]" id="update-dialog-title">
              {t.title}
            </h2>
            <p className="mb-0 mt-1 text-xs leading-5 text-muted">{status}</p>
          </div>
          <button className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-panel-muted hover:text-foreground" aria-label={t.close} onClick={updater.close}>
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto px-8 pb-6">
          <div className="relative grid min-h-30 overflow-hidden rounded-[14px] border border-edge bg-panel-muted px-6 py-5 sm:grid-cols-[minmax(0,1fr)_26px_minmax(0,1fr)_200px] sm:items-center sm:gap-4">
            <div className="relative z-1">
              <small className="block text-[10px] font-bold text-subtle">{t.currentVersion}</small>
              <strong className="mt-2 block text-lg">v{updater.currentVersion}</strong>
            </div>
            <span className="relative z-1 hidden text-center text-xl text-muted sm:block" aria-hidden="true">→</span>
            <div className="relative z-1 mt-4 sm:mt-0">
              <small className="block text-[10px] font-bold text-subtle">{t.latestVersion}</small>
              <span className="mt-2 flex flex-wrap items-center gap-2">
                <strong className="text-lg text-accent">v{displayVersion}</strong>
                {!updater.updateAvailable && updater.stage === 'latest' && <b className="rounded-full bg-accent px-2.5 py-1 text-[9px] text-inverse">{t.latestBadge}</b>}
              </span>
            </div>
            <img
              className="pointer-events-none absolute -bottom-10 right-0 w-52 object-contain sm:static sm:-my-12 sm:w-56"
              src={updateIllustrationUrl}
              alt=""
              aria-hidden="true"
              decoding="sync"
              fetchPriority="high"
              loading="eager"
            />
            <Sparkles className="pointer-events-none absolute right-5 top-3 text-[#45ba6b]" size={18} strokeWidth={2.2} aria-hidden="true" />
            <Sparkles className="pointer-events-none absolute bottom-5 right-50 text-[#62c982]" size={11} strokeWidth={2.2} aria-hidden="true" />
          </div>

          <div className="mt-5 rounded-[14px] border border-edge bg-panel-muted p-6">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="m-0 text-base font-black">{t.releaseNotes}</h3>
                {published && <time className="text-[9px] text-subtle">{published}</time>}
              </div>
              <div className="max-h-56 overflow-y-auto text-xs leading-6 text-muted">
                <MarkdownPreview markdown={releaseNotes} />
              </div>
            </div>
          </div>

          {updater.stage === 'downloading' && !updater.downloadStarted && (
            <div className="mt-5 flex items-center gap-3 rounded-xl border border-accent/20 bg-accent-soft/45 p-4 text-[10px] font-bold text-accent" role="status" aria-live="polite">
              <LoaderCircle className="animate-spin" size={17} />
              <span>{t.preparingDownload}</span>
            </div>
          )}

          {shouldShowActualDownloadProgress(updater.stage, updater.downloadStarted) && (
            <div className="mt-5 rounded-xl border border-accent/20 bg-accent-soft/45 p-4" role="status" aria-live="polite">
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

        <footer className="flex flex-wrap justify-end gap-3 border-t border-edge bg-panel px-8 py-5">
          {shouldShowDeferredUpdateAction(updater.stage, updater.updateAvailable) && (
            <button className="inline-flex min-h-12 min-w-36 items-center justify-center rounded-xl border border-edge bg-panel px-5 text-xs font-bold text-muted hover:bg-panel-muted" onClick={updater.close}>
              {updater.stage === 'downloading' ? t.backgroundDownload : t.later}
            </button>
          )}
          {updater.updateAvailable && updater.stage !== 'downloading' && updater.stage !== 'restarting' ? (
            <button className="inline-flex min-h-12 min-w-38 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-xs font-bold text-inverse shadow-control hover:bg-accent-strong" onClick={() => void updater.install()}>
              <DownloadCloud size={16} />
              {t.install}
            </button>
          ) : updater.stage !== 'downloading' && updater.stage !== 'restarting' ? (
            <button className="inline-flex min-h-12 min-w-38 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-xs font-bold text-inverse shadow-control hover:bg-accent-strong disabled:opacity-45" disabled={busy} onClick={() => void updater.check(true)}>
              {updater.stage === 'checking' ? <LoaderCircle className="animate-spin" size={16} /> : <RefreshCw size={16} />}
              {updater.stage === 'latest' ? t.recheck : t.check}
            </button>
          ) : null}
          {!updater.updateAvailable && (updater.stage === 'error' || updater.stage === 'idle' || updater.stage === 'latest') && (
            <button className="order-first inline-flex min-h-12 items-center justify-center rounded-xl border border-edge bg-panel px-6 text-xs font-bold text-muted hover:bg-panel-muted" onClick={updater.close}>{t.close}</button>
          )}
        </footer>
      </section>
    </div>
  )
}
