import { copy, type Language } from '../i18n'

export function Brand({ compact = false, language = 'zh-CN' }: { compact?: boolean; language?: Language }) {
  const t = copy[language]
  return (
    <div className="inline-flex items-center gap-3" aria-label={t.appName}>
      <img aria-hidden="true" src="/favicon.svg" className="size-11 rounded-[14px] shadow-control" />
      {!compact && (
        <span className="flex flex-col leading-none">
          <strong className="text-[18px] tracking-wide">{t.appName}</strong>
          <small className="mt-1.5 text-[10px] tracking-[.06em] text-muted">{t.appSubtitle}</small>
        </span>
      )}
    </div>
  )
}
