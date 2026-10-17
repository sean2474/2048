import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { DAILY_QUESTS, DailyQuestStateSchema, type DailyQuestState } from "schema/daily-quests";
import { ACHIEVEMENT_REWARDS, achievementProgress, type AchievementState } from "schema/achievements";
import { createAuthDatabase } from "./helpers/pglite";
import { achievementMessages } from "../../web/src/lib/i18n/achievement-messages";

const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222", GUEST = "33333333-3333-4333-8333-333333333333";
const migration = "20261017150000_daily_quests_and_achievement_king.sql";
const backfill = "20261017150001_backfill_achievement_king.sql";
const directory = new URL("../../../supabase/migrations/", import.meta.url);
async function database(t: TestContext, before?: (db: PGlite) => Promise<void>) {
  const db = await createAuthDatabase(); t.after(() => db.close());
  for (const file of (await readdir(directory)).filter(file => file.endsWith(".sql") && file < migration).sort()) await db.exec(await readFile(new URL(file, directory), "utf8"));
  await db.query("insert into auth.users(id,is_anonymous) values($1,false),($2,false),($3,true)", [A, B, GUEST]);
  if (before) await before(db);
  await db.exec(await readFile(new URL(migration, directory), "utf8"));
  await db.exec(await readFile(new URL(backfill, directory), "utf8"));
  const at = async (instant: string, player = A) => DailyQuestStateSchema.parse((await db.query<{ state: DailyQuestState }>("select private.sync_daily_quests_at($1,$2) as state", [player, instant])).rows[0].state);
  const checkIn = (instant: string, player = A) => db.query("select private.check_in_at($1,$2)", [player, instant]);
  const record = async (endedAt: string, options: { mode?: string; opponent?: string | null; winner?: number | null; id?: string } = {}) => {
    const players = [{ userId: A, score: 100, maxTile: 64 }, { userId: options.opponent === undefined ? B : options.opponent, score: 50, maxTile: 32 }];
    const winner = options.winner === undefined ? 1 : options.winner;
    return db.query("select public.record_match($1,$2,$3,$4,$5::smallint,$6::jsonb,$7)", [options.id ?? randomUUID(), new Date(Date.parse(endedAt) - 60000).toISOString(), endedAt, winner === null ? "draw" : "surrender", winner, JSON.stringify(players), options.mode ?? "casual"]);
  };
  return { db, at, checkIn, record };
}
async function as(db: PGlite, role: string, id: string, run: () => Promise<void>) {
  await db.exec(`set role ${role}`); await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.aal','aal2',false)", [id]);
  try { await run(); } finally { await db.exec("reset role"); }
}

