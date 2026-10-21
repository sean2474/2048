// Explicit remote check: creates two disposable users and removes only its own fixtures.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { AddressInfo } from "node:net";
import { config } from "dotenv";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import { io, type Socket } from "socket.io-client";
import type { ServerMessage } from "schema/in-game";
import type { MatchRecord } from "schema/results";
import { createGameServer } from "../src/server";
import { createSupabaseServices } from "../src/supabase";
import { ResultStore } from "../src/result-store";
config();

function packet(socket: Socket, predicate: (message: ServerMessage) => boolean) {
  return new Promise<ServerMessage>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("message", handle);
      reject(Error("Game response timed out"));
    }, 15_000);
    const handle = (message: ServerMessage) => {
      if (!predicate(message)) return;
      clearTimeout(timer);
      socket.off("message", handle);
      resolve(message);
    };
    socket.on("message", handle);
  });
}
function subscribe(channel: RealtimeChannel) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(Error("Realtime subscription timed out")), 20_000);
    channel.on("system", {}, (message) => {
      if (message.extension !== "postgres_changes") return;
      console.log(`Postgres subscription: ${message.status} (${message.message})`);
      if (message.status === "ok") {
        clearTimeout(timer);
        resolve();
      } else if (message.status === "error") {
        clearTimeout(timer);
        reject(Error(`Postgres subscription: ${message.message}`));
      }
    });
    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timer);
        reject(Error(`Realtime ${status}`));
      }
    });
  });
}
test(
  "remote accounts, Socket.IO, result persistence, RLS and Realtime work together",
  { timeout: 120_000 },
  async () => {
    const url = process.env.SUPABASE_URL,
      key = process.env.SUPABASE_PUBLISHABLE_KEY,
      secret = process.env.SUPABASE_SECRET_KEY;
    assert.ok(
      url && key && secret,
      "Configure apps/socket/.env before running this explicit remote check",
    );
    const options = {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }),
      },
    };
    const admin = createClient(url, secret, options);
    const players = [createClient(url, key, options), createClient(url, key, options)];
    const publicClient = createClient(url, key, options);
    const users: string[] = [],
      tokens: string[] = [],
      sockets: Socket[] = [],
      events = new Set<string>();
    const directory = await mkdtemp(join(tmpdir(), "duo-remote-results-"));
    const services = createSupabaseServices();
    assert.ok(
      services.resolveAccount &&
        services.writeMatch &&
        services.readRating &&
        services.readSuspensions,
    );
    const store = new ResultStore(directory, services.writeMatch);
    let record: MatchRecord | undefined;
    const server = createGameServer({
      resolveAccount: services.resolveAccount,
      readRating: services.readRating,
      readSuspensions: services.readSuspensions,
      hasPendingRanked: (id) => store.hasPendingRanked(id),
      writeMatch: async (result) => {
        record = result;
        await store.save(result);
      },
    });
    try {
      for (const [index, player] of players.entries()) {
        const email = `duo-smoke-${randomUUID()}@example.com`,
          password = randomBytes(32).toString("hex");
        const created = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { name: `Verification ${index + 1}` },
        });
        assert.equal(created.error, null, "Test account creation failed");
        assert.ok(created.data.user);
        users.push(created.data.user.id);
        const signedIn = await player.auth.signInWithPassword({ email, password });
        assert.equal(signedIn.error, null, "Test account login failed");
        assert.ok(signedIn.data.session);
        tokens.push(signedIn.data.session.access_token);
      }
      const leaderboard = publicClient.channel(`duo-smoke-stats-${randomUUID()}`).on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "player_ratings",
          filter: `player_id=eq.${users[1]}`,
        },
        () => events.add("leaderboard"),
      );
      const history = players[0].channel(`duo-smoke-history-${randomUUID()}`).on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "match_participants",
          filter: `player_id=eq.${users[0]}`,
        },
        () => events.add("history"),
      );
      await Promise.all([subscribe(leaderboard), subscribe(history)]);
      await store.start();
      await new Promise<void>((resolve) => server.httpServer.listen(0, "127.0.0.1", resolve));
      for (const accessToken of tokens) {
        const socket = io(`http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`, {
          auth: { sessionToken: randomBytes(32).toString("hex"), accessToken },
          transports: ["websocket"],
          reconnection: false,
          autoConnect: false,
        });
        sockets.push(socket);
        await new Promise<void>((resolve, reject) => {
          socket.once("connect", resolve);
          socket.once("connect_error", reject);
          socket.connect();
        });
      }
      const found = sockets.map((socket) =>
        packet(socket, (message) => message.t === "matchFound"),
      );
      sockets.forEach((socket) => socket.emit("message", { t: "findMatch", mode: "ranked" }));
      const [match] = await Promise.all(found);
      assert.equal(match.t, "matchFound");
      if (match.t !== "matchFound") throw Error("Match missing");
      const active = sockets.map((socket) =>
        packet(socket, (message) => message.t === "state" && !message.paused),
      );
      sockets.forEach((socket) => socket.emit("message", { t: "joinRoom", roomId: match.roomId }));
      await Promise.all(active);
      const saved = packet(sockets[0], (message) => message.t === "recordStatus");
      sockets[0].emit("message", { t: "surrender" });
      assert.deepEqual(await saved, { t: "recordStatus", matchId: match.roomId, status: "saved" });
      assert.ok(record);
      await services.writeMatch(record);
      const stats = await publicClient
        .from("player_ratings")
        .select("wins,games_played,rating")
        .eq("player_id", users[1])
        .single();
      assert.equal(stats.error, null);
      assert.deepEqual(stats.data, { wins: 1, games_played: 1, rating: 1216 });
      const ownHistory = await players[0]
        .from("matches")
        .select("id,mode,match_participants(slot,result,rating_before,rating_after,rating_delta)")
        .eq("id", match.roomId)
        .single();
      assert.equal(ownHistory.error, null);
      assert.equal(ownHistory.data?.match_participants.length, 2);
      assert.equal(ownHistory.data?.mode, "ranked");
      const privateHistory = await publicClient.from("matches").select("id").eq("id", match.roomId);
      assert.equal(privateHistory.error?.code, "42501");
      const tampered = await players[0].rpc("record_match", {
        p_id: record.id,
        p_started_at: record.startedAt,
        p_ended_at: record.endedAt,
        p_reason: record.reason,
        p_winner_slot: record.winnerSlot,
        p_participants: record.participants,
        p_mode: record.mode,
      });
      assert.equal(tampered.error?.code, "42501");
      for (let tries = 0; tries < 100 && events.size < 2; tries++) await delay(100);
      assert.deepEqual([...events].sort(), ["history", "leaderboard"]);
      assert.deepEqual(await readdir(directory), []);
      const denied = await players[0].rpc("admin_overview", { p_days: 7, p_mode: "all" });
      assert.ok(denied.error, "Ordinary accounts must not read admin analytics");
      const grant = await admin.from("admin_roles").insert({ user_id: users[0] });
      assert.equal(grant.error, null, "Disposable admin role could not be created");
      const overview = await players[0].rpc("admin_overview", { p_days: 7, p_mode: "ranked" });
      assert.equal(overview.error, null);
      assert.ok(overview.data.totals.telemetryParticipants >= 2);
      const detail = await players[0].rpc("admin_player", { p_user_id: users[1] });
      assert.equal(detail.error, null);
      assert.deepEqual(
        detail.data.matches.find((row: { id: string }) => row.id === match.roomId).telemetry,
        record.participants[1].telemetry,
      );
      const suspend = await players[0].rpc("admin_set_suspension", {
        p_user_id: users[1],
        p_suspended: true,
        p_reason: "Automated disposable-account verification",
      });
      assert.equal(suspend.error, null);
      assert.deepEqual(await services.readSuspensions(users), [users[1]]);
      const blocked = packet(sockets[1], (message) => message.t === "error");
      sockets[1].emit("message", { t: "findMatch", mode: "casual" });
      assert.deepEqual(await blocked, { t: "error", reason: "account_suspended" });
      const resume = await players[0].rpc("admin_set_suspension", {
        p_user_id: users[1],
        p_suspended: false,
        p_reason: "Verification complete",
      });
      assert.equal(resume.error, null);
      assert.deepEqual(await services.readSuspensions(users), []);
      const audit = await players[0].rpc("admin_player", { p_user_id: users[1] });
      assert.equal(audit.error, null);
      assert.deepEqual(audit.data.audit.map((row: { action: string }) => row.action).sort(), [
        "suspend",
        "unsuspend",
      ]);
      console.log(
        "Verified: authenticated ranked match, Elo idempotency, RLS, Realtime, admin analytics, suspension and audit.",
      );
    } finally {
      sockets.forEach((socket) => socket.disconnect());
      await server.close();
      await store.close();
      await Promise.all([publicClient, ...players].map((client) => client.removeAllChannels()));
      const cleanupErrors: string[] = [];
      if (record) {
        const { error } = await admin.from("matches").delete().eq("id", record.id);
        if (error) cleanupErrors.push(`match ${record.id}: ${error.code}`);
      }
      if (users.length) {
        const { error } = await admin.from("admin_audit").delete().in("player_id", users);
        if (error) cleanupErrors.push(`test audit: ${error.code}`);
      }
      for (const id of users) {
        const { error } = await admin.auth.admin.deleteUser(id);
        if (error) cleanupErrors.push(`test user ${id}: ${error.code}`);
      }
      if (!cleanupErrors.length) await rm(directory, { recursive: true, force: true });
      assert.deepEqual(cleanupErrors, [], "Test fixture cleanup failed");
    }
  },
);
