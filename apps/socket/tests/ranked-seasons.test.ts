import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createAuthDatabase } from "./helpers/pglite";
import { randomUUID } from "node:crypto";

const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222", ADMIN = "33333333-3333-4333-8333-333333333333";
const payload = JSON.stringify([{ userId: A, score: 100, maxTile: 64 }, { userId: B, score: 10, maxTile: 8 }]);
async function database(t: TestContext, upgrade = false) {
  const db = await createAuthDatabase(); t.after(() => db.close());
  const dir = new URL("../../../supabase/migrations/", import.meta.url);
  const files = (await readdir(dir)).filter(f => f.endsWith(".sql")).sort();
  const rank = "20261017020000_rank_seasons.sql";
  for (const file of files.filter(f => f < rank)) await db.exec(await readFile(new URL(file, dir), "utf8"));
  await db.query("insert into auth.users(id) values($1),($2),($3)", [A, B, ADMIN]);
  await db.query("insert into public.admin_roles values($1)", [ADMIN]);
  if (upgrade) {
    await db.query("insert into public.player_ratings(player_id,display_name,rating,wins) values($1,'Veteran',1420,12),($2,'New',1184,9)", [A, B]);
    for (let i = 1; i <= 12; i++) {
      const id = randomUUID(), rating = i === 9 ? 1800 : i === 11 ? 1500 : 1420;
      await db.query("insert into public.matches(id,started_at,ended_at,reason,mode) values($1,'2026-10-14', '2026-10-14'::timestamptz + $2 * interval '1 second','draw','ranked')", [id, i]);
      await db.query("insert into public.match_participants(match_id,slot,player_id,display_name,score,max_tile,result,rating_before,rating_after,rating_delta) values($1,1,$2,'Veteran',0,2,'draw',$3,$3,0)", [id, A, rating]);
    }
  }
  for (const file of files.filter(f => f >= rank)) await db.exec(await readFile(new URL(file, dir), "utf8"));
  const rpc = async <T>(sql: string, args: unknown[] = []) => (await db.query<{ value: T }>(`select ${sql} as value`, args)).rows[0].value;
  const as = async <T>(role: string, id: string, fn: () => Promise<T>) => {
    await db.exec(`set role ${role}`); await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.aal','aal2',false)", [id]);
    try { return await fn(); } finally { await db.exec("reset role"); }
  };
  const record = (winner: number | null = 1, id = randomUUID(), start = "2026-10-15T00:00:00Z", end = "2026-10-15T00:01:00Z") =>
    as("service_role", "", () => rpc<boolean>("public.record_match($1,$2,$3,$4,$5::smallint,$6::jsonb,'ranked')", [id, start, end, winner === null ? "draw" : "surrender", winner, payload]));
  const row = async (id = A) => (await db.query<Record<string, unknown>>("select * from public.player_ratings where player_id=$1", [id])).rows[0];
  const current = async () => (await db.query<{ id: string }>("select id from public.rank_seasons where ends_at is null")).rows[0].id;
  return { db, rpc, as, record, row, current };
}

test("season migration preserves existing Elo and records, counting only official results toward the peak", async t => {
  const { db, row } = await database(t, true);
  assert.equal((await row()).rating, 1420); assert.equal((await row()).tier, "Platinum"); assert.equal((await row()).placement_games, 10);
  assert.equal((await row()).peak_rating, 1500); assert.equal((await row()).games_played, 12);
  assert.equal((await row(B)).rating, 1184); assert.equal((await row(B)).tier, null); assert.equal((await row(B)).placement_games, 9);
  assert.equal((await row(B)).peak_rating, null);
  assert.equal((await db.query("select * from public.season_ratings")).rows.length, 2);
  assert.equal((await db.query("select * from public.matches")).rows.length, 12);
  const result = (await db.query<{ rating_after: number; tier_after: string }>("select rating_after,tier_after from public.match_participants where rating_after=1800")).rows[0];
  assert.equal(result.rating_after, 1800); assert.equal(result.tier_after, "Master");
  assert.equal((await db.query("select column_name from information_schema.columns where table_schema='public' and column_name like 'promotion_%'")).rows.length, 0);
});