test("daily quests pay 20/60/40 once, use verified results, and reset at midnight KST", async t => {
  const { db, at, checkIn, record } = await database(t);
  const beforeMidnight = "2026-10-17T14:59:59Z", midnight = "2026-10-17T15:00:00Z";
  assert.deepEqual((await at(beforeMidnight)).quests.map(item => item.progress), [0, 0, 0]);
  for (const options of [{ mode: "friend" }, { opponent: null }, { opponent: GUEST }, { opponent: A }]) await record("2026-10-17T01:00:00Z", options);
  await record("2026-10-16T14:59:59Z");
  assert.deepEqual((await at(beforeMidnight)).quests.map(item => item.progress), [0, 0, 0]);
  await checkIn(beforeMidnight);
  assert.equal((await at(beforeMidnight)).awarded, 20);
  assert.equal((await at(beforeMidnight)).awarded, 0);
  await record("2026-10-17T02:00:00Z", { winner: 2 });
  await record("2026-10-17T03:00:00Z", { winner: null, mode: "ranked" });
  assert.deepEqual((await at(beforeMidnight)).quests.map(item => item.progress), [1, 2, 0]);
  const id = randomUUID();
  await record("2026-10-17T04:00:00Z", { id });
  await record("2026-10-17T04:00:00Z", { id });
  const completed = await at(beforeMidnight);
  assert.equal(completed.awarded, 100);
  assert.equal(completed.balance, 120);
  assert.ok(completed.quests.every(item => item.rewardedAt));
  assert.equal(Date.parse(completed.nextResetAt), Date.parse("2026-10-17T15:00:00Z"));
  const retries = await Promise.all([at(beforeMidnight), at(beforeMidnight), at(beforeMidnight)]);
  assert.ok(retries.every(state => state.awarded === 0 && state.balance === 120));
  assert.deepEqual((await db.query("select quest_id,coins from public.daily_quest_rewards where player_id=$1 order by quest_id", [A])).rows,
    DAILY_QUESTS.map(item => ({ quest_id: item.id, coins: item.coins })).sort((a, b) => a.quest_id.localeCompare(b.quest_id)));
  await record("2026-10-17T16:00:00Z");
  const tomorrow = await at(midnight);
  assert.equal(tomorrow.day, "2026-10-18");
  assert.deepEqual(tomorrow.quests.map(item => item.progress), [0, 0, 0], "future results and yesterday's attendance cannot complete today's quests");
  assert.equal(tomorrow.balance, 120);
  await checkIn(midnight);
  assert.equal((await at(midnight)).balance, 140);
  assert.equal((await at("2026-10-17T16:01:00Z")).balance, 180);
  await db.query("delete from auth.users where id=$1", [B]);
  assert.equal((await at("2026-10-17T16:01:00Z")).quests[2].progress, 1);
  await db.query("delete from auth.users where id=$1", [A]);
  assert.deepEqual((await db.query("select * from public.daily_quest_rewards")).rows, []);
});

test("quest writes and clocks are private, failures roll back rewards, and spending sees the awarded balance", async t => {
  const { db, at, checkIn } = await database(t);
  for (const [role, id] of [["anon", ""], ["authenticated", ""], ["authenticated", GUEST]]) await as(db, role, id, async () => {
    await assert.rejects(db.query("select public.sync_daily_quests()"), /permission denied|Account required/);
  });
  await as(db, "authenticated", A, async () => {
    await assert.rejects(db.query("select private.sync_daily_quests_at($1,now())", [A]), /permission denied/);
    await assert.rejects(db.query("select public.sync_daily_quests('2099-01-01')"), /does not exist/);
    await assert.rejects(db.query("insert into public.daily_quest_rewards values($1,current_date,'check-in',20,now())", [A]), /permission denied/);
    await assert.rejects(db.query("update public.daily_quest_rewards set coins=999"), /permission denied/);
    await assert.rejects(db.query("update public.player_wallets set balance=999"), /permission denied/);
    await db.query("select public.check_in()");
    const first = (await db.query<{ state: DailyQuestState }>("select public.sync_daily_quests() as state")).rows[0].state;
    assert.equal(first.playerId, A);
    assert.equal(first.awarded, 20);
  });
  await as(db, "authenticated", B, async () => { assert.deepEqual((await db.query("select * from public.daily_quest_rewards")).rows, []); });
  const tomorrow = "2099-01-01T03:00:00Z";
  await checkIn(tomorrow);
  await db.query("update public.player_wallets set balance=9007199254740991 where player_id=$1", [A]);
  await assert.rejects(at(tomorrow), /check constraint/);
  assert.equal((await db.query("select * from public.daily_quest_rewards where quest_day='2099-01-01'")).rows.length, 0);
  await db.query("update public.player_wallets set balance=130 where player_id=$1", [A]);
  assert.equal((await at(tomorrow)).balance, 150);
  await as(db, "authenticated", A, async () => {
    const purchased = (await db.query<{ state: { balance: number } }>("select public.purchase_cosmetic('icon','owl') as state")).rows[0].state;
    assert.equal(purchased.balance, 0);
  });
  assert.equal((await at(tomorrow)).balance, 0, "retrying a quest cannot restore spent coins");
  await db.query("update public.players set suspended_at=now(),suspension_reason='Test suspension' where id=$1", [A]);
  await as(db, "authenticated", A, async () => { await assert.rejects(db.query("select public.sync_daily_quests()"), /Account required/); });
});

