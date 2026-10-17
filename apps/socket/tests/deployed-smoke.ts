// Explicit deployment check: no dotenv, local server, or cleanup outside this run's fixture IDs.
// Run against an isolated staging deployment while its ranked queue is empty.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { io, type Socket } from "socket.io-client";
import { applyMove } from "game-core";
import type { Dir, ServerMessage, ServerState } from "schema/in-game";

function packet(socket: Socket, predicate: (message: ServerMessage) => boolean, timeoutMs = 20_000) {
  return new Promise<ServerMessage>((resolve, reject) => {
    const timer = setTimeout(() => { socket.off("message", handle); reject(Error("Deployed game response timed out")); }, timeoutMs);
    const handle = (message: ServerMessage) => {
      if (message.t === "error" || message.t === "reject") {
        clearTimeout(timer); socket.off("message", handle); reject(Error(`Deployed game rejected request: ${message.reason}`)); return;
      }
      if (!predicate(message)) return;
      clearTimeout(timer); socket.off("message", handle); resolve(message);
    };
    socket.on("message", handle);
  });
}

function connect(socket: Socket) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => { socket.off("connect", connected); socket.off("connect_error", failed); };
    const connected = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(Error("Deployed Socket.IO handshake failed")); };
    socket.once("connect", connected); socket.once("connect_error", failed); socket.connect();
  });
}

