"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "ui/i18n";
import { normalizeLocale } from "ui/locale";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const router = useRouter();
  return (
    <select
      aria-label={t("Language")}
      value={locale}
      onChange={(event) => {
        setLocale(normalizeLocale(event.target.value));
        router.refresh();
      }}
      className="admin-field shrink-0 px-2 text-xs font-semibold"
    >
      <option value="ko">한국어</option>
      <option value="en">English</option>
    </select>
  );
}
