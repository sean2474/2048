import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { SHOP_ITEMS } from "schema/economy";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const GUEST = "33333333-3333-4333-8333-333333333333";
const migrationName = "20261017130000_cosmetic_purchases.sql";
const migrations = new URL("../../../supabase/migrations/", import.meta.url);

async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', is_anonymous boolean default false);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;`);
  for (const file of (await readdir(migrations)).filter(file => file.endsWith(".sql") && file < migrationName).sort()) {
    await db.exec(await readFile(new URL(file, migrations), "utf8"));
  }
  await db.query("insert into auth.users(id,is_anonymous) values($1,false),($2,false),($3,true)", [A, B, GUEST]);
  return db;
}

async function as<T>(db: PGlite, role: "anon" | "authenticated", id: string, action: () => Promise<T>) {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.aal','aal2',false)", [id]);
  try { return await action(); } finally { await db.exec("reset role"); }
}

type State = { balance: number; purchases: { kind: "skin" | "icon"; item_id: string }[]; purchased?: boolean };
async function state(db: PGlite) {
  return (await db.query<{ state: State }>("select public.cosmetic_state() as state")).rows[0].state;
}
async function purchase(db: PGlite, kind: unknown, id: unknown) {
  return (await db.query<{ state: State }>("select public.purchase_cosmetic($1,$2) as state", [kind, id])).rows[0].state;
}

test("shop migration resets unpaid equipment while preserving common and earned cosmetics", async t => {
  const db = await database();
  t.after(() => db.close());
  await db.query("insert into public.player_preferences(player_id,skin_id,icon_id,locale) values($1,'kitty','owl','en'),($2,'paper','fox','ko')", [A, B]);
  await db.query("insert into public.achievement_unlocks(player_id,achievement_id) values($1,'checkin-7'),($1,'checkin-30')", [GUEST]);
  await db.query("insert into public.player_preferences(player_id,skin_id,icon_id) values($1,'dawn-oath','attendance-king')", [GUEST]);
  await db.exec(await readFile(new URL(migrationName, migrations), "utf8"));
  assert.deepEqual((await db.query("select player_id,skin_id,icon_id,locale from public.player_preferences order by player_id")).rows, [
    { player_id: A, skin_id: "classic", icon_id: "fox", locale: "en" },
    { player_id: B, skin_id: "paper", icon_id: "fox", locale: "ko" },
    { player_id: GUEST, skin_id: "dawn-oath", icon_id: "attendance-king", locale: "ko" },
  ]);
  assert.deepEqual((await db.query("select kind,item_id as id,price::integer from private.cosmetic_catalog order by kind,item_id")).rows,
    [...SHOP_ITEMS].sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id)));
  assert.equal((await db.query<{ count: number }>("select count(*)::integer as count from public.achievement_unlocks")).rows[0].count, 2);
});

