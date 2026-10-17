import type { RankSnapshot } from "schema/ranking";
import { operationsHandler } from "./operations";
import type { ResultStoreDiagnostics } from "schema/admin";
import type { AccountResolver, SuspensionReader } from "./supabase";
import type { MatchWriter } from "./result-store";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { Server } from "socket.io";
import { ClientMessageSchema } from "schema/in-game";
import { playerChannel } from "./types";
import { playerSockets, disconnectTimers, disconnectDeadlines, rooms, playerRoom, matchmakingQueue, waitingByCode, playerAccounts } from "./state";
import { findMatch, cancelMatch, canQueue, matchWaitingPlayers, type MatchAccess } from "./matchmaking";
import { createRoomWithCode, joinRoomWithCode } from "./rooms";
import { joinRoom, handleInput, handleAttack, handleAbility, handleSurrender, waitForPlayer } from "./game";
import { accountDeletionHandler, type DeleteAccount } from "./account-deletion";
import { feedbackHandler, type FeedbackWriter } from "./feedback";

export function createGameServer(options: { checkAdmin?: (token: string) => Promise<boolean>; readStore?: () => ResultStoreDiagnostics; resolveAccount?: AccountResolver; writeMatch?: MatchWriter; writeFeedback?: FeedbackWriter; readRating?: (userId: string) => Promise<number | RankSnapshot>; hasPendingRanked?: (userId: string) => boolean; readSuspensions?: SuspensionReader; deleteAccount?: DeleteAccount; hasPendingAccount?: (userId: string) => boolean } = {}) {
  const pendingWrites = new Set<Promise<void>>();
  const ratingLookups = new Map<string, Promise<number | RankSnapshot>>();
  const suspensionLookups = new Map<string, Promise<string[]>>();
  let closing = false;
  const deletingAccounts = new Set<string>();
  const accessStops = new Set<() => void>();
  const persistResult: MatchWriter | undefined = options.writeMatch ? record => {
    const job = options.writeMatch!(record);
    pendingWrites.add(job);
    void job.finally(() => pendingWrites.delete(job)).catch(() => {});
    return job;
  } : undefined;
  const operations = operationsHandler(options, new Date().toISOString());
  const httpServer = createServer((req, res) => {
    if (req.url === "/admin/operations") { void operations(req, res); return; }
    if (req.url === "/account/delete") { void deleteAccount(req, res); return; }
    if (req.url === "/feedback") { void submitFeedback(req, res); return; }
    res.writeHead(req.url === "/health" ? 200 : 404, { "Content-Type": "application/json" });
    res.end(JSON.stringify(req.url === "/health" ? { ok: true } : { error: "not_found" }));
  });
  const origins = (process.env.CORS_ORIGINS ?? "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001,https://2048duo.io,https://www.2048duo.io").split(",").map(s => s.trim());
  const io = new Server(httpServer, { cors: { origin: origins }, maxHttpBufferSize: 8192 });
  const submitFeedback = feedbackHandler({ origins, writeFeedback: options.writeFeedback, resolveAccount: options.resolveAccount });
  const deleteAccount = accountDeletionHandler({
    origins, resolveAccount: options.resolveAccount, deleteAccount: options.deleteAccount, deleting: deletingAccounts,
    isPlaying: id => [...rooms.values()].some(room => room.open && Object.values(room.accounts).some(account => account?.id === id)),
    hasPending: id => options.hasPendingAccount?.(id) ?? options.hasPendingRanked?.(id) ?? false,
    disconnect: id => {
      for (const [pid, account] of playerAccounts) if (account?.id === id) {
        cancelMatch(pid);
        io.sockets.sockets.get(playerSockets.get(pid) ?? "")?.disconnect(true);
      }
    },
  });
  const checkAccess: MatchAccess = async (players, requestCurrent, phase) => {
    const snapshots = players.map(pid => ({ pid, socket: playerSockets.get(pid), account: playerAccounts.get(pid)?.id }));
    const current = () => !closing && requestCurrent() && snapshots.every(({ pid, socket, account }) =>
      !!socket && playerSockets.get(pid) === socket && playerAccounts.get(pid)?.id === account && (!account || !deletingAccounts.has(account)));
    if (!current()) return "stale";
    const ids = [...new Set(snapshots.flatMap(player => player.account ? [player.account] : []))].sort();
    if (!ids.length) return "allowed";
    try {
      if (phase === "ratings") {
        if (!options.readRating) throw Error("ranked_unavailable");
        const entries = players.map(pid => matchmakingQueue.find(entry => entry.pid === pid));
        // A manual season transition can happen while either player waits in the queue.
        const ranks = Promise.all(players.map(pid => options.readRating!(playerAccounts.get(pid)!.id)));
        let stopRanks: () => void;
        const stoppedRanks = new Promise<null>(resolve => { stopRanks = () => resolve(null); accessStops.add(stopRanks); });
        const values = await Promise.race([ranks, stoppedRanks]).finally(() => accessStops.delete(stopRanks!));
        if (!values || !current()) return "stale";
        if (values.some(value => !Number.isSafeInteger(typeof value === "number" ? value : value.rating))) throw Error("invalid_rating");
        for (const [index, value] of values.entries()) {
          const rating = typeof value === "number" ? value : value.rating;
          entries[index]!.rating = rating;
          playerAccounts.set(players[index], { ...playerAccounts.get(players[index])!, rating, ...(typeof value !== "number" ? { rank: value.rank } : {}) });
        }
        return "allowed";
      }
      if (!options.readSuspensions) throw Error("account_check_not_configured");
      const key = ids.join(",");
      let lookup = suspensionLookups.get(key);
      if (!lookup) {
        lookup = Promise.resolve().then(() => options.readSuspensions!(ids));
        suspensionLookups.set(key, lookup);
        void lookup.finally(() => suspensionLookups.delete(key)).catch(() => {});
      }
      let stop: () => void;
      const stopped = new Promise<string[]>(resolve => { stop = () => resolve([]); accessStops.add(stop); });
      const suspended = await Promise.race([lookup, stopped]).finally(() => accessStops.delete(stop!));
      if (!current()) return "stale";
      const blocked = snapshots.filter(player => player.account && suspended.includes(player.account));
      for (const { pid } of blocked) {
        cancelMatch(pid);
        io.to(playerChannel(pid)).emit("message", { t: "error", reason: "account_suspended" });
      }
      return blocked.length ? "suspended" : "allowed";
    } catch {
      if (current()) for (const pid of players) {
        cancelMatch(pid);
        io.to(playerChannel(pid)).emit("message", { t: "error", reason: "account_check_failed" });
      }
      return "unavailable";
    }
  };
  const queueTimer = setInterval(() => { void matchWaitingPlayers(io, persistResult, Date.now(), checkAccess); }, 1000);
  queueTimer.unref();
  io.use((socket, next) => {
    void (async () => {
      const token: unknown = socket.handshake.auth?.sessionToken;
      if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) throw new Error("invalid_session");
      if (socket.handshake.auth?.authError) throw new Error("authentication_unavailable");
      const accessToken: unknown = socket.handshake.auth?.accessToken;
      if (accessToken !== undefined && (typeof accessToken !== "string" || accessToken.length > 8192)) throw new Error("invalid_account");
      let account = null;
      if (typeof accessToken === "string" && accessToken) {
        if (!options.resolveAccount) throw new Error("account_auth_not_configured");
        account = await options.resolveAccount(accessToken);
        if (deletingAccounts.has(account.id)) throw new Error("account_deleting");
      }
      const pid = createHash("sha256").update(token).digest("hex");
      const room = rooms.get(playerRoom.get(pid) ?? "");
      if (room && (room.accounts[pid]?.id ?? null) !== (account?.id ?? null)) throw new Error("account_changed");
      socket.data.playerId = pid;
      socket.data.account = account;
      next();
    })().catch(() => next(new Error("authentication_failed")));
  });
  io.on("connection", socket => {
    const pid: string = socket.data.playerId;
    const previous = playerSockets.get(pid);
    if (previous) io.sockets.sockets.get(previous)?.disconnect(true);
    playerSockets.set(pid, socket.id);
    playerAccounts.set(pid, socket.data.account);
    socket.join(playerChannel(pid));
    let windowStart = Date.now(), messages = 0, queueRequest = 0;
    socket.on("message", (raw: unknown) => {
      if (socket.data.account && deletingAccounts.has(socket.data.account.id)) return;
      if (Date.now() - windowStart >= 1000) { windowStart = Date.now(); messages = 0; }
      if (++messages > 30) return;
      const parsed = ClientMessageSchema.safeParse(raw);
      if (!parsed.success) { socket.emit("message", { t: "reject", reason: "invalid" }); return; }
      const msg = parsed.data;
      switch (msg.t) {
        case "findMatch": {
          const request = ++queueRequest;
          if (!canQueue(pid, io)) break;
          cancelMatch(pid);
          const currentRequest = () => !closing && request === queueRequest && playerSockets.get(pid) === socket.id;
          const account = playerAccounts.get(pid);
          if (msg.mode === "ranked") {
            if (!account) { socket.emit("message", { t: "error", reason: "login_required" }); break; }
            if (!options.readRating || !persistResult) { socket.emit("message", { t: "error", reason: "ranked_unavailable" }); break; }
            if (options.hasPendingRanked?.(account.id)) { socket.emit("message", { t: "error", reason: "ranked_result_pending" }); break; }
          }
          void checkAccess([pid], currentRequest).then(async access => {
            if (access !== "allowed" || !currentRequest()) return;
            if (msg.mode === "casual") { findMatch(pid, io, persistResult, "casual", 1200, checkAccess); return; }
            let lookup = ratingLookups.get(account!.id);
            if (!lookup) {
              lookup = Promise.resolve().then(() => options.readRating!(account!.id));
              ratingLookups.set(account!.id, lookup);
              void lookup.finally(() => ratingLookups.delete(account!.id)).catch(() => {});
            }
            const snapshot = await lookup;
            const rating = typeof snapshot === "number" ? snapshot : snapshot.rating;
            if (!currentRequest()) return;
            if (options.hasPendingRanked?.(account!.id)) { socket.emit("message", { t: "error", reason: "ranked_result_pending" }); return; }
            if (!Number.isSafeInteger(rating)) throw new Error("invalid_rating");
            if (typeof snapshot !== "number") playerAccounts.set(pid, { ...account!, rating, rank: snapshot.rank });
            findMatch(pid, io, persistResult, "ranked", rating, checkAccess);
          }).catch(() => {
            if (currentRequest()) socket.emit("message", { t: "error", reason: "ranked_unavailable" });
          });
          break;
        }
        case "cancelMatch": queueRequest++; cancelMatch(pid); break;
        case "createRoomWithCode": {
          const request = ++queueRequest;
          if (!canQueue(pid, io)) break;
          cancelMatch(pid);
          const current = () => !closing && request === queueRequest && playerSockets.get(pid) === socket.id;
          void checkAccess([pid], current).then(access => { if (access === "allowed" && current()) createRoomWithCode(pid, io); });
          break;
        }
        case "joinRoomWithCode": {
          const request = ++queueRequest;
          if (!canQueue(pid, io)) break;
          const current = () => !closing && request === queueRequest && playerSockets.get(pid) === socket.id;
          void joinRoomWithCode(pid, msg.joinCode, io, persistResult, checkAccess, current);
          break;
        }
        case "joinRoom": joinRoom(pid, msg.roomId, io, msg.skinId, msg.abilityId); break;
        case "input": handleInput(pid, msg.dir, io); break;
        case "attack": handleAttack(pid, msg.blockType, io); break;
        case "ability": handleAbility(pid, io); break;
        case "surrender": handleSurrender(pid, io); break;
      }
    });
    socket.on("disconnect", () => {
      queueRequest++;
      if (playerSockets.get(pid) !== socket.id) return;
      playerSockets.delete(pid);
      playerAccounts.delete(pid);
      cancelMatch(pid);
      waitForPlayer(pid, io);
    });
  });
  return { io, httpServer, close: async () => {
    closing = true;
    for (const stop of accessStops) stop();
    accessStops.clear();
    clearInterval(queueTimer);
    for (const timer of disconnectTimers.values()) clearTimeout(timer);
    disconnectTimers.clear(); disconnectDeadlines.clear(); rooms.clear(); playerRoom.clear();
    matchmakingQueue.length = 0; waitingByCode.clear(); playerSockets.clear(); playerAccounts.clear();
    await new Promise<void>(resolve => io.close(() => resolve()));
    await matchWaitingPlayers(io, persistResult, Date.now(), checkAccess);
    await Promise.allSettled([...pendingWrites]);
  } };
}
