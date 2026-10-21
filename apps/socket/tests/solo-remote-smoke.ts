// Staging only: a disposable account tests real socket inputs and seeded server-side milestones.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { io } from "socket.io-client";
import type { AddressInfo } from "node:net";
import { createGameServer } from "../src/server";
import { createSupabaseServices } from "../src/supabase";
import { createSoloRun, advanceSolo, saveSoloRun } from "../src/solo";
import type { SoloReply } from "schema/solo";

async function main() {
  config({ path: ".env" });
  const url = process.env.SUPABASE_URL!;
  assert.equal(new URL(url).hostname, "nwdjucplpyorwiwshxtf.supabase.co", "Staging DB only");
  const admin = createClient(
    url,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const client = createClient(url, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = `solo-qa-${randomUUID()}@example.test`,
    password = randomBytes(24).toString("hex");
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: "Solo smoke test" },
  });
  assert.ifError(created.error);
  const id = created.data.user!.id;
  const services = createSupabaseServices();
  let server = createGameServer(services);
  let socket: ReturnType<typeof io> | undefined;
  try {
    await new Promise<void>((resolve) => server.httpServer.listen(0, "127.0.0.1", resolve));
    const port = (server.httpServer.address() as AddressInfo).port;
    const login = await client.auth.signInWithPassword({ email, password });
    assert.ifError(login.error);
    socket = io(`http://127.0.0.1:${port}`, {
      transports: ["websocket"],
      auth: {
        sessionToken: randomBytes(32).toString("hex"),
        accessToken: login.data.session!.access_token,
      },
      autoConnect: false,
    });
    await new Promise<void>((resolve, reject) => {
      socket!.once("connect", resolve);
      socket!.once("connect_error", reject);
      socket!.connect();
    });
    const send = (command: unknown) =>
      socket!.timeout(12_000).emitWithAck("solo", command) as Promise<SoloReply>;
    for (const mode of ["time-attack", "endless"] as const) {
      const start = await send({ t: "start", mode });
      assert.equal(start.error, undefined);
      const state = start.state!;
      assert.equal(state.mode, mode);
      assert.ok(state.board.every((tile) => tile.row < 4 && tile.col < 4));
      const moved = await send({ t: "move", id: state.id, seq: 1, dir: "left" });
      assert.equal(moved.error, undefined);
      assert.equal(moved.state!.seq, 1);
    }
    const before = (await send({ t: "state" })).state!;
    socket.disconnect();
    await server.close();
    server = createGameServer(services);
    await new Promise<void>((resolve) => server.httpServer.listen(0, "127.0.0.1", resolve));
    socket = io(`http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`, {
      transports: ["websocket"],
      auth: {
        sessionToken: randomBytes(32).toString("hex"),
        accessToken: login.data.session!.access_token,
      },
      autoConnect: false,
    });
    await new Promise<void>((resolve, reject) => {
      socket!.once("connect", resolve);
      socket!.once("connect_error", reject);
      socket!.connect();
    });
    const resumed = (await send({ t: "state" })).state!;
    const tiles = (state: typeof resumed) =>
      state.board.filter((tile) => !tile.ghost).map(({ value, row, col }) => ({ value, row, col }));
    assert.equal(resumed.id, before.id);
    assert.equal(resumed.progress, "saved");
    assert.equal(resumed.moves, before.moves);
    assert.equal(resumed.score, before.score);
    assert.deepEqual(tiles(resumed), tiles(before));
    console.log("Verified: database progress survives a server restart and a new device session.");
    // Seed only this disposable account's isolated runs; clients still cannot submit tiles or times.
    const sprint = createSoloRun(id, 0, "time-attack");
    sprint.state.board = [
      { id: 1, value: 1024, row: 0, col: 0 },
      { id: 2, value: 1024, row: 0, col: 1 },
    ];
    advanceSolo(sprint, "left", 120000, () => 0);
    await saveSoloRun(sprint, services.writeSolo);
    assert.equal(sprint.state.saving, "saved");
    await saveSoloRun(sprint, services.writeSolo);
    const endless = createSoloRun(id, 0, "endless");
    for (const tile of [2048, 4096, 8192]) {
      endless.state.board = [
        { id: 1, value: tile / 2, row: 0, col: 0 },
        { id: 2, value: tile / 2, row: 0, col: 1 },
      ];
      advanceSolo(endless, "left", 7200000 + tile, () => 0);
      await saveSoloRun(endless, services.writeSolo);
      assert.equal(endless.state.saving, "saved");
      assert.equal(endless.state.status, "playing");
    }
    const record = await client
      .from("solo_records")
      .select("elapsed_ms,moves")
      .eq("player_id", id)
      .eq("board_size", 4)
      .single();
    assert.ifError(record.error);
    assert.equal(record.data!.elapsed_ms, 120000);
    const rewards = await client.rpc("achievement_state");
    assert.ifError(rewards.error);
    assert.equal(
      rewards.data.unlocks.filter((r: { achievementId: string }) =>
        /^(solo-|endless-)/.test(r.achievementId),
      ).length,
      8,
    );
    const equipped = await client
      .from("player_preferences")
      .insert({ player_id: id, skin_id: "star-phoenix" });
    assert.ifError(equipped.error);
    const own = await client.rpc("my_solo_rank");
    assert.ifError(own.error);
    assert.ok(own.data[0].rank_position > 0);
    const season = await client.from("rank_seasons").select("id").is("ends_at", null).single();
    assert.ifError(season.error);
    const ranked = await client.rpc("my_season_rank", { p_season: season.data!.id });
    assert.ifError(ranked.error);
    assert.deepEqual(ranked.data, []);
    for (let i = 0; i < 2; i++) {
      const attendance = await client.rpc("check_in");
      assert.ifError(attendance.error);
      assert.equal(attendance.data.attendance.streak, 1);
    }
    console.log(
      "Verified: both 4×4 modes, eight milestone rewards, legendary equipment, own rank, idempotent attendance.",
    );
  } finally {
    socket?.disconnect();
    await server.close();
    const deleted = await admin.auth.admin.deleteUser(id);
    assert.ifError(deleted.error);
    console.log("Disposable staging account removed.");
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
