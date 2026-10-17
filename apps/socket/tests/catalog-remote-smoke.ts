// Explicit staging integration check; every account, catalog row and asset belongs to this run.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { CatalogAchievementSchema, CatalogProfileIconSchema, CatalogSchema, CatalogSkinSchema, type AchievementInput, type CosmeticInput } from "schema/catalog";

test("staging catalog, Storage, ownership and concurrent mutations stay authoritative", { timeout: 180_000 }, async () => {
  assert.equal(process.env.APP_ENV, "staging", "Only staging may run this test");
  const project = "nwdjucplpyorwiwshxtf";
  const url = `https://${project}.supabase.co`;
  assert.equal(process.env.SUPABASE_URL, url, "Production is forbidden");
  assert.ok(process.env.SUPABASE_SECRET_KEY && process.env.SUPABASE_PUBLISHABLE_KEY);
  const options = { auth: { persistSession: false, autoRefreshToken: false }, global: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }),
  } };
  const service = createClient(url, process.env.SUPABASE_SECRET_KEY, options);
  const [admin, buyer, other] = [0, 1, 2].map(() => createClient(url, process.env.SUPABASE_PUBLISHABLE_KEY!, options));
  const publicClient = createClient(url, process.env.SUPABASE_PUBLISHABLE_KEY, options);
  const run = randomBytes(8).toString("hex"), prefix = `smoke-${run}`;
  const ids = { board: `${prefix}-board`, icon: `${prefix}-icon`, reward: `${prefix}-reward`, achievement: `${prefix}-achievement`, raceReward: `${prefix}-race-reward`, raceAchievement: `${prefix}-race-achievement` };
  const itemIds = Object.values(ids);
  for (const id of itemIds) assert.match(id, /^smoke-[0-9a-f]{16}-[a-z-]+$/);
  const imagePath = `smoke/${run}/icon.png`, deniedPath = `smoke/${run}/denied.png`;
  const assetPaths = [imagePath, deniedPath];
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMI7dj9HwAFZgKYT/pAVQAAAABJRU5ErkJggg==", "base64");
  const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
  const users: string[] = [];
  const directory = await mkdtemp(join(tmpdir(), "2048-catalog-smoke-"));
  const sql = async (name: string, source: string) => {
    const file = join(directory, `${name}.sql`);
    await writeFile(file, source, { mode: 0o600 });
    execFileSync("pnpm", ["dlx", "supabase", "db", "query", "--linked", "--project-ref", project, "--file", file], { stdio: "pipe", timeout: 30_000 });
  };
  const save = async (item: CosmeticInput, revision = 0) => {
    const response = await admin.rpc("admin_save_cosmetic", { p_kind: item.kind, p_item: item, p_expected_revision: revision });
    assert.equal(response.error, null);
    return item.kind === "skin" ? CatalogSkinSchema.parse(response.data) : CatalogProfileIconSchema.parse(response.data);
  };
  const saveAchievement = async (item: AchievementInput, revision = 0) => {
    const response = await admin.rpc("admin_save_achievement", { p_item: item, p_expected_revision: revision });
    assert.equal(response.error, null);
    return CatalogAchievementSchema.parse(response.data);
  };
  try {
    for (const client of [admin, buyer, other]) {
      const email = `catalog-${randomUUID()}@example.com`, password = randomBytes(32).toString("hex");
      const created = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: "Catalog fixture" } });
      assert.equal(created.error, null); assert.ok(created.data.user);
      const id = created.data.user.id;
      assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      users.push(id);
      assert.equal((await client.auth.signInWithPassword({ email, password })).error, null);
      assert.equal((await client.from("player_preferences").insert({ player_id: id })).error, null);
    }
    await sql("seed", `insert into public.admin_roles(user_id) values('${users[0]}'::uuid);
      update public.player_wallets set balance=2000 where player_id='${users[1]}'::uuid;
      insert into public.player_attendance(player_id,last_day,streak,best_streak)
        values('${users[1]}'::uuid,(now() at time zone 'Asia/Seoul')::date,1,999999999);`);
    assert.equal((await admin.rpc("is_game_admin")).data, true);
    assert.equal((await other.rpc("is_game_admin")).data, false);

    const deniedUpload = await other.storage.from("catalog-assets").upload(deniedPath, png, { contentType: "image/png", upsert: false });
    assert.ok(deniedUpload.error, "Ordinary users cannot upload catalog assets");
    assert.equal((await admin.storage.from("catalog-assets").upload(imagePath, png, { contentType: "image/png", upsert: false })).error, null);
    const stored = await service.storage.from("catalog-assets").download(imagePath);
    assert.equal(stored.error, null); assert.ok(stored.data);
    assert.equal(sha(new Uint8Array(await stored.data.arrayBuffer())), sha(png));
    const publicImage = await fetch(publicClient.storage.from("catalog-assets").getPublicUrl(imagePath).data.publicUrl, { signal: AbortSignal.timeout(15_000) });
    assert.equal(publicImage.status, 200);
    assert.equal(sha(new Uint8Array(await publicImage.arrayBuffer())), sha(png));

    const icon: CosmeticInput = { kind: "icon", id: ids.icon, name: "Catalog smoke icon", description: "Disposable integration fixture", status: "draft", sortOrder: 999999, acquisition: "coins", price: 150, color: "#5588bb", imagePath };
    const board: CosmeticInput = { kind: "skin", id: ids.board, name: "Catalog smoke board", description: "Disposable integration fixture", status: "published", sortOrder: 999999, acquisition: "coins", price: 300, rarity: "rare", tokens: { boardBackground: "#5588bb", emptyBackground: "#ddeeff", tileRadius: "0.5rem", boardImagePath: imagePath } };
    assert.equal((await other.rpc("admin_save_cosmetic", { p_kind: "icon", p_item: icon, p_expected_revision: 0 })).error?.code, "42501");
    assert.equal((await other.rpc("admin_content_catalog")).error?.code, "42501");
    const draft = await save(icon);
    const publicDraft = await publicClient.rpc("content_catalog", {}, { get: true });
    assert.equal(publicDraft.error, null);
    assert.equal(CatalogSchema.parse(publicDraft.data).profileIcons.some(item => item.id === ids.icon), false);
    const publishedIcon = await save({ ...icon, status: "published" }, draft.revision);
    const publishedBoard = await save(board);
    const live = await publicClient.rpc("content_catalog", {}, { get: true });
    assert.equal(live.error, null);
    const catalog = CatalogSchema.parse(live.data);
    assert.equal(catalog.skins.find(item => item.id === ids.board)?.tokens.boardImagePath, imagePath);
    assert.equal(catalog.profileIcons.find(item => item.id === ids.icon)?.imagePath, imagePath);
    assert.equal((await buyer.from("player_preferences").update({ skin_id: ids.board, icon_id: ids.icon }).eq("player_id", users[1])).error?.code, "42501");
    assert.match((await buyer.rpc("purchase_cosmetic", { p_kind: "icon", p_item_id: ids.icon })).error?.message ?? "", /Price confirmation required/);
    assert.match((await other.rpc("purchase_cosmetic", { p_kind: "icon", p_item_id: "owl" })).error?.message ?? "", /Not enough coins/);
    assert.match((await buyer.rpc("purchase_cosmetic", { p_kind: "icon", p_item_id: ids.icon, p_expected_price: 149 })).error?.message ?? "", /Price changed/);
    const duplicates = await Promise.all(Array.from({ length: 4 }, () => buyer.rpc("purchase_cosmetic", { p_kind: "icon", p_item_id: ids.icon, p_expected_price: 150 })));
    assert.ok(duplicates.every(result => !result.error));
    assert.equal(duplicates.filter(result => result.data.purchased).length, 1);
    assert.ok(duplicates.every(result => result.data.balance === 1850));
    const purchaseBoard = await buyer.rpc("purchase_cosmetic", { p_kind: "skin", p_item_id: ids.board, p_expected_price: 300 });
    assert.equal(purchaseBoard.error, null); assert.equal(purchaseBoard.data.balance, 1550);
    assert.equal((await buyer.from("player_preferences").update({ skin_id: ids.board, icon_id: ids.icon }).eq("player_id", users[1])).error, null);
    const edited = await save({ ...icon, name: "Edited catalog smoke icon", status: "published", price: 200 }, publishedIcon.revision);
    const retry = await buyer.rpc("purchase_cosmetic", { p_kind: "icon", p_item_id: ids.icon, p_expected_price: 150 });
    assert.equal(retry.error, null); assert.equal(retry.data.purchased, false); assert.equal(retry.data.balance, 1550);
    assert.equal((await buyer.from("cosmetic_purchases").select("price_paid").eq("kind", "icon").eq("item_id", ids.icon).single()).data?.price_paid, 150);
    await save({ ...icon, name: "Edited catalog smoke icon", status: "archived", price: 200 }, edited.revision);
    await save({ ...board, status: "archived" }, publishedBoard.revision);
    assert.equal((await buyer.from("player_preferences").update({ skin_id: "classic", icon_id: "fox" }).eq("player_id", users[1])).error, null);
    assert.equal((await buyer.from("player_preferences").update({ skin_id: ids.board, icon_id: ids.icon }).eq("player_id", users[1])).error, null);
    assert.equal((await other.from("player_preferences").update({ skin_id: ids.board, icon_id: ids.icon }).eq("player_id", users[2])).error?.code, "42501");
    assert.ok((await other.rpc("purchase_cosmetic", { p_kind: "icon", p_item_id: ids.icon, p_expected_price: 200 })).error);
    assert.deepEqual((await other.from("cosmetic_purchases").select("item_id").eq("player_id", users[1])).data, []);

    const rewardIcon: CosmeticInput = { ...icon, id: ids.reward, acquisition: "achievement", price: 0, status: "published" };
    const reward = await save(rewardIcon);
    // An unreachable normal-play threshold keeps this global fixture away from unrelated users.
    const achievement: AchievementInput = { id: ids.achievement, name: "Catalog smoke milestone", description: "Disposable integration fixture", status: "published", sortOrder: 999999, metric: "attendance_streak", target: 999999999, reward: { kind: "icon", iconId: ids.reward } };
    const milestone = await saveAchievement(achievement);
    assert.equal((await other.rpc("admin_save_achievement", { p_item: achievement, p_expected_revision: milestone.revision })).error?.code, "42501");
    assert.equal((await buyer.from("player_preferences").update({ icon_id: ids.reward }).eq("player_id", users[1])).error?.code, "42501");
    const unlocked = await buyer.rpc("sync_achievements");
    assert.equal(unlocked.error, null);
    assert.ok(unlocked.data.unlocks.some((item: { achievementId: string }) => item.achievementId === ids.achievement));
    assert.equal((await buyer.from("player_preferences").update({ icon_id: ids.reward }).eq("player_id", users[1])).error, null);
    const changedMilestone = await saveAchievement({ ...achievement, target: 1000000000 }, milestone.revision);
    assert.ok((await buyer.rpc("achievement_state", {}, { get: true })).data.unlocks.some((item: { achievementId: string }) => item.achievementId === ids.achievement));
    await saveAchievement({ ...achievement, target: 1000000000, status: "archived" }, changedMilestone.revision);
    await save({ ...rewardIcon, status: "archived" }, reward.revision);
    assert.equal((await buyer.from("player_preferences").update({ icon_id: "fox" }).eq("player_id", users[1])).error, null);
    assert.equal((await buyer.from("player_preferences").update({ icon_id: ids.reward }).eq("player_id", users[1])).error, null);
    assert.equal((await other.from("player_preferences").update({ icon_id: ids.reward }).eq("player_id", users[2])).error?.code, "42501");

    const raceReward: CosmeticInput = { ...rewardIcon, id: ids.raceReward };
    const raceIcon = await save(raceReward);
    const raceAchievement: AchievementInput = { ...achievement, id: ids.raceAchievement, status: "draft", target: 1000000000, reward: { kind: "icon", iconId: ids.raceReward } };
    const raceDraft = await saveAchievement(raceAchievement);
    const raced = await Promise.all([
      admin.rpc("admin_save_achievement", { p_item: { ...raceAchievement, status: "published" }, p_expected_revision: raceDraft.revision }),
      admin.rpc("admin_save_cosmetic", { p_kind: "icon", p_item: { ...raceReward, status: "archived" }, p_expected_revision: raceIcon.revision }),
    ]);
    assert.equal(raced.filter(result => !result.error).length, 1, "Reward archive and dependent publication cannot both succeed");
    assert.equal(raced.find(result => result.error)?.error?.code, "22023");
    const finalCatalog = await admin.rpc("admin_content_catalog");
    assert.equal(finalCatalog.error, null);
    const final = CatalogSchema.parse(finalCatalog.data);
    assert.ok(final.achievements.find(item => item.id === ids.raceAchievement)?.status !== "published" || final.profileIcons.find(item => item.id === ids.raceReward)?.status === "published");
    console.log("Verified catalog CRUD, Storage bytes and permissions, price confirmation, concurrent purchases, permanent ownership and concurrent publication guards.");
  } finally {
    const failures: string[] = [];
    // The uploader must remain until Storage objects can safely be removed.
    for (const id of users.slice(1)) {
      try { if ((await service.auth.admin.deleteUser(id)).error) failures.push(`account ${id}`); }
      catch { failures.push(`account ${id}`); }
    }
    let catalogRemoved = false;
    try {
      const items = itemIds.map(id => `'${id}'`).join(",");
      await sql("cleanup", `begin;
        do $$ begin
          if exists(select 1 from public.player_preferences where skin_id in (${items}) or icon_id in (${items}))
            or exists(select 1 from public.cosmetic_purchases where item_id in (${items}))
            or exists(select 1 from public.achievement_unlocks where achievement_id in (${items})) then
              raise exception 'Catalog smoke fixture acquired unrelated references; refusing deletion';
          end if;
        end $$;
        delete from private.catalog_audit where item_id in (${items});
        delete from private.achievement_catalog where item_id in (${items});
        delete from private.cosmetic_catalog where item_id in (${items});
        commit;`);
      catalogRemoved = true;
    } catch { failures.push(`catalog cleanup; retained images and uploader ${users[0] ?? "not created"}`); }
    if (catalogRemoved) {
      try {
        const removed = await service.storage.from("catalog-assets").remove(assetPaths);
        if (removed.error) failures.push(`asset removal; retained uploader ${users[0] ?? "not created"}`);
        else if (users[0] && (await service.auth.admin.deleteUser(users[0])).error) failures.push(`account ${users[0]}`);
      } catch { failures.push(`asset or uploader cleanup ${users[0] ?? "not created"}`); }
    }
    await rm(directory, { recursive: true, force: true });
    assert.deepEqual(failures, [], `Cleanup incomplete for isolated run ${prefix}`);
  }
});
