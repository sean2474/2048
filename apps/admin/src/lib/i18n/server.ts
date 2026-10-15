import { cookies } from "next/headers";
import { LOCALE_COOKIE, normalizeLocale, translate, type Values } from "ui/locale";
import { messages } from "./messages";

export async function getI18n() {
  const locale = normalizeLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return { locale, messages, t: (key: string, values?: Values) => translate(locale, messages, key, values) };
}
