import type { AchievementState } from "schema/achievements";

export type AchievementSnapshot = { userId?: string; data?: AchievementState; error: boolean };
export type AchievementSyncResult = AchievementSnapshot & {
  checkInError: boolean;
  changed: boolean;
  checkedIn: boolean;
  newRewards: string[];
};
type AchievementServices = {
  getUser(): Promise<{ id: string; is_anonymous?: boolean } | null>;
  rpc(name: "achievement_state" | "sync_achievements" | "check_in"): PromiseLike<{ data: unknown; error: unknown }>;
};

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const date = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value));
const timestamp = (value: unknown): value is string => typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));

export function parseAchievementState(value: unknown): AchievementState | undefined {
  if (!record(value) || !record(value.attendance)) return;
  const attendance = value.attendance;
  if (!count(attendance.streak) || !count(attendance.bestStreak) || !date(attendance.today)
    || !(attendance.lastDay === null || date(attendance.lastDay)) || typeof attendance.checkedInToday !== "boolean"
    || !timestamp(attendance.nextCheckInAt) || !count(value.wins) || !count(value.highestTile)
    || !Array.isArray(value.unlocks) || !value.unlocks.every(unlock => record(unlock) && typeof unlock.achievementId === "string" && unlock.achievementId.length > 0 && timestamp(unlock.unlockedAt))
    || [value.highestRank, value.achievementCount, value.soloHighestTile].some(item => item !== undefined && !count(item))
    || !(value.soloBestMs === undefined || value.soloBestMs === null || count(value.soloBestMs))) return;
  return {
    attendance: { streak: attendance.streak, bestStreak: attendance.bestStreak, today: attendance.today, lastDay: attendance.lastDay, checkedInToday: attendance.checkedInToday, nextCheckInAt: attendance.nextCheckInAt },
    wins: value.wins, highestTile: value.highestTile,
    unlocks: value.unlocks.map(unlock => ({ achievementId: unlock.achievementId, unlockedAt: unlock.unlockedAt })),
    ...(value.highestRank !== undefined && { highestRank: value.highestRank as number }),
    ...(value.achievementCount !== undefined && { achievementCount: value.achievementCount as number }),
    ...(value.soloHighestTile !== undefined && { soloHighestTile: value.soloHighestTile as number }),
    ...(value.soloBestMs !== undefined && { soloBestMs: value.soloBestMs as number | null }),
  };
}

async function requestState(services: AchievementServices, name: Parameters<AchievementServices["rpc"]>[0]) {
  const response = await services.rpc(name);
  const data = parseAchievementState(response.data);
  if (response.error || !data) throw new Error("Achievement information is unavailable");
  return data;
}

export async function readAchievementState(services: AchievementServices): Promise<AchievementSnapshot> {
  let userId: string | undefined;
  try {
    const user = await services.getUser();
    if (!user || user.is_anonymous) return { error: false };
    userId = user.id;
    return { userId, data: await requestState(services, "achievement_state"), error: false };
  } catch { return { ...(userId && { userId }), error: true }; }
}

export async function syncAchievementState(services: AchievementServices): Promise<AchievementSyncResult> {
  const result: AchievementSyncResult = { error: false, checkInError: false, changed: false, checkedIn: false, newRewards: [] };
  try {
    const user = await services.getUser();
    if (!user || user.is_anonymous) return result;
    result.userId = user.id;
    const before = await requestState(services, "achievement_state");
    result.data = await requestState(services, "sync_achievements");
    if (!result.data.attendance.checkedInToday) {
      try {
        result.data = await requestState(services, "check_in");
        result.checkedIn = true;
      } catch { result.checkInError = true; }
    }
    const previousUnlocks = new Set(before.unlocks.map(item => item.achievementId));
    result.newRewards = result.data.unlocks.filter(item => !previousUnlocks.has(item.achievementId)).map(item => item.achievementId);
    result.changed = JSON.stringify(before) !== JSON.stringify(result.data);
  } catch { result.error = true; }
  return result;
}
