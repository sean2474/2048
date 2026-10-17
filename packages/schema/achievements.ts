import type { SkinId } from "./loadout";
import type { ProfileIconId } from "./profile-icons";

type AchievementReward = {
  id: string;
  name: string;
  description: string;
  metric: "attendance_streak" | "wins" | "highest_tile";
  target: number;
  reward: { kind: "skin"; skinId: SkinId } | { kind: "icon"; iconId: ProfileIconId };
};

export const ACHIEVEMENT_REWARDS = [
  { id: "checkin-7", name: "Seven dawns", description: "Check in for 7 consecutive days (KST).", metric: "attendance_streak", target: 7, reward: { kind: "skin", skinId: "dawn-oath" } },
  { id: "checkin-30", name: "Attendance king", description: "Check in for 30 consecutive days (KST).", metric: "attendance_streak", target: 30, reward: { kind: "icon", iconId: "attendance-king" } },
  { id: "wins-10", name: "Victory vanguard", description: "Win 10 eligible matches.", metric: "wins", target: 10, reward: { kind: "icon", iconId: "victory-vanguard" } },
  { id: "tile-2048-reward", name: "Rune awakening", description: "Create a 1024 tile in an eligible match.", metric: "highest_tile", target: 1024, reward: { kind: "skin", skinId: "rune-sanctum" } },
] as const satisfies readonly AchievementReward[];

export type AchievementId = (typeof ACHIEVEMENT_REWARDS)[number]["id"];
export type AchievementState = {
  attendance: { streak: number; bestStreak: number; lastDay: string | null; today: string; checkedInToday: boolean; nextCheckInAt: string };
  wins: number;
  highestTile: number;
  unlocks: { achievementId: AchievementId; unlockedAt: string }[];
};

export function achievementForItem(kind: "skin" | "icon", id: string) {
  return ACHIEVEMENT_REWARDS.find(({ reward }) => reward.kind === kind && (reward.kind === "skin" ? reward.skinId : reward.iconId) === id);
}
