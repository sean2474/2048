import { CatalogSchema, type ContentCatalog } from "schema/catalog";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { CatalogEditor } from "@/components/catalog-editor";
export default async function CatalogPage() {
  const [{ t }, client] = await Promise.all([getI18n(), createClient()]);
  let catalog: ContentCatalog | null = null;
  try {
    const result = await client.rpc("admin_content_catalog");
    if (result.error) throw result.error;
    catalog = CatalogSchema.parse(result.data);
  } catch { /* The editor keeps draft controls disabled until a retry succeeds. */ }
  return <section className="space-y-6" aria-labelledby="catalog-title"><div><p className="admin-eyebrow mb-2">{t("Game content")}</p><h1 id="catalog-title" className="admin-title">{t("Content catalog")}</h1></div><p className="max-w-3xl text-sm leading-6 text-muted-foreground">{t("Create drafts, preview them, then publish. Archived items remain available to players who already own them.")}</p><CatalogEditor initialCatalog={catalog} /></section>;
}
