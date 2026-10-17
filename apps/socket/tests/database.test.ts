import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { createSupabaseServices } from "../src/supabase";
import { MatchRecordSchema } from "schema/results";
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const MATCH = "44444444-4444-4444-8444-444444444444";

test("rating tiers use stable boundaries and legacy records default to casual", async () => {
  const { INITIAL_RATING, PLACEMENT_GAMES, SEASON_QUALIFYING_GAMES, ratingTier } = await import("schema/ranking");
  assert.equal(INITIAL_RATING, 1200);
  assert.equal(PLACEMENT_GAMES, 10);
  assert.equal(SEASON_QUALIFYING_GAMES, 10);
  assert.deepEqual([-50, 999, 1000, 1199, 1200, 1399, 1400, 1599, 1600, 1799, 1800, 10000].map(ratingTier),
    ["Bronze", "Bronze", "Silver", "Silver", "Gold", "Gold", "Platinum", "Platinum", "Diamond", "Diamond", "Master", "Master"]);
  const record = { id: MATCH, startedAt: "2026-10-15T01:00:00Z", endedAt: "2026-10-15T01:05:00Z", reason: "surrender", winnerSlot: 1,
    participants: [{ userId: A, score: 10, maxTile: 8 }, { userId: B, score: 0, maxTile: 2 }] };
  assert.equal(MatchRecordSchema.parse(record).mode, "casual");
  assert.equal(MatchRecordSchema.parse({ ...record, mode: "ranked" }).mode, "ranked");
  for (const mode of [null, "", "legacy", 1, "ranked\u200b"]) assert.equal(MatchRecordSchema.safeParse({ ...record, mode }).success, false);
});

test("Supabase services read authoritative ratings, fail closed, and send explicit modes", async t => {
  const rank = { tier: null, placement_games: 0 };
  const earnedRank = { tier: "Platinum", placement_games: 10 };
  let body: unknown = [], status = 200, profileName = "플레이어 🧩 O'Brien";
  let preferences: unknown = [{ icon_id: "dragon", skin_id: "dawn-oath" }], preferencesStatus = 200;
  const requests: { url: string; body?: string }[] = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), body: init?.body as string | undefined });
    if (body instanceof Error) throw body;
    if (String(input).includes("/rest/v1/player_preferences")) return new Response(JSON.stringify(preferences), { status: preferencesStatus, headers: { "Content-Type": "application/json" } });
    if (String(input).includes("/rest/v1/player_ratings") && body && typeof body === "object" && "id" in body) return new Response(JSON.stringify([{ rating: 1420, ...earnedRank }]), { status: 200, headers: { "Content-Type": "application/json" } });
    if (String(input).includes("/rest/v1/players") && status === 200) return new Response(JSON.stringify({ name: profileName }), { status, headers: { "Content-Type": "application/json" } });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
  assert.deepEqual(createSupabaseServices({}), {});
  const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY: "public-test-key" };
  assert.equal(createSupabaseServices(env).readRating, undefined);
  const services = createSupabaseServices({ ...env, SUPABASE_SECRET_KEY: "server-test-key" });
  assert.ok(services.readRating && services.writeMatch && services.resolveAccount);
  body = { id: A, user_metadata: { name: "  플레이어 🧩 O'Brien  " } };
  assert.deepEqual(await services.resolveAccount("test-access-token"), { id: A, name: "플레이어 🧩 O'Brien", iconId: "dragon", skinId: "dawn-oath", rating: 1420, rank: earnedRank });
  assert.equal(new URL(requests.find(request => request.url.includes("/player_preferences"))!.url).searchParams.get("select"), "icon_id,skin_id");
  body = { id: A, user_metadata: { name: "  " } };
  profileName = "새 닉네임";
  assert.deepEqual(await services.resolveAccount("test-access-token"), { id: A, name: "새 닉네임", iconId: "dragon", skinId: "dawn-oath", rating: 1420, rank: earnedRank });
  preferences = [{ icon_id: "catalog-panda-2026", skin_id: "catalog-crystal-2026" }];
  const catalogAccount = await services.resolveAccount("test-access-token");
  assert.equal(catalogAccount.iconId, "catalog-panda-2026", "Database-authorized icons do not require a socket deployment");
  assert.equal(catalogAccount.skinId, "catalog-crystal-2026", "Database-authorized skins do not require a socket deployment");
  for (const row of [[], [{ icon_id: "dragon" }], [{ icon_id: "dragon", skin_id: "../unknown" }], [{ icon_id: "dragon", skin_id: "x".repeat(65) }]]) {
    preferences = row;
    assert.equal((await services.resolveAccount("test-access-token")).skinId, "classic");
  }
  for (const icon_id of [null, "../fox", "Fox", "fox\u200b", "x".repeat(65)]) {
    preferences = [{ icon_id, skin_id: "classic" }];
    assert.equal((await services.resolveAccount("test-access-token")).iconId, "fox");
  }
  preferences = { code: "42501", message: "access denied" }; preferencesStatus = 403;
  assert.equal((await services.resolveAccount("test-access-token")).skinId, "classic");
  body = { id: A, is_anonymous: true };
  await assert.rejects(services.resolveAccount("test-access-token"), /invalid_account/);
  body = { message: "invalid token" }; status = 401;
  await assert.rejects(services.resolveAccount("test-access-token"), /invalid_account/);
  body = []; status = 200;
  assert.deepEqual(await services.readRating(A), { rating: 1200, rank });
  assert.equal(new URL(requests.at(-1)!.url).searchParams.get("select"), "rating,tier,placement_games");
  body = [{ rating: 1440 }];
  assert.deepEqual(await services.readRating(A), { rating: 1440, rank });
  body = { code: "42501", message: "access denied" }; status = 403;
  await assert.rejects(services.readRating(A), /Rating lookup failed/);
  body = new Error("offline");
  await assert.rejects(services.readRating(A), /Rating lookup failed/);
  body = true; status = 200;
  const record = MatchRecordSchema.parse({ id: MATCH, startedAt: "2026-10-15T01:00:00Z", endedAt: "2026-10-15T01:05:00Z", reason: "surrender", winnerSlot: 1,
    participants: [{ userId: A, score: 10, maxTile: 8 }, { userId: B, score: 0, maxTile: 2 }] });
  await services.writeMatch({ ...record, mode: "ranked" });
  assert.equal(JSON.parse(requests.at(-1)!.body!).p_mode, "ranked");
  const { mode: _mode, ...legacy } = record;
  await services.writeMatch(legacy);
  assert.equal(JSON.parse(requests.at(-1)!.body!).p_mode, "casual");
  body = { code: "23514", message: "invalid" }; status = 400;
  await assert.rejects(services.writeMatch(record), /Match storage failed/);
});

