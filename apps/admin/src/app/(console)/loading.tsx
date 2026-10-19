import { getI18n } from "@/lib/i18n/server";

// Keep the sidebar visible without showing overview cards on unrelated console routes.
export default async function Loading() {
  const { t } = await getI18n();
  return <div role="status" aria-label={t("Loading administration…")}>
    <span className="sr-only">{t("Loading administration…")}</span>
    <div aria-hidden="true" className="h-1 w-24 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
  </div>;
}
