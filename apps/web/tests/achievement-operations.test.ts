import assert from "node:assert/strict";
import test from "node:test";
import { parseAchievementState, readAchievementState, syncAchievementState } from "../src/lib/achievement-operations";

const state = (checkedInToday = false) => ({
  attendance: { streak: 6, bestStreak: 6, today: "2026-10-22", lastDay: "2026-10-21", checkedInToday, nextCheckInAt: "2026-10-22T15:00:00+00:00" },
  wins: 0, highestTile: 2, unlocks: [] as { achievementId: string; unlockedAt: string }[],
});
const account = { id: "fixture-account", is_anonymous: false };

test("achievement payload parser rejects invalid input and preserves optional progress", () => {
  for (const invalid of [null, undefined, [], "", 2, {}, { ...state(), wins: -1 }, { ...state(), highestTile: Infinity }, { ...state(), unlocks: [null] }, { ...state(), attendance: { ...state().attendance, checkedInToday: "yes" } }, { ...state(), attendance: { ...state().attendance, today: "" } }]) assert.equal(parseAchievementState(invalid), undefined);
  const full = { ...state(), soloBestMs: null, soloHighestTile: 2048, highestRank: 6, achievementCount: 10, unlocks: [{ achievementId: "도전-🏆'", unlockedAt: "2026-10-22T00:00:00Z" }] };
  assert.deepEqual(parseAchievementState(full), full);
  assert.deepEqual(parseAchievementState({ ...state(), attendance: { ...state().attendance, lastDay: null } })?.attendance.lastDay, null);
  assert.equal(parseAchievementState({ ...full, soloBestMs: -1 }), undefined);
  assert.equal(parseAchievementState({ ...full, highestRank: "6" }), undefined);
  assert.equal(parseAchievementState({ ...full, unlocks: [{ achievementId: "", unlockedAt: "" }] }), undefined);
  assert.equal(parseAchievementState({ ...full, unlocks: Array.from({ length: 10000 }, (_, index) => ({ achievementId: `achievement-${index}`, unlockedAt: "2026-10-22T00:00:00Z" })) })?.unlocks.length, 10000);
});

test("guest and anonymous requests never read or mutate achievement data", async () => {
  for (const user of [null, { ...account, is_anonymous: true }]) {
    const services = { getUser: async () => user, rpc: async () => { throw new Error("Must not query"); } };
    assert.deepEqual(await readAchievementState(services), { error: false });
    assert.deepEqual(await syncAchievementState(services), { error: false, checkInError: false, changed: false, checkedIn: false, newRewards: [] });
  }
});

test("server reads invoke only the read-only achievement_state RPC and retain user scope", async () => {
  const calls: string[] = [];
  const snapshot = await readAchievementState({ getUser: async () => account, rpc: async name => { calls.push(name); return { data: state(), error: null }; } });
  assert.deepEqual(calls, ["achievement_state"]);
  assert.deepEqual(snapshot, { userId: account.id, data: state(), error: false });
});

test("automatic attendance syncs catalog unlocks then checks in and reports new rewards", async () => {
  const calls: string[] = [];
  const synced = { ...state(), unlocks: [{ achievementId: "wins", unlockedAt: "2026-10-22T00:00:00Z" }] };
  const checked = { ...state(true), unlocks: [...synced.unlocks, { achievementId: "checkin-7", unlockedAt: "2026-10-22T00:00:00Z" }] };
  const result = await syncAchievementState({ getUser: async () => account, rpc: async name => { calls.push(name); return { data: name === "check_in" ? checked : name === "sync_achievements" ? synced : state(), error: null }; } });
  assert.deepEqual(calls, ["achievement_state", "sync_achievements", "check_in"]);
  assert.deepEqual(result, { userId: account.id, data: checked, error: false, checkInError: false, changed: true, checkedIn: true, newRewards: ["wins", "checkin-7"] });
});

test("already checked-in visits avoid duplicate attendance and refresh loops", async () => {
  const calls: string[] = [];
  const result = await syncAchievementState({ getUser: async () => account, rpc: async name => { calls.push(name); return { data: state(true), error: null }; } });
  assert.deepEqual(calls, ["achievement_state", "sync_achievements"]);
  assert.equal(result.changed, false);
  assert.equal(result.checkedIn, false);
  assert.deepEqual(result.newRewards, []);
});

test("errors remain explicit and attendance failure preserves valid synchronized progress", async () => {
  for (const name of ["achievement_state", "sync_achievements", "check_in"]) {
    for (const mode of ["throw", "error", "invalid"]) {
      const services = { getUser: async () => account, rpc: async (current: string) => {
        if (current !== name) return { data: state(), error: null };
        if (mode === "throw") throw new Error("Network unavailable");
        return { data: mode === "invalid" ? {} : null, error: mode === "error" ? new Error("Database unavailable") : null };
      } };
      const result = await syncAchievementState(services);
      if (name === "check_in") { assert.equal(result.checkInError, true); assert.deepEqual(result.data, state()); assert.equal(result.error, false); }
      else assert.equal(result.error, true);
      if (name === "achievement_state") assert.deepEqual(await readAchievementState(services), { userId: account.id, error: true });
    }
  }
  const services = { getUser: async () => { throw Error("Auth unavailable"); }, rpc: async () => ({ data: null, error: null }) };
  assert.equal((await readAchievementState(services)).error, true);
  assert.equal((await syncAchievementState(services)).error, true);
});

test("concurrent accounts keep their progress and rewards isolated", async () => {
  const results = await Promise.all(Array.from({ length: 12 }, (_, index) => {
    const data = { ...state(true), wins: index };
    return syncAchievementState({ getUser: async () => ({ ...account, id: String(index) }), rpc: async () => ({ data, error: null }) });
  }));
  results.forEach((result, index) => { assert.equal(result.userId, String(index)); assert.equal(result.data?.wins, index); });
});
