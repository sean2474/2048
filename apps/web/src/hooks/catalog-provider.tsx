"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { CatalogSchema, type CatalogAchievement, type ContentCatalog } from "schema/catalog";
import { SKINS } from "schema/loadout";
import { PROFILE_ICONS } from "schema/profile-icons";
import { useI18n } from "ui/i18n";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

const Context = createContext<ReturnType<typeof useCatalogState> | null>(null);
const EMPTY: ContentCatalog = { skins: [], profileIcons: [], achievements: [] };
const DEFAULT_SKIN = SKINS[0];
const DEFAULT_ICON = PROFILE_ICONS[0];

function useCatalogState(initialCatalog: ContentCatalog | null | undefined, initialCatalogError: boolean) {
  const { locale } = useI18n();
  const pathname = usePathname();
  const [data, setData] = useState<ContentCatalog>(initialCatalog ?? EMPTY);
  const [loading, setLoading] = useState(initialCatalog === undefined);
  const [error, setError] = useState(initialCatalogError);
  const lastLoaded = useRef(initialCatalog === undefined ? 0 : Date.now());
  const pending = useRef(false);
  const active = useRef(true);
  const reload = useCallback(async (force = true) => {
    if (pending.current || !force && Date.now() - lastLoaded.current < 60_000) return;
    pending.current = true; setLoading(true);
    try {
      const response = await createClient().rpc("content_catalog", {}, { get: true });
      const parsed = CatalogSchema.safeParse(response.data);
      if (response.error || !parsed.success) throw new Error("Catalog unavailable");
      if (active.current) { setData(parsed.data); setError(false); lastLoaded.current = Date.now(); }
    } catch {
      if (active.current) setError(true);
    } finally { pending.current = false; if (active.current) setLoading(false); }
  }, []);
  useEffect(() => {
    active.current = true;
    const refresh = () => { if (document.visibilityState === "visible") void reload(false); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { active.current = false; window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [reload]);
  useEffect(() => {
    if (initialCatalog !== undefined) { setData(initialCatalog ?? EMPTY); setError(initialCatalogError); setLoading(false); lastLoaded.current = Date.now(); }
  }, [initialCatalog, initialCatalogError]);
  useEffect(() => { void reload(false); }, [pathname, reload]);
  const catalog = useMemo(() => {
    const localize = <T extends { name: string; nameKo?: string; description: string; descriptionKo?: string }>(item: T): T => ({ ...item,
      name: locale === "ko" ? item.nameKo ?? item.name : item.name,
      description: locale === "ko" ? item.descriptionKo ?? item.description : item.description,
    });
    return { skins: data.skins.filter(item => item.status !== "draft").map(localize), profileIcons: data.profileIcons.filter(item => item.status !== "draft").map(localize), achievements: data.achievements.filter(item => item.status !== "draft").map(localize) };
  }, [data, locale]);
  return { ...catalog, loading, error, reload,
    skin: (id: string) => catalog.skins.find(item => item.id === id) ?? DEFAULT_SKIN,
    icon: (id: string) => catalog.profileIcons.find(item => item.id === id) ?? DEFAULT_ICON,
    achievementForItem: (kind: "skin" | "icon", id: string, unlockedIds: readonly string[] = []): CatalogAchievement | undefined => {
      const matches = catalog.achievements.filter(({ reward }) => kind === "skin" ? "skinId" in reward && reward.skinId === id : "iconId" in reward && reward.iconId === id);
      return matches.find(item => item.status === "published") ?? matches.find(item => unlockedIds.includes(item.id));
    },
  };
}

export function CatalogProvider({ children, initialCatalog, initialCatalogError = false }: { children: ReactNode; initialCatalog?: ContentCatalog | null; initialCatalogError?: boolean }) {
  return <Context.Provider value={useCatalogState(initialCatalog, initialCatalogError)}>{children}</Context.Provider>;
}
export function useCatalog() {
  const value = useContext(Context);
  if (!value) throw new Error("CatalogProvider is required");
  return value;
}
export function CatalogNotice() {
  const { loading, error, reload } = useCatalog();
  const { t } = useI18n();
  if (error) return <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border p-4 text-sm"><p>{t("Could not load the collection. Your purchases are safe.")}</p><Button variant="outline" onClick={() => void reload()}>{t("Reload collection")}</Button></div>;
  return loading ? <p role="status" className="text-sm text-muted-foreground">{t("Loading collection…")}</p> : null;
}
