import { SKINS, type SkinId, type SkinRarity } from "./loadout";
import type { ProfileIconId } from "./profile-icons";
import { achievementForItem } from "./achievements";

type Achievement = {
  id: string;
  name: string;
  description: string;
  metric: "finishes" | "wins" | "highest_tile" | "placement_complete";
  target: number;
  reward: { kind: "coins"; amount: number } | { kind: "icon"; iconId: ProfileIconId };
  status: "planned";
};

// Draft definitions only. Match recording does not grant these rewards yet.
export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: "first-finish", name: "First steps", description: "Complete one eligible match.", metric: "finishes", target: 1, reward: { kind: "coins", amount: 50 }, status: "planned" },
  { id: "first-win", name: "First victory", description: "Win one eligible match.", metric: "wins", target: 1, reward: { kind: "coins", amount: 75 }, status: "planned" },
  { id: "ten-finishes", name: "Steady challenger", description: "Complete ten eligible matches.", metric: "finishes", target: 10, reward: { kind: "coins", amount: 150 }, status: "planned" },
  { id: "tile-1024", name: "One step closer", description: "Create a 1024 tile in an eligible match.", metric: "highest_tile", target: 1024, reward: { kind: "coins", amount: 100 }, status: "planned" },
  { id: "tile-2048", name: "Master of 2048", description: "Create a 2048 tile in an eligible match.", metric: "highest_tile", target: 2048, reward: { kind: "icon", iconId: "dragon" }, status: "planned" },
  { id: "ranked-placement", name: "First placement", description: "Complete your first 10 ranked matches.", metric: "placement_complete", target: 1, reward: { kind: "coins", amount: 100 }, status: "planned" },
];

const plannedPrices: Record<SkinRarity, number> = { common: 150, rare: 300, epic: 600, legendary: 1200 };
export const SHOP_ITEMS: readonly { skinId: SkinId; plannedPrice: number; status: "planned" }[] = SKINS
  .filter(skin => skin.id !== "classic" && !achievementForItem("skin", skin.id))
  .map(skin => ({ skinId: skin.id, plannedPrice: plannedPrices[skin.rarity], status: "planned" }));
