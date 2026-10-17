import type { SkinId } from "./loadout";
import type { ProfileIconId } from "./profile-icons";

type AchievementReward = {
  id: string;
  name: string;
  description: string;
  metric: "attendance_streak" | "wins" | "highest_tile" | "solo_time" | "solo_tile" | "rank_tier" | "achievements";
  target: number;
  reward: { kind: "skin"; skinId: SkinId } | { kind: "icon"; iconId: ProfileIconId } | { kind: "set"; skinId: SkinId; iconId: ProfileIconId };
};

export const ACHIEVEMENT_REWARDS = [
  { id: "achievement-king", name: "Achievement king", description: "Unlock 5 other achievements.", metric: "achievements", target: 5, reward: { kind: "icon", iconId: "achievement-king" } },
  { id: "checkin-7", name: "Seven dawns", description: "Check in for 7 consecutive days (KST).", metric: "attendance_streak", target: 7, reward: { kind: "skin", skinId: "dawn-oath" } },
  { id: "checkin-30", name: "Attendance king", description: "Check in for 30 consecutive days (KST).", metric: "attendance_streak", target: 30, reward: { kind: "icon", iconId: "attendance-king" } },
  { id: "wins-10", name: "Victory vanguard", description: "Win 10 eligible matches.", metric: "wins", target: 10, reward: { kind: "icon", iconId: "victory-vanguard" } },
  { id: "tile-2048-reward", name: "Rune awakening", description: "Create a 1024 tile in an eligible match.", metric: "highest_tile", target: 1024, reward: { kind: "skin", skinId: "rune-sanctum" } },
  { id: "rank-bronze", name: "Bronze collector", description: "Reach Bronze in ranked play.", metric: "rank_tier", target: 1, reward: { kind: "set", skinId: "rank-bronze", iconId: "rank-bronze" } },
  { id: "rank-silver", name: "Silver collector", description: "Reach Silver in ranked play.", metric: "rank_tier", target: 2, reward: { kind: "set", skinId: "rank-silver", iconId: "rank-silver" } },
  { id: "rank-gold", name: "Gold collector", description: "Reach Gold in ranked play.", metric: "rank_tier", target: 3, reward: { kind: "set", skinId: "rank-gold", iconId: "rank-gold" } },
  { id: "rank-platinum", name: "Platinum collector", description: "Reach Platinum in ranked play.", metric: "rank_tier", target: 4, reward: { kind: "set", skinId: "rank-platinum", iconId: "rank-platinum" } },
  { id: "rank-diamond", name: "Diamond collector", description: "Reach Diamond in ranked play.", metric: "rank_tier", target: 5, reward: { kind: "set", skinId: "rank-diamond", iconId: "rank-diamond" } },
  { id: "rank-master", name: "Master collector", description: "Reach Master in ranked play.", metric: "rank_tier", target: 6, reward: { kind: "set", skinId: "rank-master", iconId: "rank-master" } },
] as const satisfies readonly AchievementReward[];

export type AchievementId = string;
export type AchievementState = {
  attendance: { streak: number; bestStreak: number; lastDay: string | null; today: string; checkedInToday: boolean; nextCheckInAt: string };
  wins: number;
  highestTile: number;
  highestRank?: number;
  achievementCount?: number;
  soloBestMs?: number | null;
  soloHighestTile?: number;
  unlocks: { achievementId: AchievementId; unlockedAt: string }[];
};

export function achievementForItem(kind: "skin" | "icon", id: string) {
  return ACHIEVEMENT_REWARDS.find(({ reward }) => kind === "skin"
    ? "skinId" in reward && reward.skinId === id
    : "iconId" in reward && reward.iconId === id);
}


export function achievementProgress(item: Pick<AchievementReward, "id" | "metric" | "target">, data: AchievementState) {
  const unlocked = data.unlocks.some(unlock => unlock.achievementId === item.id);
  const current = item.metric === "achievements" ? data.achievementCount ?? data.unlocks.filter(unlock => unlock.achievementId !== item.id && unlock.achievementId !== "achievement-king").length
    : item.metric === "attendance_streak" ? data.attendance.streak
    : item.metric === "wins" ? data.wins
    : item.metric === "rank_tier" ? data.highestRank ?? 0
    : item.metric === "solo_time" ? data.soloBestMs ?? 0
    : item.metric === "solo_tile" ? data.soloHighestTile ?? 0 : data.highestTile;
  const fraction = item.metric === "solo_time" ? current > 0 ? item.target / current : 0 : current / item.target;
  return { unlocked, current, percent: unlocked ? 100 : Math.min(100, Math.max(0, Math.floor(fraction * 100))) };
}

export function formatAchievementTime(ms: number) {
  const centiseconds = Math.floor(Math.max(0, ms) / 10);
  const minutes = String(Math.floor(centiseconds / 6000)).padStart(2, "0");
  const seconds = String(Math.floor(centiseconds / 100) % 60).padStart(2, "0");
  return `${minutes}:${seconds}.${String(centiseconds % 100).padStart(2, "0")}`;
}
