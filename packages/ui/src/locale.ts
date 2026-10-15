export type Locale = "ko" | "en";
export type Messages = Readonly<Record<string, string>>;
export type Values = Readonly<Record<string, string | number>>;
export const LOCALE_COOKIE = "duo.locale";

export function normalizeLocale(value?: string): Locale {
  return value === "en" ? "en" : "ko";
}

export function translate(locale: Locale, messages: Messages, key: string, values: Values = {}): string {
  const message = locale === "ko" && Object.hasOwn(messages, key) ? messages[key] : key;
  return message.replace(/\{(\w+)\}/g, (placeholder, name: string) => Object.hasOwn(values, name) ? String(values[name]) : placeholder);
}
