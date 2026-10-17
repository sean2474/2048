// Explicit staging-only purchase check; creates and deletes only this run's accounts.
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

test("staging purchases serialize duplicate and competing requests and protect ownership", { timeout: 120_000 }, async () => {
  assert.equal(process.env.APP_ENV, "staging");
  const project = "nwdjucplpyorwiwshxtf";
  assert.equal(process.env.SUPABASE_URL, `https://${project}.supabase.co`, "Production is forbidden");
  assert.ok(process.env.SUPABASE_SECRET_KEY && process.env.SUPABASE_PUBLISHABLE_KEY);
  const options = { auth: { persistSession: false, autoRefreshToken: false }, global: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }),
  } };
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, options);
  const players = [0, 1].map(() => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, options));
  const users: string[] = [];
  const directory = await mkdtemp(join(tmpdir(), "2048-shop-smoke-"));
  try {
    for (const player of players) {
      const email = `shop-${randomUUID()}@example.com`, password = randomBytes(32).toString("hex");
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: "Shop fixture" } });
      assert.equal(created.error, null); assert.ok(created.data.user);
      users.push(created.data.user.id);
      assert.equal((await player.auth.signInWithPassword({ email, password })).error, null);
      assert.equal((await player.from("player_preferences").insert({ player_id: users.at(-1) })).error, null);
    }
    assert.deepEqual((await players[0].rpc("cosmetic_state")).data, { balance: 0, purchases: [] });
    assert.equal((await players[0].from("player_preferences").update({ skin_id: "confetti" }).eq("player_id", users[0])).error?.code, "42501");
    assert.match((await players[0].rpc("purchase_cosmetic", { p_kind: "skin", p_item_id: "confetti" })).error?.message ?? "", /Not enough coins/);
    assert.match(users[0], /^[0-9a-f-]{36}$/);
    // No coin-grant API exists; seed only this disposable staging wallet with the operator CLI.
    const sqlFile = join(directory, "seed.sql");
    await writeFile(sqlFile, `update public.player_wallets set balance=450 where player_id='${users[0]}'::uuid;`, { mode: 0o600 });
    execFileSync("pnpm", ["dlx", "supabase", "db", "query", "--linked", "--project-ref", project, "--file", sqlFile], { stdio: "pipe", timeout: 30_000 });
    const duplicates = await Promise.all(Array.from({ length: 4 }, () => players[0].rpc("purchase_cosmetic", { p_kind: "skin", p_item_id: "confetti" })));
    assert.ok(duplicates.every(result => !result.error));
    assert.equal(duplicates.filter(result => result.data.purchased).length, 1);
    assert.ok(duplicates.every(result => result.data.balance === 150));
    const competitors = await Promise.all(["owl", "dragon"].map(p_item_id => players[0].rpc("purchase_cosmetic", { p_kind: "icon", p_item_id })));
    assert.equal(competitors.filter(result => !result.error).length, 1);
    assert.match(competitors.find(result => result.error)?.error?.message ?? "", /Not enough coins/);
    const final = await players[0].rpc("cosmetic_state");
    assert.equal(final.error, null); assert.equal(final.data.balance, 0); assert.equal(final.data.purchases.length, 2);
    assert.equal((await players[0].from("player_preferences").update({ skin_id: "confetti" }).eq("player_id", users[0])).error, null);
    assert.deepEqual((await players[1].rpc("cosmetic_state")).data, { balance: 0, purchases: [] });
    assert.deepEqual((await players[1].from("cosmetic_purchases").select("item_id").eq("player_id", users[0])).data, []);
    assert.equal((await players[1].from("player_preferences").update({ skin_id: "confetti" }).eq("player_id", users[1])).error?.code, "42501");
    console.log("Verified concurrent duplicates, competing purchases, zero-floor balance, paid equipment and account isolation.");
  } finally {
    const cleanup = await Promise.all(users.map(id => admin.auth.admin.deleteUser(id)));
    await rm(directory, { recursive: true, force: true });
    assert.ok(cleanup.every(result => !result.error), "Disposable account cleanup failed");
  }
});
