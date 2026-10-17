import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test, { type TestContext } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { AchievementInputSchema, CatalogSchema } from "schema/catalog";
import { achievementProgress, type AchievementState } from "schema/achievements";

const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const RUN = "33333333-3333-4333-8333-333333333333";
const directory = new URL("../../../supabase/migrations/", import.meta.url);
const catalogMigration = "20261017160000_content_catalog.sql";
const forwardMigrations = ["20261017180000_integrated_solo.sql", "20261017180001_integrated_daily_catalog.sql"];
type History = "fresh" | "staging" | "production";
const read = (name: string) => readFile(new URL(name, directory), "utf8");

async function database(t: TestContext, history: History) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',is_anonymous boolean default false);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb default '{"mimetype":"image/svg+xml"}');
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated; grant select,insert,update,delete on storage.objects to anon,authenticated;`);
  const files = (await readdir(directory)).filter(name => name.endsWith(".sql") && name < catalogMigration).sort();
  for (const name of files) {
    if (history !== "fresh" && /2026101715000[01]_/.test(name)) continue;
    // Production's 080106 creation was reverted by 080215; its solo schema is absent.
    if (history === "production" && /202610170(80304|83751|93226)_/.test(name)) continue;
    // Social was installed under 091959/092001 on staging; its SQL is the same schema.
    await db.exec(await read(name));
  }
  await db.query("insert into auth.users(id) values($1),($2)", [A, B]);
  await db.query("insert into public.admin_roles(user_id) values($1)", [A]);
  await db.query("update public.player_wallets set balance=2000 where player_id=$1", [A]);
  await db.query("insert into public.cosmetic_purchases(player_id,kind,item_id,price_paid) values($1,'skin','kitty',1200)", [A]);
  await db.query("insert into public.player_preferences(player_id,skin_id) values($1,'kitty')", [A]);
  await db.query("insert into public.achievement_unlocks(player_id,achievement_id) select $1,id from unnest(array['checkin-7','checkin-30','wins-10','tile-2048-reward','rank-bronze']) id", [A]);
  await db.exec(await read(catalogMigration));
  if (history === "production") await db.exec("update private.cosmetic_catalog set revision=2,status='draft' where item_id='storm-fox'");
  const before = (await db.query("select * from public.cosmetic_purchases order by player_id,kind,item_id")).rows;
  for (const name of forwardMigrations) await db.exec(await read(name));
  assert.deepEqual((await db.query("select * from public.cosmetic_purchases order by player_id,kind,item_id")).rows, before);
  assert.equal((await db.query<{ skin_id: string }>("select skin_id from public.player_preferences where player_id=$1", [A])).rows[0].skin_id, "kitty");
  assert.equal((await db.query<{ balance: number }>("select balance from public.player_wallets where player_id=$1", [A])).rows[0].balance, 2000);
  return db;
}

async function as<T>(db: PGlite, role: "anon" | "authenticated" | "service_role", id: string, run: () => Promise<T>) {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  try { return await run(); } finally { await db.exec("reset role"); }
}
async function rpc<T>(db: PGlite, name: string, args: unknown[] = []) {
  return (await db.query<{ value: T }>(`select public.${name}(${args.map((_, index) => `$${index + 1}`).join(",")}) as value`, args)).rows[0].value;
}

for (const history of ["fresh", "staging", "production"] as const) {
  test(`${history} migration history converges without losing purchases, unlocks, or catalog edits`, async t => {
    const db = await database(t, history);
    const catalog = CatalogSchema.parse(await as(db, "anon", "", () => rpc(db, "content_catalog")));
    assert.ok(catalog.achievements.some(item => item.id === "achievement-king" && item.metric === "achievements"));
    assert.ok(catalog.achievements.some(item => item.id === "solo-first" && item.status === "published"));
    assert.ok(catalog.profileIcons.some(item => item.id === "achievement-king"));
    if (history === "production") {
      assert.equal((await db.query<{ status: string }>("select status from private.cosmetic_catalog where item_id='storm-fox'")).rows[0].status, "draft", "administrator-edited seed drafts stay draft");
    }
    await as(db, "authenticated", A, async () => {
      const state = await rpc<AchievementState>(db, "achievement_state");
      assert.equal(state.achievementCount, 5);
      assert.ok(state.unlocks.some(item => item.achievementId === "achievement-king"));
      assert.equal(state.unlocks.length, 6);
      await db.query("update public.player_preferences set icon_id='achievement-king' where player_id=$1", [A]);
    });
    await as(db, "authenticated", B, async () => {
      await assert.rejects(db.query("insert into public.player_preferences(player_id,icon_id) values($1,'achievement-king')", [B]), /Achievement required/);
      await assert.rejects(rpc(db, "record_solo", [RUN, B, 550000, 100, 10000]), /permission denied/);
      await assert.rejects(db.query("select * from public.solo_progress"), /permission denied/);
      await assert.rejects(db.query("insert into public.daily_quest_rewards values($1,current_date,'check-in',20,now())", [B]), /permission denied/);
    });
    await as(db, "service_role", "", async () => {
      await rpc(db, "record_solo", [RUN, B, 550000, 100, 10000]);
      await db.query("insert into public.solo_progress(owner_key,player_id,checkpoint) values($1,$2,'{}')", [`account:${B}`, B]);
      await assert.rejects(db.query("insert into public.solo_progress(owner_key,player_id,checkpoint) values('account:wrong',$1,'{}')", [B]), /check constraint/);
    });
    await as(db, "authenticated", B, async () => {
      const state = await rpc<AchievementState>(db, "achievement_state");
      assert.equal(state.soloBestMs, 550000);
      assert.ok(state.unlocks.some(item => item.achievementId === "solo-10min"));
      const rank = await db.query<{ rank_position: number }>("select * from public.my_solo_rank()");
      assert.equal(rank.rows[0].rank_position, 1);
      await rpc(db, "check_in");
      const first = await rpc<{ awarded: number; balance: number }>(db, "sync_daily_quests");
      assert.equal(first.awarded, 20);
      assert.equal((await rpc<{ awarded: number; balance: number }>(db, "sync_daily_quests")).balance, first.balance);
    });
    // Replay is safe after an interrupted rollout; existing checkpoints, coins and grants survive.
    for (const name of forwardMigrations) await db.exec(await read(name));
    assert.equal((await db.query("select * from public.solo_progress")).rows.length, 1);
    assert.equal((await db.query("select * from public.daily_quest_rewards")).rows.length, 1);
  });
}

test("collection rewards use editable catalog thresholds without counting collection rewards or losing earned ownership", async t => {
  const db = await database(t, "staging");
  const item = { id: "achievement-king", name: "Achievement king", description: "Collect achievements", status: "published", sortOrder: 18, metric: "achievements" as const, target: 2, reward: { kind: "icon", iconId: "achievement-king" } };
  assert.equal(AchievementInputSchema.safeParse(item).success, true);
  await as(db, "authenticated", A, async () => {
    await rpc(db, "admin_save_achievement", [JSON.stringify(item), 1]);
    await rpc(db, "admin_save_achievement", [JSON.stringify({ ...item, id: "collection-three", target: 3 }), 0]);
  });
  await as(db, "service_role", "", () => rpc(db, "record_solo", [RUN, B, 550000, 100, 10000]));
  await as(db, "authenticated", B, async () => {
    const state = await rpc<AchievementState>(db, "achievement_state");
    assert.equal(state.achievementCount, 2);
    assert.ok(state.unlocks.some(unlock => unlock.achievementId === "achievement-king"));
    assert.ok(!state.unlocks.some(unlock => unlock.achievementId === "collection-three"));
    assert.deepEqual(achievementProgress(item, state), { unlocked: true, current: 2, percent: 100 });
  });
  await as(db, "authenticated", A, () => rpc(db, "admin_save_achievement", [JSON.stringify({ ...item, target: 50, status: "archived" }), 2]));
  await as(db, "authenticated", B, async () => {
    await db.query("insert into public.player_preferences(player_id,icon_id) values($1,'achievement-king')", [B]);
    const state = await rpc<AchievementState>(db, "sync_achievements");
    assert.ok(state.unlocks.some(unlock => unlock.achievementId === "achievement-king"));
  });
});
