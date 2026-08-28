import type { Language } from './i18n'

/**
 * 双语消息的键值单一来源。
 *
 * 每条消息在定义处同时给出 zh 与 en 文案,由 TypeScript 强制成对维护;
 * 不存在独立的映射表或短语替换管线,`zh` 即界面中文原文。
 */
export interface MessagePair {
  zh: string
  en: string
}

export function defineMessages<const T extends Record<string, MessagePair>>(messages: T): T {
  return messages
}

/** 按语言取一条消息文案。 */
export function messageText(pair: MessagePair, language: Language): string {
  return language === 'en-US' ? pair.en : pair.zh
}

/** 把一组消息全部按语言展开,组件内以 `messages.xxx` 直接使用。 */
export function localizeMessages<T extends Record<string, MessagePair>>(
  messages: T,
  language: Language
): { [K in keyof T]: string } {
  return Object.fromEntries(
    Object.entries(messages).map(([key, pair]) => [key, messageText(pair, language)])
  ) as { [K in keyof T]: string }
}

/** 把模板中的 `{name}` 占位符替换为参数值,用于含数字/时间的组合文案。 */
export function formatMessage(
  template: string,
  params: Record<string, string | number>
): string {
  return Object.entries(params).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template
  )
}
