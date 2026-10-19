import { getI18n } from "@/lib/i18n/server";

// This boundary covers every route; page-shaped placeholders belong inside each page.
export default async function Loading() {
  const { t } = await getI18n();
  return <div role="status" aria-label={t("Loading selection…")} className="mx-auto max-w-[1040px] px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
    <span className="sr-only">{t("Loading selection…")}</span>
    <div aria-hidden="true" className="h-1 w-24 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
  </div>;
}
