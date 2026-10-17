import { CatalogIdSchema } from "./catalog";

export const PROFILE_ICONS = [
  { id: "fox", name: "Ember Fox", color: "#c66a42" },
  { id: "owl", name: "Moon Owl", color: "#7d83b5" },
  { id: "dragon", name: "Jade Dragon", color: "#4f9584" },
  { id: "cat", name: "Star Cat", color: "#b28a42" },
  { id: "rabbit", name: "Cloud Rabbit", color: "#b57892" },
  { id: "robot", name: "Tile Bot", color: "#548da7" },
  { id: "attendance-king", name: "Attendance King", color: "#b68a43" },
  { id: "victory-vanguard", name: "Victory Vanguard", color: "#4c7e78" },
  { id: "achievement-king", name: "Achievement King", color: "#9c7540" },
  { id: "rank-bronze", name: "Bronze Bastion", color: "#a76e49" },
  { id: "rank-silver", name: "Silver Crossguard", color: "#7e94af" },
  { id: "rank-gold", name: "Golden Laurel", color: "#b8953e" },
  { id: "rank-platinum", name: "Platinum Compass", color: "#4b968e" },
  { id: "rank-diamond", name: "Diamond Prism", color: "#689ec3" },
  { id: "rank-master", name: "Master Crown", color: "#8b69a7" },
] as const;

export type ProfileIconId = string;
export const GUEST_PROFILE_ICON = { id: "guest", name: "Guest icon" } as const;
export type PlayerIconId = ProfileIconId | typeof GUEST_PROFILE_ICON.id;
export const DEFAULT_PROFILE_ICON: ProfileIconId = "fox";
export function isProfileIconId(value: unknown): value is ProfileIconId {
  return CatalogIdSchema.safeParse(value).success;
}
