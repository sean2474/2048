"use client";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { LOCALE_COOKIE, normalizeLocale, translate, type Locale, type Messages, type Values } from "./locale";

type I18n = { locale: Locale; setLocale: (locale: Locale) => void; t: (key: string, values?: Values) => string };
const Context = createContext<I18n | null>(null);

export function I18nProvider({ initialLocale, messages, children }: { initialLocale: Locale; messages: Messages; children: ReactNode }) {
  const [locale, updateLocale] = useState(initialLocale);
  useEffect(() => { updateLocale(initialLocale); }, [initialLocale]);
  const value = useMemo<I18n>(() => ({
    locale,
    setLocale(nextLocale) {
      const next = normalizeLocale(nextLocale);
      document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
      document.documentElement.lang = next;
      updateLocale(next);
    },
    t: (key, values) => translate(locale, messages, key, values),
  }), [locale, messages]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useI18n() {
  const value = useContext(Context);
  if (!value) throw new Error("I18nProvider is required");
  return value;
}