test("the tenth lifetime result assigns a tier once, including draws, and preserves the season peak", async t => {
  const { db, record, row } = await database(t);
  for (let i = 0; i < 9; i++) await record();
  assert.equal((await row()).tier, null); assert.equal((await row()).placement_games, 9); assert.equal((await row()).peak_rating, null);
  const tenth = randomUUID(); assert.equal(await record(null, tenth), true);
  const before = await row();
  assert.equal(before.placement_games, 10); assert.equal(before.games_played, 10); assert.equal(before.tier, "Gold");
  assert.equal(before.peak_rating, before.rating);
  assert.equal(await record(null, tenth), false); assert.deepEqual(await row(), before);
  await record(2);
  assert.equal((await row()).placement_games, 10); assert.equal((await row()).peak_rating, before.rating);
  assert.equal((await db.query<{ tier_before: string | null; tier_after: string; placement_games: number }>("select tier_before,tier_after,placement_games from public.match_participants where match_id=$1 and slot=1", [tenth])).rows[0].tier_before, null);
  assert.equal((await db.query<{ games_played: number }>("select games_played from public.player_stats where player_id=$1", [A])).rows[0].games_played, 11);
});

test("every Elo threshold immediately promotes or demotes, even on draws, without changing the zero-sum calculation", async t => {
  const { db, record, row } = await database(t);
  for (let i = 0; i < 10; i++) await record(null);
  const tiers = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Master"];
  const seed = async (first: number, second: number) => db.query(`update public.player_ratings set
    rating=case when player_id=$1 then $2::integer else $3::integer end,
    tier=private.rank_tier(case when player_id=$1 then $2::integer else $3::integer end)`, [A, first, second]);
  for (const [index, threshold] of [1000, 1200, 1400, 1600, 1800].entries()) {
    await seed(threshold - 16, threshold - 16);
    await record(); assert.equal((await row()).rating, threshold); assert.equal((await row()).tier, tiers[index + 1]);
    assert.equal(Number((await row()).rating) + Number((await row(B)).rating), 2 * (threshold - 16));
    await seed(threshold, threshold);
    await record(2); assert.equal((await row()).rating, threshold - 16); assert.equal((await row()).tier, tiers[index]);
    await seed(threshold - 1, threshold + 399);
    await record(null); assert.equal((await row()).rating, threshold + 12); assert.equal((await row()).tier, tiers[index + 1]);
    await seed(threshold, threshold - 400);
    await record(null); assert.equal((await row()).rating, threshold - 13); assert.equal((await row()).tier, tiers[index]);
  }
  for (const [first, second, winner, change] of [[1200, 1000, 1, 8], [1200, 1000, 2, -24], [1200, 1400, 1, 24], [1200, 1400, 2, -8], [1200, 1200, null, 0], [2400, 0, 1, 0]] as const) {
    await seed(first, second); const id = randomUUID(); await record(winner, id);
    assert.equal((await row()).rating, first + change);
    const deltas = (await db.query<{ rating_delta: number }>("select rating_delta from public.match_participants where match_id=$1 order by slot", [id])).rows;
    assert.equal(deltas[0].rating_delta, change); assert.equal(deltas[0].rating_delta + deltas[1].rating_delta, 0);
  }
});

test("rollover preserves Elo and lifetime placements but resets season activity, eligibility and peak", async t => {
  const { db, record, row, current, rpc, as } = await database(t);
  for (let i = 0; i < 10; i++) await record();
  const first = await current(), before = await row();
  const next = await as("authenticated", ADMIN, () => rpc<string>("public.admin_rollover_season($1,'Season 2','Scheduled')", [first]));
  assert.equal((await row()).rating, before.rating); assert.equal((await row()).tier, before.tier); assert.equal((await row()).placement_games, 10);
  assert.equal((await row()).games_played, 0); assert.equal((await row()).peak_rating, null);
  const archived = (await db.query<Record<string, unknown>>("select * from public.season_ratings where season_id=$1 and player_id=$2", [first, A])).rows[0];
  assert.equal(archived.rating, before.rating); assert.equal(archived.peak_rating, before.peak_rating); assert.equal(archived.games_played, 10);
  const boundary = (await db.query<{ start: string }>("select starts_at::text as start from public.rank_seasons where id=$1", [next])).rows[0].start;
  const after = new Date(new Date(boundary).getTime() + 1000).toISOString();
  for (let i = 0; i < 9; i++) await record(2, randomUUID(), boundary, after);
  assert.equal((await row()).games_played, 9); assert.equal((await row()).placement_games, 10);
  assert.equal((await db.query("select player_id from public.player_ratings where games_played>=10")).rows.length, 0);
  assert.ok(Number((await row()).peak_rating) < Number(before.rating));
  const peak = (await row()).peak_rating;
  await record(2, randomUUID(), boundary, after);
  assert.equal((await db.query("select player_id from public.player_ratings where games_played>=10")).rows.length, 2);
  assert.equal((await row()).peak_rating, peak);
  assert.deepEqual((await db.query("select * from public.season_ratings where season_id=$1 and player_id=$2", [first, A])).rows[0], archived);
});