test("coin purchases enforce ownership, account isolation and atomic wallet updates", async t => {
  const db = await database();
  t.after(() => db.close());
  await db.exec(await readFile(new URL(migrationName, migrations), "utf8"));
  await db.query("update public.player_wallets set balance=1500 where player_id=$1", [A]);
  await db.query("insert into public.player_preferences(player_id) values($1),($2)", [A, B]);

  await t.test("anonymous callers, missing identities and anonymous auth users cannot purchase or read snapshots", async () => {
    await as(db, "anon", "", async () => {
      await assert.rejects(state(db), /permission denied/);
      await assert.rejects(purchase(db, "icon", "owl"), /permission denied/);
      await assert.rejects(db.query("select * from public.cosmetic_purchases"), /permission denied/);
    });
    for (const id of ["", GUEST, "44444444-4444-4444-8444-444444444444"]) {
      await as(db, "authenticated", id, async () => {
        await assert.rejects(state(db), /Account required/);
        await assert.rejects(purchase(db, "icon", "owl"), /Account required/);
      });
    }
  });

  await t.test("free defaults equip without rows; paid and achievement equipment fail closed", async () => {
    await as(db, "authenticated", A, async () => {
      assert.deepEqual(await state(db), { balance: 1500, purchases: [] });
      for (const item of SHOP_ITEMS.filter(item => item.price === 0)) {
        await db.query(`update public.player_preferences set ${item.kind === "skin" ? "skin_id" : "icon_id"}=$1 where player_id=$2`, [item.id, A]);
        await assert.rejects(purchase(db, item.kind, item.id), /Item is included/);
      }
      await assert.rejects(db.query("update public.player_preferences set skin_id='kitty' where player_id=$1", [A]), /Purchase required/);
      await assert.rejects(db.query("update public.player_preferences set icon_id='owl' where player_id=$1", [A]), /Purchase required/);
      await assert.rejects(db.query("update public.player_preferences set skin_id='dawn-oath' where player_id=$1", [A]), /Achievement required/);
      for (const [kind, id] of [[null, null], ["", ""], ["skin", "dawn-oath"], ["icon", "attendance-king"], ["skin", "not-real"], ["icon", "kitty"], ["skin", "owl"], ["ability", "clear-x"], ["skin", "'); drop table players; --"], ["icon", "🐱"], ["skin", 42], ["skin", "x".repeat(10_000)]]) {
        await assert.rejects(purchase(db, kind, id), /Unknown item/);
      }
      assert.deepEqual(await state(db), { balance: 1500, purchases: [] });
    });
  });

  await t.test("purchase charges the stored price once, returns ownership and permits equipping", async () => {
    await as(db, "authenticated", A, async () => {
      const bought = await purchase(db, "skin", "kitty");
      assert.deepEqual(bought, { balance: 300, purchases: [{ kind: "skin", item_id: "kitty" }], purchased: true });
      assert.deepEqual(await purchase(db, "skin", "kitty"), { ...bought, purchased: false });
      const duplicates = await Promise.all(Array.from({ length: 3 }, () => purchase(db, "icon", "owl")));
      assert.equal(duplicates.filter(result => result.purchased).length, 1);
      assert.ok(duplicates.every(result => result.balance === 150));
      await db.query("update public.player_preferences set skin_id='kitty',icon_id='owl' where player_id=$1", [A]);
      assert.deepEqual((await db.query("select skin_id,icon_id from public.player_preferences")).rows, [{ skin_id: "kitty", icon_id: "owl" }]);
      assert.deepEqual((await db.query("select price_paid::integer from public.cosmetic_purchases order by item_id")).rows, [{ price_paid: 1200 }, { price_paid: 150 }]);
    });
  });

  await t.test("accounts cannot read or forge another wallet or ownership", async () => {
    await as(db, "authenticated", B, async () => {
      assert.deepEqual(await state(db), { balance: 0, purchases: [] });
      assert.deepEqual((await db.query("select * from public.cosmetic_purchases")).rows, []);
      await assert.rejects(purchase(db, "skin", "kitty"), /Not enough coins/);
      await assert.rejects(db.query("insert into public.cosmetic_purchases(player_id,kind,item_id,price_paid) values($1,'skin','kitty',0)", [B]), /permission denied/);
      await assert.rejects(db.query("delete from public.cosmetic_purchases where player_id=$1", [A]), /permission denied/);
      await assert.rejects(db.query("update public.cosmetic_purchases set price_paid=0"), /permission denied/);
      await assert.rejects(db.query("update public.player_wallets set balance=99999"), /permission denied/);
      await assert.rejects(db.query("select * from private.cosmetic_catalog"), /permission denied/);
      await assert.rejects(db.query("insert into public.player_preferences(player_id,skin_id) values($1,'kitty')", [A]), /row-level security/);
    });
  });

  await t.test("insufficient and competing purchases cannot overdraw, and transaction rollback restores both writes", async () => {
    await as(db, "authenticated", A, async () => {
      const before = await state(db);
      await assert.rejects(purchase(db, "skin", "confetti"), /Not enough coins/);
      assert.deepEqual(await state(db), before);
      await db.exec("begin");
      assert.equal((await purchase(db, "icon", "cat")).balance, 0);
      await db.exec("rollback");
      assert.deepEqual(await state(db), before);
      const results = await Promise.allSettled([purchase(db, "icon", "cat"), purchase(db, "icon", "robot")]);
      assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
      assert.match((results.find(result => result.status === "rejected") as PromiseRejectedResult).reason.message, /Not enough coins/);
      assert.equal((await state(db)).balance, 0);
      assert.equal((await state(db)).purchases.length, 3);
    });
    await db.query("delete from auth.users where id=$1", [A]);
    assert.deepEqual((await db.query("select * from public.cosmetic_purchases where player_id=$1", [A])).rows, []);
  });

  await t.test("a missing wallet fails without ownership and safe integer balances round-trip exactly", async () => {
    await db.query("delete from public.player_wallets where player_id=$1", [B]);
    await as(db, "authenticated", B, async () => {
      await assert.rejects(purchase(db, "icon", "owl"), /Wallet unavailable/);
      assert.deepEqual((await db.query("select * from public.cosmetic_purchases")).rows, []);
    });
    await db.query("insert into public.player_wallets(player_id,balance) values($1,9007199254740991)", [B]);
    await as(db, "authenticated", B, async () => {
      assert.equal((await state(db)).balance, Number.MAX_SAFE_INTEGER);
      assert.equal((await purchase(db, "icon", "owl")).balance, Number.MAX_SAFE_INTEGER - 150);
    });
  });
});
