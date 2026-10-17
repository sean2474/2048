export const PROFILE_ICONS = [
  { id: "fox", name: "Ember Fox", color: "#c66a42" },
  { id: "owl", name: "Moon Owl", color: "#7d83b5" },
  { id: "dragon", name: "Jade Dragon", color: "#4f9584" },
  { id: "cat", name: "Star Cat", color: "#b28a42" },
  { id: "rabbit", name: "Cloud Rabbit", color: "#b57892" },
  { id: "robot", name: "Tile Bot", color: "#548da7" },
  { id: "attendance-king", name: "Attendance King", color: "#b68a43" },
  { id: "victory-vanguard", name: "Victory Vanguard", color: "#4c7e78" },
] as const;

export type ProfileIconId = (typeof PROFILE_ICONS)[number]["id"];
export const GUEST_PROFILE_ICON = { id: "guest", name: "Guest icon" } as const;
export type PlayerIconId = ProfileIconId | typeof GUEST_PROFILE_ICON.id;
export const DEFAULT_PROFILE_ICON: ProfileIconId = "fox";
export function isProfileIconId(value: unknown): value is ProfileIconId {
  return PROFILE_ICONS.some(icon => icon.id === value);
}
