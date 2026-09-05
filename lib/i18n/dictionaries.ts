import zhCN from "../../messages/zh-CN.json";
import { DEFAULT_LOCALE, type Locale } from "./config";

/**
 * Translation dictionaries（N5：单语种 zh-CN）。
 * JSON is the single source of truth — never inline copy in TSX.
 */

export type Dictionary = typeof zhCN;

export const DICTIONARIES: Record<Locale, Dictionary> = {
  "zh-CN": zhCN as Dictionary,
};

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}

/**
 * Resolve a dot-path key ("errors.api.invalid_input") against a nested
 * dictionary. Returns undefined when the path does not exist.
 */
export function lookup(dictionary: unknown, key: string): unknown {
  let node: unknown = dictionary;
  for (const segment of key.split(".")) {
    if (
      node !== null &&
      typeof node === "object" &&
      segment in (node as Record<string, unknown>)
    ) {
      node = (node as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return node;
}

/**
 * Replace `{name}` placeholders in a template string.
 */
export function interpolate(
  template: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/**
 * Translate `key` in `locale`, interpolating `{var}` placeholders.
 * Falls back to the default locale, then to the key itself — the UI must
 * never render blank because a translation is missing.
 */
export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const primary = lookup(getDictionary(locale), key);
  if (typeof primary === "string") return interpolate(primary, vars);
  const fallback = lookup(getDictionary(DEFAULT_LOCALE), key);
  if (typeof fallback === "string") return interpolate(fallback, vars);
  return key;
}

/**
 * Translate a BUSINESS DATA value (market, style, emotion, evidence level…)
 * for display only. The underlying value is never mutated — engines keep
 * producing stable English tokens; this maps them to locale labels at the
 * UI layer via the `values.*` dictionary section.
 *
 * Lookup candidates cover the token spellings found across the pipeline:
 * "United States" → "united states", "New Beginning" → "new-beginning".
 * Falls back to a title-cased rendering of the raw value.
 */
export function translateValue(locale: Locale, category: string, value: string): string {
  const table = lookup(getDictionary(locale), `values.${category}`);
  if (table && typeof table === "object") {
    const entries = table as Record<string, unknown>;
    const slug = value.toLowerCase().replace(/\s+/g, "-");
    const spaced = value.toLowerCase();
    for (const candidate of [value, spaced, slug]) {
      const hit = entries[candidate];
      if (typeof hit === "string") return hit;
    }
  }
  return value.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Translate an API error `code` ("invalid_input", "timeout", …) for display.
 * Falls back to the server-provided English message rather than a raw key,
 * so unknown codes degrade gracefully.
 */
export function translateApiError(
  locale: Locale,
  code: string | undefined,
  fallback: string,
): string {
  if (!code) return fallback;
  const hit = lookup(getDictionary(locale), `errors.api.${code}`);
  return typeof hit === "string" ? hit : fallback;
}
