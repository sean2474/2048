import { CatalogIdSchema, type ContentCatalog } from "schema/catalog";
import { SKIN_RARITIES, type SkinRarity } from "schema/loadout";
import type { Locale } from "ui/locale";

export type CosmeticKind = "skin" | "icon";
export type CosmeticState = { balance: number; purchases: { kind: CosmeticKind; item_id: string }[] };
export type CollectionOwnership = { userId?: string; purchases: CosmeticState["purchases"]; unlockedIds: string[] };
export type CollectionQuery = { category: CosmeticKind; rarity: SkinRarity | "all"; page: number; ownedOnly: boolean };
export type CollectionItem = (ContentCatalog["skins"][number] & { kind: "skin" }) | (ContentCatalog["profileIcons"][number] & { kind: "icon" });
export type CollectionSearch = Record<string, string | string[] | undefined>;
export const COLLECTION_PAGE_SIZE = 12;

export function collectionQuery(params: CollectionSearch): CollectionQuery {
  const page = typeof params.page === "string" && /^\d+$/.test(params.page) ? Number(params.page) : 1;
  return { category: params.category === "icon" ? "icon" : "skin", rarity: typeof params.rarity === "string" && Object.hasOwn(SKIN_RARITIES, params.rarity) ? params.rarity as SkinRarity : "all", page: Number.isSafeInteger(page) && page > 0 ? page - 1 : 0, ownedOnly: params.owned === "1" };
}

export function collectionHref(path: "/shop" | "/loadout", query: CollectionQuery, patch: Partial<CollectionQuery> = {}) {
  const next = { ...query, ...patch }, params = new URLSearchParams();
  if (next.category !== "skin") params.set("category", next.category);
  if (next.rarity !== "all") params.set("rarity", next.rarity);
  if (next.ownedOnly) params.set("owned", "1");
  if (next.page > 0) params.set("page", String(next.page + 1));
  return `${path}${params.size ? `?${params}` : ""}`;
}

export function isCosmeticState(value: unknown): value is CosmeticState {
  if (!value || typeof value !== "object" || !("balance" in value) || !("purchases" in value)) return false;
  return typeof value.balance === "number" && Number.isSafeInteger(value.balance) && value.balance >= 0 && Array.isArray(value.purchases)
    && value.purchases.every(item => item && (item.kind === "skin" || item.kind === "icon") && typeof item.item_id === "string" && CatalogIdSchema.safeParse(item.item_id).success);
}

export function ownsCosmetic(catalog: ContentCatalog, ownership: CollectionOwnership, kind: CosmeticKind, id: string): boolean {
  if (!ownership.userId) return kind === "skin" ? id === "classic" : id === "guest";
  const item = (kind === "skin" ? catalog.skins : catalog.profileIcons).find(item => item.id === id);
  return Boolean(item?.acquisition === "free" && item.publishedOnce
    || ownership.purchases.some(item => item.kind === kind && item.item_id === id)
    || catalog.achievements.some(item => ownership.unlockedIds.includes(item.id) && (kind === "skin" ? "skinId" in item.reward && item.reward.skinId === id : "iconId" in item.reward && item.reward.iconId === id)));
}

export function visibleCollection(catalog: ContentCatalog, ownership: CollectionOwnership, mode: "shop" | "loadout", query: CollectionQuery, selectedId?: string): CollectionItem[] {
  const items: CollectionItem[] = query.category === "skin" ? catalog.skins.map(item => ({ ...item, kind: "skin" })) : catalog.profileIcons.map(item => ({ ...item, kind: "icon" }));
  return items.filter(item => item.status !== "draft" && (mode === "shop" ? item.status === "published" && item.acquisition !== "achievement" : item.status === "published" || item.id === selectedId || ownsCosmetic(catalog, ownership, item.kind, item.id))
    && (item.kind === "icon" || query.rarity === "all" || item.rarity === query.rarity)
    && (!query.ownedOnly || ownsCosmetic(catalog, ownership, item.kind, item.id)));
}

export function localizeCatalog(catalog: ContentCatalog, locale: Locale): ContentCatalog {
  const localize = <T extends { name: string; nameKo?: string; description: string; descriptionKo?: string }>(item: T): T => ({ ...item, name: locale === "ko" ? item.nameKo ?? item.name : item.name, description: locale === "ko" ? item.descriptionKo ?? item.description : item.description });
  return { skins: catalog.skins.map(localize), profileIcons: catalog.profileIcons.map(localize), achievements: catalog.achievements.map(localize) };
}

export function purchaseInput(value: unknown): { kind: CosmeticKind; id: string; expectedPrice: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if ((input.kind !== "skin" && input.kind !== "icon") || !CatalogIdSchema.safeParse(input.id).success || typeof input.expectedPrice !== "number" || !Number.isSafeInteger(input.expectedPrice) || input.expectedPrice <= 0 || input.expectedPrice > 1_000_000_000) return null;
  return { kind: input.kind, id: input.id as string, expectedPrice: input.expectedPrice };
}
