import { getI18n } from "@/lib/i18n/server";
export default async function Loading() {
  const { t } = await getI18n();
  return <div role="status" aria-label={t("Loading administration…")} className="space-y-6"><span className="sr-only">{t("Loading administration…")}</span><div aria-hidden="true" className="space-y-6 animate-pulse motion-reduce:animate-none"><div className="h-9 w-56 rounded-lg bg-muted" /><div className="admin-panel h-24 bg-muted/50" /><div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="admin-panel h-28 bg-muted/50" />)}</div><div className="admin-panel h-64 bg-muted/50" /></div></div>;
}