test("five base achievements unlock the king once, backfill old owners and gate equipment", async t => {
  const oldIds = ["solo-first", "solo-10min", "solo-6min", "endless-2048", "endless-4096"];
  const { db } = await database(t, async db => {
    for (const id of oldIds) await db.query("insert into public.achievement_unlocks(player_id,achievement_id) values($1,$2)", [B, id]);
  });
  assert.equal((await db.query("select * from public.achievement_unlocks where player_id=$1 and achievement_id='achievement-king'", [B])).rows.length, 1);
  await as(db, "authenticated", A, async () => {
    await assert.rejects(db.query("insert into public.player_preferences(player_id,icon_id) values($1,'achievement-king')", [A]), /Achievement required/);
    await assert.rejects(db.query("insert into public.achievement_unlocks(player_id,achievement_id) values($1,'achievement-king')", [A]), /permission denied/);
  });
  await db.query("select public.record_solo($1,$2,300000,100,20000)", [randomUUID(), A]);
  await db.query("select public.record_solo_endless($1,$2,2048)", [randomUUID(), A]);
  assert.equal((await db.query("select * from public.achievement_unlocks where player_id=$1", [A])).rows.length, 4);
  await db.query("select public.record_solo_endless($1,$2,4096)", [randomUUID(), A]);
  const king = (await db.query("select * from public.achievement_unlocks where player_id=$1 and achievement_id='achievement-king'", [A])).rows;
  assert.equal(king.length, 1);
  await db.exec(await readFile(new URL(backfill, directory), "utf8"));
  await db.query("select public.record_solo_endless($1,$2,4096)", [randomUUID(), A]);
  assert.deepEqual((await db.query("select * from public.achievement_unlocks where player_id=$1 and achievement_id='achievement-king'", [A])).rows, king);
  await as(db, "authenticated", A, async () => {
    await db.query("insert into public.player_preferences(player_id,icon_id) values($1,'achievement-king')", [A]);
    assert.equal((await db.query<{ icon_id: string }>("select icon_id from public.player_preferences")).rows[0].icon_id, "achievement-king");
    await assert.rejects(db.query("insert into public.player_preferences(player_id,icon_id) values($1,'achievement-king')", [B]), /row-level security/);
  });
});

test("progress excludes the king itself and uses time targets instead of tile scores", () => {
  const state: AchievementState = { attendance: { streak: 3, bestStreak: 3, lastDay: null, today: "2026-10-17", checkedInToday: false, nextCheckInAt: "2026-10-17T15:00:00Z" }, wins: 4, highestTile: 1024, soloBestMs: 480000, unlocks: [{ achievementId: "achievement-king", unlockedAt: "2026-10-17T00:00:00Z" }, { achievementId: "checkin-7", unlockedAt: "2026-10-17T00:00:00Z" }] };
  const king = ACHIEVEMENT_REWARDS.find(item => item.id === "achievement-king")!;
  assert.equal(achievementProgress(king, state).current, 1);
  assert.equal(achievementProgress(king, state).percent, 100);
  assert.equal(achievementProgress(king, { ...state, unlocks: state.unlocks.slice(1) }).percent, 20);
  assert.equal(achievementProgress(ACHIEVEMENT_REWARDS.find(item => item.id === "solo-6min")!, state).percent, 75);
  assert.equal(achievementProgress(ACHIEVEMENT_REWARDS.find(item => item.id === "checkin-7")!, state).percent, 100);
  for (const quest of DAILY_QUESTS) { assert.ok(achievementMessages[quest.name]); assert.ok(achievementMessages[quest.description]); }
  assert.equal(DailyQuestStateSchema.safeParse({ quests: [] }).success, false);
});
