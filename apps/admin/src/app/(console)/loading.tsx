
import { getI18n } from "@/lib/i18n/server";
export default async function Loading() {
  const { t } = await getI18n();
  return <div role="status" className="admin-state flex items-center gap-3"><span aria-hidden="true" className="size-2 rounded-full bg-primary" />{t("Loading administration…")}</div>;
}
