import { randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import { FriendChallengeCommandSchema, type ChallengeEvent, type ChallengeReply, type FriendChallenge } from "schema/social";
import type { FriendsReader } from "./friend-presence";
import type { MatchWriter } from "./result-store";
import { createMatch } from "./matchmaking";
import { matchmakingQueue, playerAccounts, rooms, waitingByCode } from "./state";

type Pending = FriendChallenge & { senderSocketId: string };

export function createFriendChallenges(io: Server, options: {
  readFriends?: FriendsReader;
  persistResult?: MatchWriter;
  isSoloPlaying: (pid: string, accountId: string) => boolean;
  unavailable: (accountId: string) => boolean;
}) {
  const invitations = new Map<string, Pending>();
  const locked = new Set<string>();
  const lastSent = new Map<string, number>();
  let closed = false;
  const socialSockets = (id: string) => [...io.sockets.sockets.values()].filter(socket => socket.data.account?.id === id && socket.data.social && socket.handshake.auth.spectator === true);
  const occupied = (id: string) => options.unavailable(id)
    || [...rooms.values()].some(room => room.open && Object.values(room.accounts).some(account => account?.id === id))
    || [...io.sockets.sockets.values()].some(socket => socket.data.account?.id === id && socket.handshake.auth.spectator !== true && options.isSoloPlaying(socket.data.playerId, id))
    || [...matchmakingQueue.map(entry => entry.pid), ...waitingByCode.values()].some(pid => playerAccounts.get(pid)?.id === id);
  const pendingFor = (id: string) => [...invitations.values()].some(invitation => invitation.from.id === id || invitation.to.id === id);
  const notify = (invitation: Pending, event: ChallengeEvent) => {
    for (const id of [invitation.from.id, invitation.to.id]) for (const socket of socialSockets(id)) socket.emit("challenge", event);
  };
  const finish = (invitation: Pending, reason: Extract<ChallengeEvent, { t: "closed" }>["reason"]) => {
    if (!invitations.delete(invitation.id)) return;
    notify(invitation, { t: "closed", id: invitation.id, reason });
  };
  const sweep = setInterval(() => {
    for (const invitation of invitations.values()) {
      if (Date.now() >= invitation.expiresAt) finish(invitation, "expired");
      else if (occupied(invitation.from.id) || occupied(invitation.to.id)) finish(invitation, "unavailable");
    }
    for (const [id, at] of lastSent) if (Date.now() - at > 60_000) lastSent.delete(id);
  }, 1000);
  sweep.unref();

  return {
    attach(socket: Socket) {
      let working = false;
      socket.on("challenge", async (raw: unknown, acknowledge: unknown) => {
        if (typeof acknowledge !== "function") return;
        const reply = (value: ChallengeReply) => acknowledge(value);
        const parsed = FriendChallengeCommandSchema.safeParse(raw);
        if (!parsed.success) { reply({ error: "invalid" }); return; }
        const me: string | undefined = socket.data.account?.id;
        if (closed || !me || !socket.data.social || socket.handshake.auth.spectator !== true || !options.readFriends) { reply({ error: "unavailable" }); return; }
        if (working) { reply({ error: "busy" }); return; }
        const command = parsed.data;
        const invitation = command.t === "send" ? undefined : invitations.get(command.id);
        if (command.t !== "send" && (!invitation || (command.t === "cancel" ? invitation.from.id !== me : invitation.to.id !== me))) { reply({ error: "expired" }); return; }
        if (command.t === "decline" || command.t === "cancel") {
          finish(invitation!, command.t === "decline" ? "declined" : "cancelled"); reply({}); return;
        }
        const other = command.t === "send" ? command.playerId : invitation!.from.id;
        if (other === me) { reply({ error: "invalid" }); return; }
        if (locked.has(me) || locked.has(other)) { reply({ error: "busy" }); return; }
        if (command.t === "send") {
          if (pendingFor(me) || pendingFor(other)) { reply({ error: "busy" }); return; }
          if (Date.now() - (lastSent.get(me) ?? 0) < 5000) { reply({ error: "rate_limited" }); return; }
          lastSent.set(me, Date.now());
        }
        working = true; locked.add(me); locked.add(other);
        try {
          if (!(await options.readFriends(socket.handshake.auth.accessToken)).includes(other)) {
            if (invitation) finish(invitation, "unavailable");
            reply({ error: "not_friends" }); return;
          }
          if (closed || !socket.connected) return;
          const target = command.t === "send" ? socialSockets(other)[0] : io.sockets.sockets.get(invitation!.senderSocketId);
          if (!target?.connected || target.data.account?.id !== other) { if (invitation) finish(invitation, "unavailable"); reply({ error: "offline" }); return; }
          if (occupied(me) || occupied(other) || socket.data.playerId === target.data.playerId) {
            if (invitation) finish(invitation, "unavailable"); reply({ error: "busy" }); return;
          }
          if (command.t === "send") {
            const publicInvitation: FriendChallenge = { id: randomUUID(), from: { id: me, name: socket.data.account.name }, to: { id: other, name: target.data.account.name }, expiresAt: Date.now() + 30_000 };
            const pending = { ...publicInvitation, senderSocketId: socket.id };
            invitations.set(pending.id, pending); notify(pending, { t: "pending", invitation: publicInvitation }); reply({});
          } else {
            if (invitations.get(invitation!.id) !== invitation || Date.now() >= invitation!.expiresAt) { if (invitation) finish(invitation, "expired"); reply({ error: "expired" }); return; }
            // Both tabs keep their existing private session capabilities when entering the game.
            const roomId = createMatch(target.data.playerId, socket.data.playerId, io, "roomReady", options.persistResult, "friend", new Map([
              [target.data.playerId, target.data.account], [socket.data.playerId, socket.data.account],
            ]));
            finish(invitation!, "accepted");
            const event: ChallengeEvent = { t: "start", id: invitation!.id, roomId };
            target.emit("challenge", event); socket.emit("challenge", event); reply({});
          }
        } catch { if (invitation) finish(invitation, "unavailable"); reply({ error: "unavailable" }); }
        finally { working = false; locked.delete(me); locked.delete(other); }
      });
      socket.on("disconnect", () => {
        for (const invitation of invitations.values()) if (invitation.senderSocketId === socket.id || !socialSockets(invitation.to.id).length) finish(invitation, "unavailable");
      });
    },
    close() { closed = true; clearInterval(sweep); invitations.clear(); locked.clear(); lastSent.clear(); },
  };
}
