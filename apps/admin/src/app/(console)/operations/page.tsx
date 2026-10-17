import { getI18n } from "@/lib/i18n/server";
import { OperationsMonitor } from "@/components/operations-monitor";
export default async function OperationsPage() {
  const { t } = await getI18n();
  return <section className="space-y-6" aria-labelledby="operations-heading"><div><p className="admin-eyebrow mb-2">{t("Game operations")}</p><h1 id="operations-heading" className="admin-title">{t("Operations")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("Read-only live process state. Refreshes every 30 seconds while visible.")}</p></div><OperationsMonitor /></section>;
}