test("season boundaries stay contiguous and increasing when the clock repeats or moves backwards", async t => {
  const { db, record, row, current, rpc, as } = await database(t);
  await record(); const before = await row(), first = await current();
  const rollover = (id: string, name: string) => as("authenticated", ADMIN, () => rpc<string>("public.admin_rollover_season($1,$2,'Clock regression test')", [id, name]));
  const second = await rollover(first, "Season 2");
  // A future boundary deterministically simulates a clock that moved backwards.
  await db.query(`with boundary as (select clock_timestamp()+interval '1 day' as value)
    update public.rank_seasons set starts_at=case when id=$1 then boundary.value else starts_at end,
      ends_at=case when id=$2 then boundary.value else ends_at end from boundary where id in ($1,$2)`, [second, first]);
  const third = await rollover(second, "Season 3");
  await rollover(third, "Season 4");
  const boundaries = (await db.query<{ valid: boolean; contiguous: boolean | null; minimal: boolean }>(`select ends_at>starts_at as valid,
    ends_at=lead(starts_at) over(order by starts_at) as contiguous,
    ends_at=starts_at+interval '1 microsecond' as minimal from public.rank_seasons order by starts_at`)).rows;
  assert.ok(boundaries.slice(0, -1).every(boundary => boundary.valid && boundary.contiguous));
  assert.ok(boundaries.slice(1, -1).every(boundary => boundary.minimal));
  assert.equal((await db.query("select id from public.rank_seasons where ends_at is null")).rows.length, 1);
  assert.equal((await row()).rating, before.rating); assert.equal((await row()).placement_games, before.placement_games);
});

test("late results update lifetime Elo exactly once across several transitions without overwriting season snapshots", async t => {
  const { db, record, row, current, rpc, as } = await database(t);
  const rollover = async (name: string) => { const id = await current(); return as("authenticated", ADMIN, () => rpc<string>("public.admin_rollover_season($1,$2,'Scheduled')", [id, name])); };
  // Both accounts have no rating rows when their first result is delayed across two seasons.
  const first = await current(); await rollover("Season 2"); const third = await rollover("Season 3");
  const lateId = randomUUID(); await record(1, lateId);
  assert.equal((await row()).season_id, third); assert.equal((await row()).rating, 1216);
  assert.equal((await row()).placement_games, 1); assert.equal((await row()).games_played, 0); assert.equal((await row()).peak_rating, null);
  const boundary = (await db.query<{ start: string }>("select starts_at::text as start from public.rank_seasons where id=$1", [third])).rows[0].start;
  const after = new Date(new Date(boundary).getTime() + 1000).toISOString();
  for (let i = 0; i < 9; i++) await record(1, randomUUID(), boundary, after);
  assert.equal((await row()).placement_games, 10); assert.equal((await row()).games_played, 9); assert.equal((await row()).tier, "Gold");
  const beforeLate = await row();
  const thirdSnapshot = (await db.query("select * from public.season_ratings where season_id=$1 and player_id=$2", [third, A])).rows[0];
  const anotherLateId = randomUUID(); await record(1, anotherLateId, "2026-10-15T00:00:00Z", after);
  assert.ok(Number((await row()).rating) > Number(beforeLate.rating));
  assert.equal((await row()).games_played, 9); assert.equal((await row()).peak_rating, beforeLate.peak_rating);
  assert.deepEqual((await db.query("select * from public.season_ratings where season_id=$1 and player_id=$2", [third, A])).rows[0], thirdSnapshot);
  const lateHistory = (await db.query<{ rating_before: number; rating_after: number }>("select rating_before,rating_after from public.match_participants where match_id=$1 and slot=1", [anotherLateId])).rows[0];
  assert.equal(lateHistory.rating_before, beforeLate.rating); assert.equal(lateHistory.rating_after, (await row()).rating);
  const firstSnapshot = (await db.query<Record<string, unknown>>("select * from public.season_ratings where season_id=$1 and player_id=$2", [first, A])).rows[0];
  assert.equal(firstSnapshot.games_played, 2); assert.equal(firstSnapshot.rating, (await row()).rating); assert.equal(firstSnapshot.peak_rating, (await row()).rating);
  const afterLate = await row(); assert.equal(await record(1, anotherLateId), false); assert.deepEqual(await row(), afterLate);
  await record(2, randomUUID(), boundary, after);
  assert.equal((await row()).games_played, 10);
  assert.deepEqual((await db.query("select * from public.season_ratings where season_id=$1 and player_id=$2", [first, A])).rows[0], firstSnapshot);
  const beforeRollover = await row(); await rollover("Season 4");
  assert.equal((await row()).rating, beforeRollover.rating); assert.equal((await row()).tier, beforeRollover.tier);
  assert.equal((await row()).placement_games, 10); assert.equal((await row()).games_played, 0); assert.equal((await row()).peak_rating, null);
});

