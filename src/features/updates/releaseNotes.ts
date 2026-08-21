import type { Language } from '../../i18n'

const categoryCopy: Record<Language, Record<string, string>> = {
  'zh-CN': {
    Features: '新增功能',
    Fixes: '问题修复',
    Performance: '性能优化',
    'Other Changes': '其他变更'
  },
  'en-US': {}
}

export function compactGeneratedReleaseNotes(markdown: string, language: Language): string {
  const categories = categoryCopy[language]
  return markdown
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('## Cervical Guard ') && !line.startsWith('_Changes since '))
    .map(line => {
      const category = line.match(/^### (.+)$/)?.[1]
      return category ? `**${categories[category] ?? category}**` : line
    })
    .join('\n\n')
}

export function bundledReleaseNotes(version: string, language: Language): string {
  if (version !== __APP_VERSION__ || !__APP_RELEASE_NOTES__.trim()) {
    return language === 'en-US' ? '- Release notes are unavailable in this build.' : '- 此构建未包含可验证的版本日志。'
  }
  return compactGeneratedReleaseNotes(__APP_RELEASE_NOTES__, language)
}
