import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { MatchRecordSchema } from "schema/results";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const D = "44444444-4444-4444-8444-444444444444";
const GUEST = "55555555-5555-4555-8555-555555555555";
const migration = "20261017040000_win_1024.sql";
const currentReasonMigration = "20261017050000_current_win_reason.sql";

test("current win results reject obsolete reasons and retain tile validation", () => {
  const record = { id: randomUUID(), startedAt: "2026-10-17T00:00:00Z", endedAt: "2026-10-17T00:01:00Z", winnerSlot: 1,
    participants: [{ userId: A, score: 4096, maxTile: 1024 }, { userId: B, score: 0, maxTile: 2 }] };
  assert.equal(MatchRecordSchema.parse({ ...record, reason: "reached_1024" }).reason, "reached_1024");
  assert.equal(MatchRecordSchema.safeParse({ ...record, reason: "reached_1024", participants: [{ ...record.participants[0], maxTile: 2048 }, record.participants[1]] }).success, true);
  assert.equal(MatchRecordSchema.safeParse({ ...record, reason: "reached_2048" }).success, false);
  for (const maxTile of [null, 0, 3, 4096]) {
    assert.equal(MatchRecordSchema.safeParse({ ...record, reason: "reached_1024", participants: [{ ...record.participants[0], maxTile }, record.participants[1]] }).success, false);
  }
  assert.equal(MatchRecordSchema.safeParse({ ...record, reason: "reached_512" }).success, false);
  assert.equal(MatchRecordSchema.safeParse({ ...record, reason: "reached_1024", winnerSlot: null }).success, false);
});

test("win reason cleanup preserves results and rewards, fails safely on obsolete rows, and keeps admin guards", async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',is_anonymous boolean default false);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;`);
  const dir = new URL("../../../supabase/migrations/", import.meta.url);
  const files = (await readdir(dir)).filter(file => file.endsWith(".sql")).sort();
  for (const file of files.filter(file => file < migration)) await db.exec(await readFile(new URL(file, dir), "utf8"));
  await db.query("insert into auth.users(id,is_anonymous) values($1,false),($2,false),($3,false),($4,false),($5,true)", [A, B, C, D, GUEST]);
  const record = async (first: string, second: string | null, tile: number, reason = "surrender", mode = "casual") => {
    const id = randomUUID();
    await db.exec("set role service_role");
    try {
      const participants = [{ userId: first, score: 4096, maxTile: tile }, { userId: second, score: 0, maxTile: 2 }];
      const result = await db.query<{ inserted: boolean }>("select public.record_match($1,now(),now(),$2,1::smallint,$3::jsonb,$4) as inserted", [id, reason, JSON.stringify(participants), mode]);
      assert.equal(result.rows[0].inserted, true);
    } finally { await db.exec("reset role"); }
    return id;
  };
  const previous = await record(A, B, 2048);
  await record(B, A, 1024);
  await record(C, A, 1024, "surrender", "friend");
  await record(D, null, 1024);
  await record(GUEST, A, 1024);
  const oldMatches = (await db.query("select * from public.matches order by id")).rows;
  const oldUnlocks = (await db.query("select * from public.achievement_unlocks where player_id=$1", [A])).rows;
  for (const file of files.filter(file => file >= migration && file < currentReasonMigration)) await db.exec(await readFile(new URL(file, dir), "utf8"));
  assert.deepEqual((await db.query("select * from public.matches order by id")).rows, oldMatches);
  assert.deepEqual((await db.query("select * from public.achievement_unlocks where player_id=$1", [A])).rows, oldUnlocks);
  assert.deepEqual((await db.query("select player_id from public.achievement_unlocks where achievement_id='tile-2048-reward' order by player_id")).rows, [{ player_id: A }, { player_id: B }]);
  const unlocks = (await db.query("select * from public.achievement_unlocks order by player_id,achievement_id")).rows;
  await db.exec(await readFile(new URL(migration, dir), "utf8"));
  assert.deepEqual((await db.query("select * from public.achievement_unlocks order by player_id,achievement_id")).rows, unlocks);
  await record(C, A, 512);
  assert.deepEqual((await db.query("select * from public.achievement_unlocks where player_id=$1", [C])).rows, []);
  const current = await record(C, A, 1024, "reached_1024", "ranked");
  assert.equal((await db.query("select * from public.achievement_unlocks where player_id=$1 and achievement_id='tile-2048-reward'", [C])).rows.length, 1);
  const cleanup = await readFile(new URL(currentReasonMigration, dir), "utf8");
  const obsolete = randomUUID();
  await db.query("insert into public.matches(id,started_at,ended_at,reason,winner_slot) values($1,now(),now(),'reached_2048',1)", [obsolete]);
  const beforeFailure = (await db.query("select * from public.matches order by id")).rows;
  await assert.rejects(db.exec(cleanup), /matches_reason_check/);
  await db.exec("rollback");
  assert.deepEqual((await db.query("select * from public.matches order by id")).rows, beforeFailure, "a blocked migration must leave every row untouched");
  await db.query("delete from public.matches where id=$1", [obsolete]);
  const beforeCleanup = (await db.query("select * from public.matches order by id")).rows;
  const beforeRewards = (await db.query("select * from public.achievement_unlocks order by player_id,achievement_id")).rows;
  await db.exec(cleanup);
  assert.deepEqual((await db.query("select * from public.matches order by id")).rows, beforeCleanup);
  assert.deepEqual((await db.query("select * from public.achievement_unlocks order by player_id,achievement_id")).rows, beforeRewards);
  await assert.rejects(record(A, B, 2048, "reached_2048"), /check constraint/);
  await record(A, B, 1024, "reached_1024");
  await assert.rejects(record(A, B, 4096, "reached_1024"), /check constraint/);
  await assert.rejects(record(A, B, 1024, "reached_512"), /check constraint/);
  await db.query("insert into public.admin_roles values($1)", [A]);
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.aal','aal2',false)", [B]);
  await assert.rejects(db.query("select public.admin_matches(p_reason=>'reached_1024')"), /Admin access required/);
  await assert.rejects(db.query("select private.award_match_achievements($1)", [B]), /permission denied/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.aal','aal2',false)", [A]);
  for (const [id, reason] of [[previous, "surrender"], [current, "reached_1024"]]) {
    const result = await db.query<{ value: { matches: Array<{ id: string; reason: string }> } }>("select public.admin_matches(p_reason=>$1,p_match_id=>$2) as value", [reason, id]);
    assert.equal(result.rows[0].value.matches[0].id, id);
    assert.equal(result.rows[0].value.matches[0].reason, reason);
  }
  for (const reason of ["reached_2048", "reached_512"]) await assert.rejects(db.query("select public.admin_matches(p_reason=>$1)", [reason]), /Invalid match filter/);
});
