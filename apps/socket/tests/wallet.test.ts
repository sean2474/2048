import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { ABILITIES, DEFAULT_ABILITY_ID, MAX_COIN_BALANCE, RETIRED_ABILITY_IDS, SKINS, SKIN_RARITIES } from "schema/loadout";
import { messages } from "../../web/src/lib/i18n/messages";
import { achievementMessages } from "../../web/src/lib/i18n/achievement-messages";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

test("loadout catalog keeps free skins and five localized active abilities without prices", () => {
  assert.deepEqual(SKINS.slice(0, 3).map(skin => skin.id), ["classic", "slate", "paper"]);
  assert.equal(new Set(SKINS.map(skin => skin.id)).size, SKINS.length);
  assert.deepEqual([...new Set(SKINS.map(skin => skin.rarity))], Object.keys(SKIN_RARITIES));
  assert.ok(SKINS.filter(skin => skin.rarity === "legendary").every(skin => skin.tokens.character));
  assert.ok(SKINS.every(skin => skin.price === 0));
  for (const skin of SKINS) for (const text of [skin.name, skin.description]) assert.ok(messages[text] ?? achievementMessages[text], `Missing Korean skin copy: ${text}`);
  assert.deepEqual(SKINS[0].tokens, { boardBackground: "#cbc5b6", emptyBackground: "#e1dccf", tileRadius: "0.5rem" });
  assert.equal(new Set(ABILITIES.map(ability => ability.id)).size, ABILITIES.length);
  assert.deepEqual(ABILITIES.map(ability => ability.id), ["clear-x", "spawn-pause", "frost-wave", "anchor-tile", "swap-32"]);
  assert.equal(DEFAULT_ABILITY_ID, "clear-x");
  assert.ok(ABILITIES.every(ability => !RETIRED_ABILITY_IDS.includes(ability.id)));
  assert.ok(ABILITIES.every(ability => ability.status === "active" && ability.price === null));
  for (const ability of ABILITIES) for (const text of [ability.name, ability.summary, ability.role, ability.description, ability.tradeoff]) assert.ok(messages[text], `Missing Korean copy: ${text}`);
});

test("wallets backfill and initialize at zero, enforce own reads, reject client writes and constrain balances", async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', is_anonymous boolean default false);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;`);
  const migrations = new URL("../../../supabase/migrations/", import.meta.url);
  const walletMigration = "20261015161423_player_wallets.sql";
  for (const file of (await readdir(migrations)).filter(file => file.endsWith(".sql") && file < walletMigration).sort()) {
    await db.exec(await readFile(new URL(file, migrations), "utf8"));
  }
  await db.query("insert into auth.users(id) values($1),($2)", [A, B]);
  await db.exec(await readFile(new URL(walletMigration, migrations), "utf8"));
  assert.deepEqual((await db.query("select player_id,balance::text from public.player_wallets order by player_id")).rows,
    [{ player_id: A, balance: "0" }, { player_id: B, balance: "0" }]);
  await db.query("insert into auth.users(id,raw_user_meta_data) values($1,'{\"balance\":999999,\"coins\":999999}')", [C]);
  assert.equal((await db.query<{ balance: string }>("select balance::text from public.player_wallets where player_id=$1", [C])).rows[0].balance, "0");

  async function as(role: "anon" | "authenticated", id: string, action: () => Promise<void>) {
    await db.exec(`set role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    try { await action(); } finally { await db.exec("reset role"); }
  }
  await as("anon", "", async () => {
    await assert.rejects(db.query("select * from public.player_wallets"), /permission denied/);
    await assert.rejects(db.query("insert into public.player_wallets(player_id,balance) values($1,500)", [A]), /permission denied/);
  });
  await as("authenticated", A, async () => {
    assert.deepEqual((await db.query("select player_id,balance::text from public.player_wallets")).rows, [{ player_id: A, balance: "0" }]);
    assert.deepEqual((await db.query("select * from public.player_wallets where player_id=$1", [B])).rows, []);
    await assert.rejects(db.query("update public.player_wallets set balance=999999 where player_id=$1", [A]), /permission denied/);
    await assert.rejects(db.query("insert into public.player_wallets(player_id,balance) values($1,999999) on conflict(player_id) do update set balance=excluded.balance", [A]), /permission denied/);
    await assert.rejects(db.query("delete from public.player_wallets where player_id=$1", [A]), /permission denied/);
    await assert.rejects(db.query("select private.initialize_player_wallet()"), /permission denied/);
  });
  await as("authenticated", "", async () => {
    assert.deepEqual((await db.query("select * from public.player_wallets")).rows, []);
  });
  for (const balance of ["-1", "9007199254740992"]) {
    await assert.rejects(db.query("update public.player_wallets set balance=$1 where player_id=$2", [balance, A]), /check constraint/);
  }
  await assert.rejects(db.query("update public.player_wallets set balance=null where player_id=$1", [A]), /not-null constraint/);
  await db.query("update public.player_wallets set balance=$1 where player_id=$2", [String(MAX_COIN_BALANCE), A]);
  assert.equal((await db.query<{ balance: string }>("select balance::text from public.player_wallets where player_id=$1", [A])).rows[0].balance, String(MAX_COIN_BALANCE));
  await db.query("delete from auth.users where id=$1", [B]);
  assert.deepEqual((await db.query("select * from public.player_wallets where player_id=$1", [B])).rows, []);
});
