import { getI18n } from "@/lib/i18n/server";

export default async function Loading() {
  const { t } = await getI18n();
  return (
    <div role="status" aria-label={t("Loading administration…")} className="space-y-6">
      <span className="sr-only">{t("Loading administration…")}</span>
      <div
        aria-hidden="true"
        className="h-9 w-56 max-w-full animate-pulse rounded-lg bg-muted motion-reduce:animate-none"
      />
      <div aria-hidden="true" className="divide-y overflow-hidden rounded-xl border bg-card">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="flex min-h-20 items-center justify-between gap-5 p-5">
            <div className="space-y-3">
              <div className="h-4 w-36 animate-pulse rounded bg-muted motion-reduce:animate-none" />
              <div className="h-3 w-24 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            </div>
            <div className="h-7 w-16 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          </div>
        ))}
      </div>
    </div>
  );
}
