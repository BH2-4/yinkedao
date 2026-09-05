/**
 * i18n configuration — locale registry shared by server and client.
 *
 * Supported locales: Simplified Chinese (default), English, Japanese, French.
 * The active locale is persisted in a long-lived cookie so the root layout
 * (server component) and the client provider agree on the first paint —
 * no hydration mismatch, no reload required when switching.
 */

/**
 * 语言注册表（N5 决策：MVP 中文优先，单语种）。
 * 基建保留——未来需要多语言时在 messages/ 补语种文件并扩充 LOCALES。
 */
export const LOCALES = ["zh-CN"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "zh-CN";

export const LOCALE_COOKIE = "sf_locale";

/** Display labels — no flag emojis. */
export const LOCALE_LABELS: Record<Locale, string> = {
  "zh-CN": "中文",
};

/** RFC 5646 language tags for <html lang>. */
export const LOCALE_HTML_TAGS: Record<Locale, string> = {
  "zh-CN": "zh-CN",
};

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" && (LOCALES as readonly string[]).includes(value)
  );
}

/**
 * Map an `Accept-Language` entry to a supported locale（单语种：中文系
 * 一律命中，其余回退默认）。Returns null when nothing matches.
 */
export function localeFromAcceptLanguageEntry(entry: string): Locale | null {
  const tag = entry.split(";")[0]?.trim().toLowerCase();
  if (!tag) return null;
  if (tag.startsWith("zh")) return "zh-CN";
  return null;
}
