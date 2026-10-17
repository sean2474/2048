import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import type { AdminOverview, AdminPlayersResult, AdminPlayerDetail } from "schema/admin";

const ADMIN = "11111111-1111-4111-8111-111111111111";
const A = "22222222-2222-4222-8222-222222222222";
const B = "33333333-3333-4333-8333-333333333333";
const zero = { moves: 0, charged: { xblock: 0, hardblock: 0 }, sent: { xblock: 0, hardblock: 0 }, received: { xblock: 0, hardblock: 0 } };
async function database(t: TestContext) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', is_anonymous boolean default false);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;`);
  const migrations = new URL("../../../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(migrations)).filter(file => file.endsWith(".sql")).sort()) await db.exec(await readFile(new URL(file, migrations), "utf8"));
  await db.query(`insert into auth.users(id,email,raw_user_meta_data) values
    ($1,'admin@example.test','{"name":"Admin"}'), ($2,'literal_%@example.test','{"name":"한글 🧩 O''Brien","role":"admin"}'), ($3,'bob@example.test','{"name":"Bob"}')`, [ADMIN, A, B]);
  await db.query("insert into public.admin_roles(user_id) values($1)", [ADMIN]);
  const as = async <T>(role: "anon" | "authenticated" | "service_role", id: string, fn: () => Promise<T>) => {
    await db.exec(`set role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.aal','aal2',false)", [id]);
    try { return await fn(); } finally { await db.exec("reset role"); }
  };
  const rpc = async <T>(sql: string, args: unknown[] = []) => (await db.query<{ value: T }>(`select ${sql} as value`, args)).rows[0].value;
  const record = (id: string, telemetry: unknown = undefined, mode = "ranked", age = 0, secondTelemetry: unknown = zero) =>
    as("service_role", "", () => rpc<boolean>("public.record_match($1, now() - make_interval(days => $4::integer) - interval '60 seconds', now() - make_interval(days => $4::integer), 'surrender', 1::smallint, $2::jsonb, $3)", [id, JSON.stringify([{ userId: A, score: 100, maxTile: 64, telemetry }, { userId: B, score: 20, maxTile: 16, telemetry: secondTelemetry }]), mode, age]));
  return { db, as, rpc, record };
}

test("admin RPCs require database membership; profile grants cannot elevate roles or suspension", async t => {
  const { db, as, rpc } = await database(t);
  await as("anon", "", async () => {
    await assert.rejects(rpc("public.is_game_admin()"), /permission denied/);
    await assert.rejects(rpc("public.admin_overview()"), /permission denied/);
  });
  await as("authenticated", A, async () => {
    assert.equal(await rpc("public.is_game_admin()"), false);
    for (const sql of ["public.admin_overview()", "public.admin_players()", `public.admin_player('${B}')`, `public.admin_set_suspension('${B}',true,'reason')`]) await assert.rejects(rpc(sql), /Admin access required/);
    await assert.rejects(db.query("insert into public.admin_roles(user_id) values($1)", [A]), /permission denied/);
    await assert.rejects(db.query("select * from public.admin_roles"), /permission denied/);
    await assert.rejects(db.query("update public.players set suspended_at=now() where id=$1", [A]), /permission denied/);
    await db.query("update public.players set name='Changed' where id=$1", [A]);
    await assert.rejects(db.query("select * from public.admin_audit"), /permission denied/);
    await assert.rejects(rpc("private.record_match_base(null,null,null,null,null,null,null)"), /permission denied/);
  });
  await as("authenticated", ADMIN, async () => {
    assert.equal(await rpc("public.is_game_admin()"), true);
    const empty = await rpc<AdminOverview>("public.admin_overview()");
    assert.equal(empty.totals.matches, 0); assert.equal(empty.totals.avgMoves, null);
    assert.deepEqual(empty.modes, []); assert.equal(empty.daily.length, 31); assert.ok(empty.daily.every(day => day.matches === 0));
    const literal = await rpc<AdminPlayersResult>("public.admin_players($1,0)", ["_%"]);
    assert.equal(literal.total, 1); assert.equal(literal.players[0].id, A);
    assert.equal((await rpc<AdminPlayersResult>("public.admin_players($1,0)", ["' OR 1=1 --"])).total, 0);
    assert.equal((await rpc<AdminPlayersResult>("public.admin_players('',999)")).players.length, 0);
    for (const [q, offset] of [["x".repeat(101), 0], ["", -1], [null, 0], ["", null]]) await assert.rejects(rpc("public.admin_players($1,$2)", [q, offset]), /Invalid player search/);
    for (const args of [[0, "all"], [91, "all"], [30, "legacy"], [null, "all"], [30, null]]) await assert.rejects(rpc("public.admin_overview($1,$2)", args), /Invalid overview filter/);
    await assert.rejects(rpc("public.admin_player($1)", [randomUUID()]), /Player not found/);
  });
  await db.exec("insert into auth.users(id,email) select gen_random_uuid(),'page-' || n || '@example.test' from generate_series(1,55) n");
  await as("authenticated", ADMIN, async () => {
    const page = await rpc<AdminPlayersResult>("public.admin_players('page-',0)");
    assert.equal(page.total, 55); assert.equal(page.players.length, 50);
    assert.equal((await rpc<AdminPlayersResult>("public.admin_players('page-',50)")).players.length, 5);
  });
});

test("suspension is atomic, audited, idempotent, and protects administrators", async t => {
  const { db, as, rpc } = await database(t);
  await as("authenticated", ADMIN, async () => {
    for (const reason of ["", " ", "x".repeat(501), null]) await assert.rejects(rpc("public.admin_set_suspension($1,true,$2)", [A, reason]), /Invalid suspension request/);
    await assert.rejects(rpc("public.admin_set_suspension($1,null,'reason')", [A]), /Invalid suspension request/);
    await assert.rejects(rpc("public.admin_set_suspension($1,true,'reason')", [ADMIN]), /Administrators cannot be suspended/);
    await rpc("public.admin_set_suspension($1,true,$2)", [A, "스팸 🧩 O'Brien"]);
    await rpc("public.admin_set_suspension($1,true,'repeat')", [A]);
    let detail = await rpc<AdminPlayerDetail>("public.admin_player($1)", [A]);
    assert.ok(detail.player.suspendedAt); assert.equal(detail.player.suspensionReason, "스팸 🧩 O'Brien");
    assert.deepEqual(detail.audit.map(a => [a.actorId, a.action, a.reason]), [[ADMIN, "suspend", "스팸 🧩 O'Brien"]]);
    await rpc("public.admin_set_suspension($1,false,'appeal accepted')", [A]);
    detail = await rpc<AdminPlayerDetail>("public.admin_player($1)", [A]);
    assert.equal(detail.player.suspendedAt, null); assert.equal(detail.player.suspensionReason, null); assert.equal(detail.audit.length, 2);
    await assert.rejects(db.query("update public.admin_audit set reason='forged'"), /permission denied/);
  });
  await db.query("insert into public.admin_roles(user_id) values($1)", [B]);
  await as("authenticated", ADMIN, () => assert.rejects(rpc("public.admin_set_suspension($1,true,'reason')", [B]), /Administrators cannot be suspended/));
  assert.equal((await db.query("select * from public.admin_audit")).rows.length, 2);
});

test("telemetry remains nullable, validates atomically, deduplicates and powers measured balance aggregates", async t => {
  const { db, as, rpc, record } = await database(t);
  const measured = { moves: 10, charged: { xblock: 3, hardblock: 1 }, sent: { xblock: 2, hardblock: 1 }, received: { xblock: 1, hardblock: 0 } };
  const id = randomUUID();
  assert.equal(await record(id, measured), true);
  assert.equal(await record(id, zero), false);
  assert.deepEqual((await db.query<{ telemetry: unknown }>("select telemetry from public.match_participants where match_id=$1 and slot=1", [id])).rows[0].telemetry, measured);
  await record(randomUUID(), undefined, "casual", 0, null);
  await record(randomUUID(), zero, "friend");
  await record(randomUUID(), measured, "ranked", 50);
  const before = (await db.query("select * from public.player_ratings order by player_id")).rows;
  const invalids = [{}, [], { ...zero, moves: -1 }, { ...zero, moves: 1.5 }, { ...zero, moves: "1" }, { ...zero, moves: 1_000_000_001 }, { ...zero, sent: { xblock: 0 } }, { ...zero, charged: { xblock: null, hardblock: 0 } }, { ...zero, extra: true }, { ...zero, sent: { xblock: 0, hardblock: 0, extra: 1 } }];
  for (const bad of invalids) {
    const badId = randomUUID();
    await assert.rejects(record(badId, bad), /Invalid match telemetry/);
    assert.equal((await db.query("select * from public.matches where id=$1", [badId])).rows.length, 0);
  }
  assert.deepEqual((await db.query("select * from public.player_ratings order by player_id")).rows, before);
  await as("authenticated", ADMIN, async () => {
    const overview = await rpc<AdminOverview>("public.admin_overview(30,'all')");
    assert.equal(overview.totals.matches, 3); assert.equal(overview.totals.rankedMatches, 1);
    assert.equal(overview.totals.telemetryParticipants, 4); assert.equal(overview.totals.unmeasuredParticipants, 2);
    assert.equal(overview.totals.avgMoves, 2.5); assert.equal(overview.totals.avgScore, 60); assert.equal(overview.totals.avgDurationSeconds, 60);
    assert.deepEqual(overview.attacks, [
      { type: "xblock", charged: 3, sent: 2, received: 1, participantsWhoSent: 1, winsWhenSent: 1 },
      { type: "hardblock", charged: 1, sent: 1, received: 0, participantsWhoSent: 1, winsWhenSent: 1 },
    ]);
    assert.equal((await rpc<AdminOverview>("public.admin_overview(90,'ranked')")).totals.matches, 2);
    const casual = await rpc<AdminOverview>("public.admin_overview(30,'casual')");
    assert.equal(casual.totals.avgMoves, null); assert.equal(casual.totals.unmeasuredParticipants, 2);
    const detail = await rpc<AdminPlayerDetail>("public.admin_player($1)", [A]);
    assert.equal(detail.matches.length, 4); assert.equal(detail.matches.find(match => match.id === id)?.telemetry?.moves, 10);
    assert.equal(detail.player.gamesPlayed, 2); assert.equal(detail.player.email, "literal_%@example.test");
  });
  const maximum = { moves: 1_000_000_000, charged: { xblock: 1_000_000_000, hardblock: 1_000_000_000 }, sent: { xblock: 1_000_000_000, hardblock: 1_000_000_000 }, received: { xblock: 1_000_000_000, hardblock: 1_000_000_000 } };
  assert.equal(await record(randomUUID(), maximum, "casual"), true);
  // Six-argument deliveries from old durable outboxes still succeed without telemetry or rating changes.
  await as("service_role", "", () => rpc("public.record_match($1,now(),now(),'draw',null,$2::jsonb)", [randomUUID(), JSON.stringify([{ userId: A, score: 0, maxTile: 2 }, { userId: B, score: 0, maxTile: 2 }])]));
  assert.deepEqual((await db.query("select * from public.player_ratings order by player_id")).rows, before);
});
