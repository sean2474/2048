import { SKINS, type SkinId, type SkinRarity } from "./loadout";
import { PROFILE_ICONS, type ProfileIconId } from "./profile-icons";
import { achievementForItem } from "./achievements";

export type CoinTransactionReason = "daily_quest" | "purchase" | "admin_grant" | "admin_deduct";
// English source strings; each app translates them through its own dictionary.
export const COIN_REASON_LABELS: Record<CoinTransactionReason, string> = { daily_quest: "Daily quest reward", purchase: "Shop purchase", admin_grant: "Operator grant", admin_deduct: "Operator deduction" };

export type ShopItem = { kind: "skin"; id: SkinId; price: number } | { kind: "icon"; id: ProfileIconId; price: number };
const skinPrices: Record<SkinRarity, number> = { common: 0, rare: 300, epic: 600, legendary: 1200 };
export const SHOP_ITEMS: readonly ShopItem[] = [
  ...SKINS.filter(skin => !achievementForItem("skin", skin.id))
    .map(skin => ({ kind: "skin" as const, id: skin.id, price: skinPrices[skin.rarity] })),
  ...PROFILE_ICONS.filter(icon => !achievementForItem("icon", icon.id))
    .map(icon => ({ kind: "icon" as const, id: icon.id, price: icon.id === "fox" ? 0 : 150 })),
];