test("deployed Socket.IO ranked match, reconnect, persistence and access controls", { timeout: 180_000 }, async () => {
  assert.equal(process.env.APP_ENV, "staging", "This ranked smoke requires explicit APP_ENV=staging; production is forbidden");
  const names = ["SOCKET_TEST_URL", "TEST_WEB_ORIGIN", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"] as const;
  for (const name of names) assert.ok(process.env[name], `Set ${name} explicitly; this test never loads .env files`);
  const socketUrl = new URL(process.env.SOCKET_TEST_URL!), origin = new URL(process.env.TEST_WEB_ORIGIN!);
  assert.ok(["http:", "https:"].includes(socketUrl.protocol) && !socketUrl.username && !socketUrl.password && socketUrl.pathname === "/" && !socketUrl.search && !socketUrl.hash, "SOCKET_TEST_URL must be an HTTP(S) origin");
  assert.ok(["http:", "https:"].includes(origin.protocol) && !origin.username && !origin.password && origin.pathname === "/" && !origin.search && !origin.hash, "TEST_WEB_ORIGIN must be an HTTP(S) origin");
  const fetchTimed = (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) });
  const options = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetchTimed } };
  const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, options);
  const players = [0, 1].map(() => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, options));
  const users: string[] = [], tokens: string[] = [], sockets: Socket[] = [];
  const sessionTokens = [randomBytes(32).toString("hex"), randomBytes(32).toString("hex")];
  const run = randomUUID().slice(0, 8), displayNames = [`Deploy ${run} A`, `Deploy ${run} B`];
  const observedRooms = new Set<string>(), endedRooms = new Set<string>(), savedRooms = new Set<string>();
  let matchId: string | undefined, rankedQueueEntered = false;
  function socketFor(index: number, testOrigin = origin.origin) {
    const socket = io(socketUrl.origin, { transports: ["websocket"], reconnection: false, autoConnect: false, timeout: 15_000,
      auth: { sessionToken: sessionTokens[index], accessToken: tokens[index] }, extraHeaders: { Origin: testOrigin },
    });
    socket.on("message", (message: ServerMessage) => {
      if (message.t === "matchFound") observedRooms.add(message.roomId);
      if (message.t === "end") endedRooms.add(message.matchId);
      if (message.t === "recordStatus" && message.status === "saved") savedRooms.add(message.matchId);
    });
    sockets.push(socket); return socket;
  }
  try {
    const health = await fetchTimed(new URL("/health", socketUrl));
    assert.equal(health.status, 200); assert.deepEqual(await health.json(), { ok: true });
    const deniedOrigin = await fetchTimed(new URL("/account/delete", socketUrl), { method: "OPTIONS", headers: { Origin: "https://unapproved-socket-smoke.invalid" } });
    assert.equal(deniedOrigin.status, 403, "Unapproved HTTP Origin must be denied");
    const allowedOrigin = await fetchTimed(new URL("/account/delete", socketUrl), { method: "OPTIONS", headers: { Origin: origin.origin } });
    assert.equal(allowedOrigin.status, 204); assert.equal(allowedOrigin.headers.get("access-control-allow-origin"), origin.origin);
    for (const [index, player] of players.entries()) {
      const email = `duo-deployed-${randomUUID()}@example.com`, password = randomBytes(32).toString("hex");
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: displayNames[index] } });
      assert.equal(created.error, null, "Disposable account creation failed"); assert.ok(created.data.user);
      users.push(created.data.user.id);
      const login = await player.auth.signInWithPassword({ email, password });
      assert.equal(login.error, null, "Disposable account login failed"); assert.ok(login.data.session);
      tokens.push(login.data.session.access_token);
    }
    const adminDenied = await fetchTimed(new URL("/admin/operations", socketUrl), { headers: { Authorization: `Bearer ${tokens[0]}`, Origin: origin.origin } });
    assert.equal(adminDenied.status, 403, "An ordinary account must not read deployment diagnostics");
    const analyticsDenied = await players[0].rpc("admin_overview", { p_days: 7, p_mode: "all" });
    assert.equal(analyticsDenied.error?.code, "42501", "An ordinary account must not read admin analytics");
    const badOrigin = socketFor(0, "https://unapproved-socket-smoke.invalid");
    await assert.rejects(connect(badOrigin), /handshake failed/, "Unapproved WebSocket Origin must be denied"); badOrigin.disconnect();
    const activeSockets = [socketFor(0), socketFor(1)];
    await Promise.all(activeSockets.map(connect));
    const found = activeSockets.map(socket => packet(socket, message => message.t === "matchFound"));
    rankedQueueEntered = true;
    activeSockets.forEach(socket => socket.emit("message", { t: "findMatch", mode: "ranked" }));
    const matches = await Promise.all(found);
    assert.ok(matches[0].t === "matchFound" && matches[1].t === "matchFound");
    assert.equal(matches[0].roomId, matches[1].roomId, "Both fixtures must match each other; use an isolated deployment");
    assert.equal(matches[0].players.opp.name, displayNames[1]); assert.equal(matches[1].players.opp.name, displayNames[0]);
    matchId = matches[0].roomId;
    const started = activeSockets.map(socket => packet(socket, message => message.t === "state" && !message.paused));
    activeSockets.forEach(socket => socket.emit("message", { t: "joinRoom", roomId: matchId }));
    const initial = (await Promise.all(started))[0] as ServerState;
    assert.equal(initial.mode, "ranked");
    const direction = (["left", "up", "right", "down"] as Dir[]).find(dir => applyMove(initial.you.board, dir, () => 0.5, []).moved);
    assert.ok(direction, "Initial board must have a valid move");
    const movedPacket = packet(activeSockets[0], message => message.t === "state" && !message.paused);
    activeSockets[0].emit("message", { t: "input", dir: direction });
    const moved = await movedPacket as ServerState;
    assert.notDeepEqual(moved.you.board, initial.you.board);
    const pausedPacket = packet(activeSockets[1], message => message.t === "state" && message.paused);
    activeSockets[0].disconnect();
    const paused = await pausedPacket as ServerState;
    assert.ok(paused.reconnectDeadline && paused.reconnectDeadline > paused.serverTime);
    activeSockets[0] = socketFor(0); await connect(activeSockets[0]);
    const resumed = activeSockets.map(socket => packet(socket, message => message.t === "state" && !message.paused));
    activeSockets[0].emit("message", { t: "joinRoom", roomId: matchId });
    const restored = (await Promise.all(resumed))[0] as ServerState;
    assert.deepEqual(restored.you.board, moved.you.board, "Reconnect must preserve the exact board");
    const results = activeSockets.map(socket => packet(socket, message => message.t === "end"));
    const stored = packet(activeSockets[0], message => message.t === "recordStatus" && message.matchId === matchId && message.status === "saved", 45_000);
    // Observe rejection immediately while waiting for the end packets as well.
    const completion = Promise.all([...results, stored]);
    activeSockets[0].emit("message", { t: "surrender" });
    const [loss, win] = await completion;
    assert.ok(loss.t === "end" && win.t === "end");
    assert.equal(loss.reason, "surrender"); assert.equal(loss.winner, "opp"); assert.equal(win.winner, "you");
    assert.equal(loss.matchId, matchId);
    const history = await players[0].from("matches").select("id,mode,reason,match_participants(player_id,result,rating_before,rating_after,rating_delta,telemetry)").eq("id", matchId).single();
    assert.equal(history.error, null); assert.equal(history.data?.mode, "ranked"); assert.equal(history.data?.reason, "surrender");
    assert.deepEqual(history.data.match_participants.map(row => row.player_id).sort(), [...users].sort());
    assert.equal(history.data.match_participants.find(row => row.player_id === users[0])?.telemetry?.moves, 1);
    const stats = await players[0].from("player_ratings").select("player_id,wins,losses,games_played,rating,placement_games").in("player_id", users);
    assert.equal(stats.error, null);
    for (const [index, id] of users.entries()) {
      const row: { player_id: string; wins: number; losses: number; games_played: number; rating: number; placement_games: number } | undefined = stats.data?.find(player => player.player_id === id);
      assert.deepEqual(row, { player_id: id, wins: index, losses: 1 - index, games_played: 1, rating: index ? 1216 : 1184, placement_games: 1 });
      const participant: { rating_before: number; rating_after: number; rating_delta: number } | undefined = history.data.match_participants.find(value => value.player_id === id);
      assert.equal(participant?.rating_before, 1200); assert.equal(participant?.rating_after, row!.rating);
      assert.equal(participant?.rating_delta, index ? 16 : -16);
    }
    console.log("Verified deployed health, allowed/rejected Origin, ordinary-admin denial, ranked move/reconnect/surrender, saved history and 1184/1216 ratings.");
  } finally {
    const ownedMatch = matchId !== undefined && observedRooms.size === 1 && observedRooms.has(matchId);
    // Finish an owned room before deleting its accounts, so no late result targets already-deleted fixtures.
    if (ownedMatch && !endedRooms.has(matchId!) && !savedRooms.has(matchId!)) {
      const live = sockets.slice().reverse().find(socket => socket.connected);
      if (live) {
        const finish = packet(live, message => message.t === "recordStatus" && message.matchId === matchId && message.status === "saved", 45_000);
        live.emit("message", { t: "surrender" });
        try { await finish; } catch { /* Cleanup below reports a pending match instead of deleting its users. */ }
      }
    }
    sockets.forEach(socket => socket.disconnect());
    const cleanupErrors: string[] = [];
    if (rankedQueueEntered && !ownedMatch) cleanupErrors.push(`Ranked pairing is unresolved or not fixture-owned; observed rooms ${[...observedRooms].join(",") || "none"}; retained fixture users ${users.join(",")}`);
    // A database row alone does not confirm that the server has drained its durable outbox.
    if (ownedMatch && savedRooms.has(matchId!)) {
      const participants = await admin.from("match_participants").select("player_id").eq("match_id", matchId);
      if (participants.error || participants.data?.length !== 2 || users.some(id => !participants.data.some(row => row.player_id === id))) cleanupErrors.push(`Refused cleanup of unverified match ${matchId}; retained fixture users ${users.join(",")}`);
      else {
        const removed = await admin.from("matches").delete().eq("id", matchId);
        if (removed.error) cleanupErrors.push(`Match ${matchId}: ${removed.error.code}; retained fixture users ${users.join(",")}`);
      }
    }
    if (ownedMatch && !savedRooms.has(matchId!)) cleanupErrors.push(`Match ${matchId} has no observed saved acknowledgment; retained fixture users ${users.join(",")}`);
    if (!cleanupErrors.length) for (const id of users) {
      const deleted = await admin.auth.admin.deleteUser(id);
      if (deleted.error) cleanupErrors.push(`User ${id}: ${deleted.error.code}`);
    }
    assert.deepEqual(cleanupErrors, [], "Disposable fixture cleanup needs attention");
  }
});
