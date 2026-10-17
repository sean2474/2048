import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test, { type TestContext } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { TIERS } from "schema/ranking";
import { createAuthDatabase } from "./helpers/pglite";
import type { AchievementState } from "schema/achievements";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const GUEST = "33333333-3333-4333-8333-333333333333";
const migration = "20261017140000_rank_cosmetics.sql";
const migrations = new URL("../../../supabase/migrations/", import.meta.url);
const rewards = TIERS.map(tier => `rank-${tier.toLowerCase()}`);

async function database(t: TestContext, beforeUpgrade?: (db: PGlite) => Promise<void>) {
  const db = await createAuthDatabase(); t.after(() => db.close());
  for (const file of (await readdir(migrations)).filter(file => file.endsWith(".sql") && file < migration).sort()) {
    await db.exec(await readFile(new URL(file, migrations), "utf8"));
  }
  await db.query("insert into auth.users(id,is_anonymous) values($1,false),($2,false),($3,true)", [A, B, GUEST]);
  if (beforeUpgrade) await beforeUpgrade(db);
  await db.exec(await readFile(new URL(migration, migrations), "utf8"));
  const as = async <T>(role: "anon" | "authenticated" | "service_role", id: string, action: () => Promise<T>) => {
    await db.exec(`set role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.aal','aal2',false)", [id]);
    try { return await action(); } finally { await db.exec("reset role"); }
  };
  const state = (id = A) => as("authenticated", id, async () => (await db.query<{ state: AchievementState }>("select public.achievement_state() as state")).rows[0].state);
  const owned = async (id = A) => (await state(id)).unlocks.map(row => row.achievementId).filter(id => id.startsWith("rank-")).sort();
  return { db, as, state, owned };
}

test("rank migration backfills established season peaks and preserves existing solo constraints and progress", async t => {
  const { db, state, owned } = await database(t, async db => {
    await db.exec(`insert into public.season_ratings(season_id,player_id,display_name,rating,placement_games,tier,peak_rating)
      select id,'${A}','A',950,10,'Bronze',1800 from public.rank_seasons;
      insert into public.season_ratings(season_id,player_id,display_name,rating,placement_games,tier,peak_rating)
      select id,'${B}','B',2000,9,null,2000 from public.rank_seasons;
      alter function private.achievement_progress(uuid) rename to achievement_progress_before_fixture;
      create function private.achievement_progress(p_player uuid) returns jsonb language sql stable security definer set search_path='' as $$
        select private.achievement_progress_before_fixture(p_player)||'{"soloFixture":{"best":42}}'::jsonb $$;`);
    for (const [table, constraint, column] of [
      ["achievement_unlocks", "achievement_unlocks_achievement_id_check", "achievement_id"],
      ["player_preferences", "player_preferences_skin_id_check", "skin_id"],
      ["player_preferences", "player_preferences_icon_id_check", "icon_id"],
    ]) {
      const expression = (await db.query<{ expression: string }>("select pg_get_expr(conbin,conrelid) as expression from pg_constraint where conname=$1", [constraint])).rows[0].expression;
      await db.exec(`alter table public.${table} drop constraint ${constraint}, add constraint ${constraint} check ((${expression}) or ${column}='solo-existing-fixture')`);
    }
    await db.query("insert into public.achievement_unlocks(player_id,achievement_id) values($1,'solo-existing-fixture')", [A]);
    await db.query("insert into public.player_preferences(player_id,skin_id,icon_id) values($1,'solo-existing-fixture','solo-existing-fixture')", [A]);
  });
  assert.deepEqual(await owned(), [...rewards].sort());
  assert.equal((await state()).highestRank, 6);
  assert.deepEqual((await state() as AchievementState & { soloFixture: unknown }).soloFixture, { best: 42 });
  assert.equal((await state(B)).highestRank, 0);
  assert.deepEqual(await owned(B), []);
  assert.deepEqual((await db.query("select skin_id,icon_id from public.player_preferences where player_id=$1", [A])).rows,
    [{ skin_id: "solo-existing-fixture", icon_id: "solo-existing-fixture" }]);
  await db.query("insert into public.achievement_unlocks(player_id,achievement_id) values($1,'solo-existing-fixture')", [B]);
});

test("rank thresholds award complete sets and all lower tiers once, surviving drops and empty new seasons", async t => {
  const { db, state, owned, as } = await database(t);
  assert.equal((await state()).highestRank, 0);
  await db.exec(`insert into public.season_ratings(season_id,player_id,display_name,rating,placement_games,tier,peak_rating)
    select id,'${A}','A',999,9,null,2000 from public.rank_seasons;`);
  assert.equal((await state()).highestRank, 0);
  assert.deepEqual(await owned(), []);
  await as("authenticated", A, async () => {
    await db.query("insert into public.player_preferences(player_id) values($1)", [A]);
    await assert.rejects(db.query("update public.player_preferences set skin_id='rank-bronze' where player_id=$1", [A]), /Achievement required/);
    await assert.rejects(db.query("update public.player_preferences set icon_id='rank-master' where player_id=$1", [A]), /Achievement required/);
  });
  for (const [index, peak] of [999, 1000, 1200, 1400, 1600, 1800].entries()) {
    await db.query("update public.season_ratings set rating=$1,peak_rating=$1,placement_games=10,tier=$2 where player_id=$3", [peak, TIERS[index], A]);
    assert.equal((await state()).highestRank, index + 1);
    assert.deepEqual(await owned(), rewards.slice(0, index + 1).sort());
    await as("authenticated", A, () => db.query("update public.player_preferences set skin_id=$1,icon_id=$1 where player_id=$2", [rewards[index], A]));
    const unlockedAt = (await state()).unlocks;
    await db.query("update public.season_ratings set peak_rating=$1 where player_id=$2", [peak, A]);
    assert.deepEqual((await state()).unlocks, unlockedAt);
  }
  await db.query("update public.season_ratings set rating=500,tier='Bronze' where player_id=$1", [A]);
  await db.exec("update public.rank_seasons set ends_at='2026-10-17T00:00:00Z' where ends_at is null; insert into public.rank_seasons(name,starts_at) values('Season 2','2026-10-17T00:00:00Z');");
  await db.exec(`insert into public.season_ratings(season_id,player_id,display_name,rating,placement_games,tier,peak_rating)
    select id,'${A}','A',500,10,'Bronze',null from public.rank_seasons where ends_at is null;`);
  assert.equal((await state()).highestRank, 6);
  assert.deepEqual(await owned(), [...rewards].sort());
});

test("the tenth trusted ranked result unlocks its tier and late old-season results remain eligible", async t => {
  const { db, state, owned, as } = await database(t);
  const participants = JSON.stringify([{ userId: A, score: 16, maxTile: 8 }, { userId: B, score: 16, maxTile: 8 }]);
  let id = randomUUID();
  for (let game = 1; game <= 10; game++) {
    id = randomUUID();
    await as("service_role", "", () => db.query("select public.record_match($1,'2026-10-16T00:00:00Z','2026-10-16T00:01:00Z','draw',null,$2::jsonb,'ranked')", [id, participants]));
    assert.equal((await state()).highestRank, game === 10 ? 3 : 0);
    assert.deepEqual(await owned(), game === 10 ? rewards.slice(0, 3).sort() : []);
  }
  const before = (await state()).unlocks;
  await as("service_role", "", () => db.query("select public.record_match($1,'2026-10-16T00:00:00Z','2026-10-16T00:01:00Z','draw',null,$2::jsonb,'ranked')", [id, participants]));
  assert.deepEqual((await state()).unlocks, before);
  await db.exec("update public.rank_seasons set ends_at='2026-10-17T00:00:00Z' where ends_at is null; insert into public.rank_seasons(name,starts_at) values('Season 2','2026-10-17T00:00:00Z');");
  await db.exec("update public.player_ratings set season_id=(select id from public.rank_seasons where ends_at is null),peak_rating=null,rating=1799");
  await as("service_role", "", () => db.query("select public.record_match($1,'2026-10-16T01:00:00Z','2026-10-17T01:00:00Z','surrender',1::smallint,$2::jsonb,'ranked')", [randomUUID(), participants]));
  assert.equal((await state()).highestRank, 6);
  assert.deepEqual(await owned(), [...rewards].sort());
});

test("rank rewards remain server-owned and cannot leak or bypass purchase and achievement requirements", async t => {
  const { db, state, as } = await database(t);
  for (const [role, id] of [["anon", ""], ["authenticated", GUEST], ["authenticated", ""]] as const) {
    await as(role, id, () => assert.rejects(db.query("select public.achievement_state()"), /permission denied|Account required/));
  }
  await as("authenticated", A, async () => {
    await assert.rejects(db.query("insert into public.achievement_unlocks(player_id,achievement_id) values($1,'rank-master')", [A]), /permission denied/);
    await assert.rejects(db.query("select private.award_rank_cosmetics($1)", [A]), /permission denied/);
    await assert.rejects(db.query("update public.season_ratings set peak_rating=2000 where player_id=$1", [A]), /permission denied/);
    await assert.rejects(db.query("insert into public.player_preferences(player_id,skin_id) values($1,'rank-master')", [B]), /row-level security/);
    await assert.rejects(db.query("insert into public.player_preferences(player_id,icon_id) values($1,'rank-master')", [A]), /Achievement required/);
    await db.query("insert into public.player_preferences(player_id) values($1)", [A]);
    await assert.rejects(db.query("update public.player_preferences set skin_id='dawn-oath' where player_id=$1", [A]), /Achievement required/);
    await assert.rejects(db.query("update public.player_preferences set icon_id='owl' where player_id=$1", [A]), /Purchase required/);
    await assert.rejects(db.query("select public.purchase_cosmetic('skin','rank-master')"), /Unknown item/);
    await assert.rejects(db.query("select public.purchase_cosmetic('icon','rank-master')"), /Unknown item/);
  });
  await db.exec(`insert into public.season_ratings(season_id,player_id,display_name,rating,placement_games,tier,peak_rating)
    select id,'${B}','B',1800,10,'Master',1800 from public.rank_seasons;`);
  assert.equal((await state()).highestRank, 0);
  assert.deepEqual((await state()).unlocks, []);
  await as("authenticated", A, async () => assert.deepEqual((await db.query("select * from public.achievement_unlocks")).rows, []));
  await db.query("delete from auth.users where id=$1", [B]);
  assert.deepEqual((await db.query("select * from public.achievement_unlocks")).rows, []);
});
