// Explicit staging-only check; all writes and cleanup are scoped to this run's disposable accounts.
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { AchievementState } from "schema/achievements";

test(
  "staging ranked results award complete cosmetic sets at placement and promotion",
  { timeout: 180_000 },
  async () => {
    assert.equal(process.env.APP_ENV, "staging");
    const project = "nwdjucplpyorwiwshxtf";
    assert.equal(
      process.env.SUPABASE_URL,
      `https://${project}.supabase.co`,
      "Production is forbidden",
    );
    assert.ok(process.env.SUPABASE_SECRET_KEY && process.env.SUPABASE_PUBLISHABLE_KEY);
    const options = {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }),
      },
    };
    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, options);
    const players = [0, 1].map(() =>
      createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, options),
    );
    const users: string[] = [],
      matches: string[] = [];
    const directory = await mkdtemp(join(tmpdir(), "2048-rank-cosmetics-smoke-"));
    const state = async (index = 0) => {
      const result = await players[index].rpc("achievement_state", {}, { get: true });
      assert.equal(result.error, null);
      return result.data as AchievementState;
    };
    const ranks = (value: AchievementState) =>
      value.unlocks
        .map((row) => row.achievementId)
        .filter((id) => id.startsWith("rank-"))
        .sort();
    try {
      for (const player of players) {
        const email = `rank-cosmetics-${randomUUID()}@example.com`,
          password = randomBytes(32).toString("hex");
        const created = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { name: "Rank reward fixture" },
        });
        assert.equal(created.error, null);
        assert.ok(created.data.user);
        users.push(created.data.user.id);
        assert.equal((await player.auth.signInWithPassword({ email, password })).error, null);
        assert.equal(
          (await player.from("player_preferences").insert({ player_id: users.at(-1) })).error,
          null,
        );
      }
      assert.equal((await state()).highestRank, 0);
      assert.deepEqual(ranks(await state()), []);
      assert.equal(
        (
          await players[0]
            .from("player_preferences")
            .update({ icon_id: "rank-gold" })
            .eq("player_id", users[0])
        ).error?.code,
        "42501",
      );
      assert.equal(
        (
          await players[0]
            .from("season_ratings")
            .update({ peak_rating: 2000 })
            .eq("player_id", users[0])
        ).error?.code,
        "42501",
      );
      assert.equal(
        (
          await players[0]
            .from("achievement_unlocks")
            .insert({ player_id: users[0], achievement_id: "rank-master" })
        ).error?.code,
        "42501",
      );
      const currentSeason = await admin
        .from("rank_seasons")
        .select("starts_at")
        .is("ends_at", null)
        .single();
      assert.equal(currentSeason.error, null);
      assert.ok(currentSeason.data);
      const started = Math.max(Date.now() - 1000, Date.parse(currentSeason.data.starts_at));
      const record = async (winner: number | null = null, id: string = randomUUID()) => {
        if (!matches.includes(id)) matches.push(id);
        return admin.rpc("record_match", {
          p_id: id,
          p_started_at: new Date(started).toISOString(),
          p_ended_at: new Date(Math.max(started + 1000, Date.now())).toISOString(),
          p_reason: winner === null ? "draw" : "surrender",
          p_winner_slot: winner,
          p_mode: "ranked",
          p_participants: users.map((userId) => ({ userId, score: 32, maxTile: 8 })),
        });
      };
      let tenth = "";
      for (let count = 1; count <= 10; count++) {
        tenth = randomUUID();
        const result = await record(null, tenth);
        assert.equal(result.error, null);
        assert.equal(result.data, true);
        assert.equal((await state()).highestRank, count === 10 ? 3 : 0);
        assert.deepEqual(
          ranks(await state()),
          count === 10 ? ["rank-bronze", "rank-gold", "rank-silver"] : [],
        );
      }
      const placementRewards = (await state()).unlocks;
      assert.equal((await record(null, tenth)).data, false);
      assert.deepEqual((await state()).unlocks, placementRewards);
      assert.equal(
        (
          await players[0]
            .from("player_preferences")
            .update({ skin_id: "rank-gold", icon_id: "rank-gold" })
            .eq("player_id", users[0])
        ).error,
        null,
      );
      assert.equal(
        (
          await players[0]
            .from("player_preferences")
            .update({ skin_id: "rank-master" })
            .eq("player_id", users[0])
        ).error?.code,
        "42501",
      );
      assert.match(
        (await players[0].rpc("purchase_cosmetic", { p_kind: "skin", p_item_id: "rank-master" }))
          .error?.message ?? "",
        /Unknown item/,
      );
      assert.deepEqual(
        (
          await players[1]
            .from("achievement_unlocks")
            .select("achievement_id")
            .eq("player_id", users[0])
        ).data,
        [],
      );

      // Seed only the fixture ratings, then let the trusted result RPC establish a new peak and grant rewards.
      for (const id of users) assert.match(id, /^[0-9a-f-]{36}$/);
      const sqlFile = join(directory, "seed-ratings.sql");
      await writeFile(
        sqlFile,
        `update public.player_ratings set rating=1799,tier='Diamond' where player_id in ('${users[0]}'::uuid,'${users[1]}'::uuid);`,
        { mode: 0o600 },
      );
      execFileSync(
        "pnpm",
        ["dlx", "supabase", "db", "query", "--linked", "--project-ref", project, "--file", sqlFile],
        { stdio: "pipe", timeout: 30_000 },
      );
      assert.equal((await record(1)).error, null);
      assert.equal((await state()).highestRank, 6);
      assert.deepEqual(ranks(await state()), [
        "rank-bronze",
        "rank-diamond",
        "rank-gold",
        "rank-master",
        "rank-platinum",
        "rank-silver",
      ]);
      assert.equal(
        (
          await players[0]
            .from("player_preferences")
            .update({ skin_id: "rank-master", icon_id: "rank-master" })
            .eq("player_id", users[0])
        ).error,
        null,
      );
      const masterRewards = (await state()).unlocks;
      assert.equal((await record(2)).error, null);
      assert.equal((await state()).highestRank, 6);
      assert.deepEqual((await state()).unlocks, masterRewards);
      const checked = await players[0].rpc("check_in");
      assert.equal(checked.error, null);
      assert.equal(checked.data.attendance.checkedInToday, true);
      assert.equal(checked.data.highestRank, 6);
      console.log(
        "Verified placement, all lower-tier rewards, same-result retry, promotion, demotion retention, paired equipment and private ownership on staging PostgreSQL.",
      );
    } finally {
      const errors: string[] = [];
      if (matches.length) {
        const removed = await admin.from("matches").delete().in("id", matches);
        if (removed.error)
          errors.push(
            `Fixture match cleanup failed: ${removed.error.code}; retained users ${users.join(",")} and match IDs ${matches.join(",")}`,
          );
      }
      if (!errors.length) {
        const removed = await Promise.all(users.map((id) => admin.auth.admin.deleteUser(id)));
        const retained = users.filter((_, index) => removed[index].error);
        if (retained.length)
          errors.push(`Disposable account cleanup failed; retained users ${retained.join(",")}`);
      }
      await rm(directory, { recursive: true, force: true });
      assert.deepEqual(errors, [], "Staging fixture cleanup needs attention");
    }
  },
);