async function database(t: TestContext) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', is_anonymous boolean default false);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `);
  return db;
}

test("migrations enforce RLS, atomic/idempotent results, rankings and Realtime publication", async t => {
  const db = await database(t);
  const migrations = new URL("../../../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(migrations)).filter(file => file.endsWith(".sql")).sort()) {
    await db.exec(await readFile(new URL(file, migrations), "utf8"));
  }
  await db.query("insert into auth.users (id, raw_user_meta_data) values ($1, '{\"name\":\"Alice\"}'), ($2, '{\"name\":\"Bob\"}'), ($3, '{\"name\":\"Other\"}')", [A, B, C]);
  assert.equal((await db.query("select * from public.players")).rows.length, 3);
  const payload = JSON.stringify([{ userId: A, score: 4096, maxTile: 2048 }, { userId: B, score: 1024, maxTile: 512 }]);
  const rpc = "select public.record_match($1::uuid, '2026-10-15T01:00:00Z', '2026-10-15T01:05:00Z', 'reached_1024', 1::smallint, $2::jsonb) as inserted";
  const rankedRpc = "select public.record_match($1::uuid, '2026-10-15T01:00:00Z', '2026-10-15T01:05:00Z', 'reached_1024', 1::smallint, $2::jsonb, 'ranked') as inserted";
  async function as(role: string, id: string, fn: () => Promise<void>) {
    await db.exec(`set role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.aal', 'aal2', false)", [id]);
    try { await fn(); } finally { await db.exec("reset role"); }
  }
  await as("anon", "", async () => {
    await assert.rejects(db.query(rpc, [MATCH, payload]), /permission denied/);
    await assert.rejects(db.query("select * from public.matches"), /permission denied/);
    assert.deepEqual((await db.query("select * from public.player_stats")).rows, []);
  });
  await as("authenticated", A, async () => {
    assert.equal((await db.query("select * from public.players")).rows.length, 1);
    await assert.rejects(db.query(rpc, [MATCH, payload]), /permission denied/);
    await assert.rejects(db.query("insert into public.player_stats(player_id, display_name, wins) values ($1, 'Cheater', 99)", [A]), /permission denied/);
  });
  await as("service_role", "", async () => {
    assert.equal((await db.query<{ inserted: boolean }>(rankedRpc, [MATCH, payload])).rows[0].inserted, true);
    assert.equal((await db.query<{ inserted: boolean }>(rankedRpc, [MATCH, payload])).rows[0].inserted, false);
  });
  assert.equal((await db.query("select * from public.matches")).rows.length, 1);
  assert.equal((await db.query("select * from public.match_participants")).rows.length, 2);
  const stats = (await db.query<{ wins: number; losses: number; games_played: number }>("select * from public.player_stats where player_id=$1", [A])).rows[0];
  assert.equal(stats.wins, 1); assert.equal(stats.games_played, 1);
  assert.deepEqual((await db.query("select player_id, rating, wins, losses, games_played from public.player_ratings order by player_id")).rows, [
    { player_id: A, rating: 1216, wins: 1, losses: 0, games_played: 1 },
    { player_id: B, rating: 1184, wins: 0, losses: 1, games_played: 1 },
  ]);
  assert.deepEqual((await db.query("select rating_before, rating_after, rating_delta from public.match_participants where match_id=$1 order by slot", [MATCH])).rows, [
    { rating_before: 1200, rating_after: 1216, rating_delta: 16 },
    { rating_before: 1200, rating_after: 1184, rating_delta: -16 },
  ]);
  await as("anon", "", async () => {
    assert.equal((await db.query("select * from public.player_ratings")).rows.length, 2);
    await assert.rejects(db.query("update public.player_ratings set rating=99999"), /permission denied/);
  });
  await as("authenticated", A, async () => {
    await assert.rejects(db.query(rankedRpc, [randomUUID(), payload]), /permission denied/);
    await assert.rejects(db.query("insert into public.player_ratings(player_id,display_name,rating) values ($1,'Cheater',99999)", [C]), /permission denied/);
  });
  await as("authenticated", A, async () => {
    assert.equal((await db.query("select * from public.matches")).rows.length, 1);
    assert.equal((await db.query("select * from public.match_participants")).rows.length, 2);
  });
  await as("authenticated", C, async () => {
    assert.equal((await db.query("select * from public.matches")).rows.length, 0);
    assert.equal((await db.query("select * from public.match_participants")).rows.length, 0);
  });
  // If either participant is invalid, even the match header and winner's stats roll back.
  const badMatch = "55555555-5555-4555-8555-555555555555";
  const invalid = JSON.stringify([{ userId: A, score: 12, maxTile: 8 }, { userId: B, score: -1, maxTile: 4 }]);
  await as("service_role", "", async () => { await assert.rejects(db.query(rankedRpc, [badMatch, invalid]), /constraint/); });
  assert.equal((await db.query("select * from public.matches where id=$1", [badMatch])).rows.length, 0);
  assert.equal((await db.query<{ wins: number }>("select wins from public.player_stats where player_id=$1", [A])).rows[0].wins, 1);
  assert.equal((await db.query<{ rating: number }>("select rating from public.player_ratings where player_id=$1", [A])).rows[0].rating, 1216);
  const casual = "66666666-6666-4666-8666-666666666666";
  await as("service_role", "", async () => { await db.query(rpc, [casual, JSON.stringify([{ userId: A, score: 4096, maxTile: 2048 }, { userId: null, score: 0, maxTile: 2 }])]); });
  assert.equal((await db.query<{ ranked: boolean }>("select ranked from public.matches where id=$1", [casual])).rows[0].ranked, false);
  assert.equal((await db.query<{ wins: number }>("select wins from public.player_stats where player_id=$1", [A])).rows[0].wins, 1);
  const friend = randomUUID(), authenticatedCasual = randomUUID();
  await as("service_role", "", async () => {
    await db.query(rpc, [authenticatedCasual, payload]);
    await db.query(rankedRpc.replace("'ranked'", "'friend'"), [friend, payload]);
  });
  assert.deepEqual((await db.query("select mode,ranked from public.matches where id=$1", [friend])).rows, [{ mode: "friend", ranked: false }]);
  assert.deepEqual((await db.query("select mode,ranked from public.matches where id=$1", [authenticatedCasual])).rows, [{ mode: "casual", ranked: false }]);
  assert.deepEqual((await db.query("select rating_before,rating_after,rating_delta from public.match_participants where match_id=$1", [friend])).rows, [
    { rating_before: null, rating_after: null, rating_delta: null }, { rating_before: null, rating_after: null, rating_delta: null },
  ]);
  assert.equal((await db.query<{ rating: number }>("select rating from public.player_ratings where player_id=$1", [A])).rows[0].rating, 1216);

  await db.query("update auth.users set is_anonymous=true where id=$1", [C]);
  for (const secondId of [null, A, C]) {
    const id = randomUUID();
    const participants = JSON.stringify([{ userId: A, score: 10, maxTile: 8 }, { userId: secondId, score: 0, maxTile: 2 }]);
    await as("service_role", "", async () => { await assert.rejects(db.query(rankedRpc, [id, participants]), /distinct authenticated/); });
    assert.deepEqual((await db.query("select id from public.matches where id=$1", [id])).rows, []);
  }
  await as("service_role", "", async () => {
    await assert.rejects(db.query(rankedRpc.replace("'ranked'", "'unknown'"), [randomUUID(), payload]), /Invalid match mode/);
    await assert.rejects(db.query(rankedRpc, [randomUUID(), "null"]), /Exactly two/);
    await assert.rejects(db.query(rankedRpc, [randomUUID(), "[]"]), /Exactly two/);
    const draw = "select public.record_match($1::uuid, '2026-10-15T01:00:00Z', '2026-10-15T01:05:00Z', 'draw', null, $2::jsonb, 'ranked')";
    await db.query(draw, [randomUUID(), payload]);
  });
  // Equal and opposite rounded deltas apply to draws, including unequal ratings.
  assert.deepEqual((await db.query("select rating,draws,games_played from public.player_ratings order by player_id")).rows, [
    { rating: 1215, draws: 1, games_played: 2 }, { rating: 1185, draws: 1, games_played: 2 },
  ]);
  await as("service_role", "", async () => {
    const id = randomUUID();
    const outcomes = await Promise.all([db.query<{ inserted: boolean }>(rankedRpc, [id, payload]), db.query<{ inserted: boolean }>(rankedRpc, [id, payload])]);
    assert.deepEqual(outcomes.map(result => result.rows[0].inserted).sort(), [false, true]);
    const reversed = JSON.stringify([{ userId: B, score: 4096, maxTile: 2048 }, { userId: A, score: 0, maxTile: 2 }]);
    await Promise.all([db.query(rankedRpc, [randomUUID(), payload]), db.query(rankedRpc, [randomUUID(), reversed])]);
  });
  assert.deepEqual((await db.query("select sum(rating)::integer as total, sum(games_played)::integer as games from public.player_ratings")).rows, [{ total: 2400, games: 10 }]);
  const published = (await db.query<{ tablename: string }>("select tablename from pg_publication_tables where pubname='supabase_realtime'")).rows.map(row => row.tablename).sort();
  assert.deepEqual(published, ["direct_messages", "friendships", "match_participants", "player_ratings", "player_stats"]);
});

test("Elo migration preserves historical games and statistics without awarding retroactive ratings", async t => {
  const db = await database(t);
  const migrations = new URL("../../../supabase/migrations/", import.meta.url);
  const files = (await readdir(migrations)).filter(file => file.endsWith(".sql")).sort();
  const eloFile = files.find(file => file.endsWith("_ranked_elo.sql"))!;
  for (const file of files.filter(file => file < eloFile)) await db.exec(await readFile(new URL(file, migrations), "utf8"));
  await db.query("insert into auth.users (id,raw_user_meta_data) values ($1, '{\"name\":\"기존 🧩\"}'), ($2, '{}')", [A, B]);
  const participants = JSON.stringify([{ userId: A, score: 10, maxTile: 8 }, { userId: B, score: 0, maxTile: 2 }]);
  const rpc = "select public.record_match($1::uuid, '2026-10-15T01:00:00Z', '2026-10-15T01:05:00Z', 'surrender', 1::smallint, $2::jsonb)";
  await db.query(rpc, [MATCH, participants]);
  const before = (await db.query("select * from public.player_stats order by player_id")).rows;
  for (const file of files.filter(file => file >= eloFile)) await db.exec(await readFile(new URL(file, migrations), "utf8"));
  assert.deepEqual((await db.query("select * from public.player_stats order by player_id")).rows, before);
  assert.deepEqual((await db.query("select mode,ranked from public.matches where id=$1", [MATCH])).rows, [{ mode: "legacy", ranked: true }]);
  assert.deepEqual((await db.query("select * from public.player_ratings")).rows, []);
  await db.query(rpc, [randomUUID(), participants]);
  assert.deepEqual((await db.query("select * from public.player_stats order by player_id")).rows, before);
  assert.deepEqual((await db.query("select * from public.player_ratings")).rows, []);
});
