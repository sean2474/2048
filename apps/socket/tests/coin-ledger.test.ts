import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const ADMIN = "11111111-1111-4111-8111-111111111111";
const A = "22222222-2222-4222-8222-222222222222";
const B = "33333333-3333-4333-8333-333333333333";
const GUEST = "44444444-4444-4444-8444-444444444444";
const directory = new URL("../../../supabase/migrations/", import.meta.url);
type Role = "anon" | "authenticated" | "service_role";
type Ledger = { delta: string; balance_after: string; reason: string; reference: Record<string, unknown>; actor_id: string | null; note: string | null };
type History = { balance: number; transactions: { id: number; delta: number; balanceAfter: number; reason: string; note: string | null; actorId: string | null }[] };

async function database(t: TestContext) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',is_anonymous boolean default false);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated,service_role; grant execute on function auth.uid() to anon,authenticated,service_role;`);
  for (const file of (await readdir(directory)).filter(file => file.endsWith(".sql")).sort()) await db.exec(await readFile(new URL(file, directory), "utf8"));
  await db.query("insert into auth.users(id,is_anonymous) values($1,false),($2,false),($3,false),($4,true)", [ADMIN, A, B, GUEST]);
  await db.query("insert into public.admin_roles(user_id) values($1)", [ADMIN]);
  const as = async <T>(role: Role, id: string, run: () => Promise<T>, aal: "aal1" | "aal2" = "aal2") => {
    await db.exec(`set role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.aal',$2,false)", [id, aal]);
    try { return await run(); } finally { await db.exec("reset role"); }
  };
  const rpc = async <T>(sql: string, args: unknown[] = []) => (await db.query<{ value: T }>(`select ${sql} as value`, args)).rows[0].value;
  const ledger = async (player: string) => (await db.query<Ledger>("select delta::text,balance_after::text,reason,reference,actor_id,note from public.coin_transactions where player_id=$1 order by id", [player])).rows;
  const balance = async (player: string) => Number((await db.query<{ balance: string }>("select balance::text from public.player_wallets where player_id=$1", [player])).rows[0].balance);
  return { db, as, rpc, ledger, balance };
}

test("daily quest credits and shop purchases write one ledger row each, inside the same transaction", async t => {
  const { db, as, rpc, ledger, balance } = await database(t);
  const instant = "2026-10-17T05:00:00Z";
  await db.query("select private.check_in_at($1,$2)", [A, instant]);
  await db.query("select private.sync_daily_quests_at($1,$2)", [A, instant]);
  await db.query("select private.sync_daily_quests_at($1,$2)", [A, instant]);
  assert.deepEqual(await ledger(A), [{ delta: "20", balance_after: "20", reason: "daily_quest", reference: { day: "2026-10-17", quests: ["check-in"] }, actor_id: null, note: null }]);
  await db.query("update public.player_wallets set balance=1000 where player_id=$1", [A]);
  const price = Number((await db.query<{ price: number }>("select price from private.cosmetic_catalog where kind='skin' and item_id='confetti'")).rows[0].price);
  assert.ok(price > 0 && price <= 1000);
  await as("authenticated", A, async () => {
    assert.equal((await rpc<{ purchased: boolean }>("public.purchase_cosmetic('skin','confetti',$1)", [price])).purchased, true);
    assert.equal((await rpc<{ purchased: boolean }>("public.purchase_cosmetic('skin','confetti',$1)", [price])).purchased, false, "a retried purchase is not charged twice");
    await assert.rejects(rpc("public.purchase_cosmetic('skin','kitty',1200)"), /Not enough coins/);
  });
  assert.equal(await balance(A), 1000 - price);
  const rows = await ledger(A);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1], { delta: String(-price), balance_after: String(1000 - price), reason: "purchase", reference: { kind: "skin", itemId: "confetti" }, actor_id: null, note: null });
  assert.deepEqual((await db.query("select balance_after::text from public.coin_transactions where player_id=$1 order by id desc limit 1", [A])).rows, [{ balance_after: String(await balance(A)) }], "the ledger tail always matches the wallet");
});

test("players read only their own ledger and can never write it", async t => {
  const { db, as, ledger } = await database(t);
  await db.query("update public.player_wallets set balance=500 where player_id=$1", [A]);
  await as("authenticated", ADMIN, () => db.query("select public.admin_adjust_coins($1,100,'Launch bonus')", [A]));
  await as("authenticated", A, async () => {
    assert.equal((await db.query("select id from public.coin_transactions")).rows.length, 1);
    await assert.rejects(db.query("insert into public.coin_transactions(player_id,delta,balance_after,reason) values($1,1000,1000,'admin_grant')", [A]), /permission denied/);
    await assert.rejects(db.query("update public.coin_transactions set delta=1000"), /permission denied/);
    await assert.rejects(db.query("delete from public.coin_transactions"), /permission denied/);
    await assert.rejects(db.query("select private.apply_coin_change($1,1000,'admin_grant')", [A]), /permission denied/);
  });
  await as("authenticated", B, async () => assert.deepEqual((await db.query("select id from public.coin_transactions")).rows, []));
  await as("anon", "", async () => assert.rejects(db.query("select id from public.coin_transactions"), /permission denied/));
  assert.equal((await ledger(A)).length, 1);
  await db.query("delete from auth.users where id=$1", [A]);
  assert.deepEqual(await ledger(A), [], "ledger rows follow account deletion");
});

test("administrators grant and deduct coins with a reason; the ledger keeps actor and note", async t => {
  const { db, as, rpc, ledger, balance } = await database(t);
  const adjust = (player: string, delta: number, reason: unknown) => rpc<{ balance: number }>("public.admin_adjust_coins($1,$2,$3)", [player, delta, reason]);
  await as("authenticated", B, async () => {
    await assert.rejects(adjust(A, 100, "not an admin"), /Admin access required/);
    await assert.rejects(rpc("public.admin_coin_history($1)", [A]), /Admin access required/);
  });
  await as("authenticated", ADMIN, async () => {
    assert.deepEqual(await adjust(A, 500, "  Event compensation  "), { balance: 500 });
    assert.deepEqual(await adjust(A, -120, "Refund reversal"), { balance: 380 });
    await assert.rejects(adjust(A, -381, "Too much"), /Not enough coins/);
    for (const [delta, reason] of [[0, "zero"], [1000001, "cap"], [-1000001, "cap"], [10, ""], [10, " "], [10, "x".repeat(501)], [10, null]] as const) await assert.rejects(adjust(A, delta, reason), /Invalid coin adjustment/);
    await assert.rejects(adjust(GUEST, 10, "guests have no wallet"), /Player not found/);
    await assert.rejects(adjust(randomUUID(), 10, "missing"), /Player not found/);
    const history = await rpc<History>("public.admin_coin_history($1)", [A]);
    assert.equal(history.balance, 380);
    assert.deepEqual(history.transactions.map(entry => [entry.delta, entry.balanceAfter, entry.reason, entry.note, entry.actorId]),
      [[-120, 380, "admin_deduct", "Refund reversal", ADMIN], [500, 500, "admin_grant", "Event compensation", ADMIN]]);
    assert.equal((await rpc<History>("public.admin_coin_history($1,1)", [A])).transactions.length, 1);
    for (const limit of [0, 101, null]) await assert.rejects(rpc("public.admin_coin_history($1,$2)", [A, limit]), /Invalid coin history request/);
    await assert.rejects(rpc("public.admin_coin_history($1)", [randomUUID()]), /Player not found/);
  });
  assert.equal(await balance(A), 380);
  assert.deepEqual((await ledger(A)).map(row => row.reason), ["admin_grant", "admin_deduct"]);
});

test("administrator role checks require a second factor (aal2)", async t => {
  const { db, as, rpc } = await database(t);
  await as("authenticated", ADMIN, async () => {
    assert.equal(await rpc("public.is_game_admin()"), false);
    await assert.rejects(rpc("public.admin_overview()"), /Admin access required/);
    await assert.rejects(rpc("public.admin_adjust_coins($1,10,'no second factor')", [A]), /Admin access required/);
    await assert.rejects(rpc("public.admin_coin_history($1)", [A]), /Admin access required/);
  }, "aal1");
  await as("authenticated", ADMIN, async () => {
    assert.equal(await rpc("public.is_game_admin()"), true);
    assert.equal((await rpc<{ balance: number }>("public.admin_adjust_coins($1,10,'verified')", [A])).balance, 10);
  });
  // PostgREST publishes the whole claim set as JSON; the aal claim is read from there too.
  // (The test shim's auth.uid() only reads the per-claim setting, so sub stays there.)
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.aal','',false), set_config('request.jwt.claims',$2,false)", [ADMIN, JSON.stringify({ sub: ADMIN, aal: "aal2", role: "authenticated" })]);
  try {
    assert.equal(await rpc("public.is_game_admin()"), true);
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: ADMIN, aal: "aal1", role: "authenticated" })]);
    assert.equal(await rpc("public.is_game_admin()"), false);
  } finally { await db.exec("reset role"); await db.query("select set_config('request.jwt.claims','',false)"); }
  await as("authenticated", B, async () => assert.equal(await rpc("public.is_game_admin()"), false));
});