test("season transitions and result writes retain authorization, validation, atomicity and read boundaries", async t => {
  const { db, record, row, current, rpc, as } = await database(t);
  await record(); const first = await current();
  const rollover = (id: string, name = "Season 2", reason = "Scheduled transition") => rpc<string>("public.admin_rollover_season($1,$2,$3)", [id, name, reason]);
  await as("anon", "", () => assert.rejects(rollover(first), /permission denied/));
  await as("anon", "", () => assert.rejects(db.query("select created_by,transition_reason from public.rank_seasons"), /permission denied/));
  await as("authenticated", A, () => assert.rejects(rpc("public.admin_rank_seasons()"), /Admin access required/));
  await as("authenticated", A, () => assert.rejects(rollover(first), /Admin access required/));
  for (const [name, reason] of [["", "reason"], ["x".repeat(81), "reason"], ["Season", " "], ["Season", "x".repeat(501)]]) await as("authenticated", ADMIN, () => assert.rejects(rollover(first, name, reason), /Invalid season/));
  const next = await as("authenticated", ADMIN, () => rollover(first));
  await as("authenticated", ADMIN, () => assert.rejects(rollover(first), /Season changed/));
  const audit = await as("authenticated", ADMIN, () => rpc<Array<{ id: string; created_by: string; transition_reason: string }>>("public.admin_rank_seasons()"));
  assert.equal(audit[0].id, next); assert.equal(audit[0].created_by, ADMIN); assert.equal(audit[0].transition_reason, "Scheduled transition");
  const before = await row();
  await assert.rejects(record(1, randomUUID(), "1960-01-01", "1960-01-02"), /No season/);
  const invalidId = randomUUID(), invalid = JSON.stringify([{ userId: A, score: 10, maxTile: 64 }, { userId: B, score: 10, maxTile: 3 }]);
  const write = (body = payload) => rpc("public.record_match($1,'2026-10-15','2026-10-16','surrender',1::smallint,$2::jsonb,'ranked')", [invalidId, body]);
  await as("authenticated", A, () => assert.rejects(write(), /permission denied/));
  await as("service_role", "", () => assert.rejects(write(invalid), /check constraint/));
  assert.deepEqual(await row(), before);
  assert.equal((await db.query("select id from public.matches where id=$1", [invalidId])).rows.length, 0);
  for (const body of [JSON.stringify([{ userId: A }, { userId: A }]), JSON.stringify([{ userId: A }, { userId: null }])]) await as("service_role", "", () => assert.rejects(write(body), /distinct authenticated/));
  await db.query("update auth.users set is_anonymous=true where id=$1", [B]);
  await as("service_role", "", () => assert.rejects(write(), /distinct authenticated/));
  await db.query("update auth.users set is_anonymous=false where id=$1", [B]);
  await as("authenticated", A, () => assert.rejects(db.query("update public.season_ratings set rating=99999"), /permission denied/));
  await as("authenticated", A, () => assert.rejects(db.query("update public.player_ratings set rating=99999"), /permission denied/));
  await as("anon", "", async () => assert.equal((await db.query("select id from public.rank_seasons")).rows.length, 2));
  assert.equal(await record(1, invalidId), true);
  assert.equal((await row()).games_played, 0); assert.equal((await row()).placement_games, 2);
});
