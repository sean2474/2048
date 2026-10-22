import type { Server } from "socket.io";
import type { RematchCommand, RematchState } from "schema/in-game";
import { canQueue, createMatch, type MatchAccess } from "./matchmaking";
import { playerAccounts, playerRoom, playerSockets } from "./state";
import { playerChannel, type Room } from "./types";

type Offer = Pick<Room, "id" | "mode" | "players" | "persistResult"> & {
  identities: (string | null)[];
  sockets: (string | undefined)[];
  accepted: Set<string>;
  expiresAt: number;
  timer: ReturnType<typeof setTimeout>;
  starting: boolean;
  saved: boolean;
};
type CloseReason = NonNullable<RematchState["reason"]>;
const services = new WeakMap<Server, ReturnType<typeof createRematchService>>();

export function offerRematch(room: Room, io: Server) {
  services.get(io)?.offer(room);
}
export function leaveRematch(pid: string, io: Server) {
  services.get(io)?.leave(pid);
}
export function rematchResultSaved(id: string, io: Server) {
  services.get(io)?.saved(id);
}

export function createRematchService(
  io: Server,
  options: {
    checkAccess: MatchAccess;
    rankedReady: (ids: string[]) => boolean;
    isSoloPlaying: (pid: string, accountId: string | null) => boolean;
    unavailable: () => boolean;
  },
  lifetime = 60_000,
) {
  const offers = new Map<string, Offer>();
  const byPlayer = new Map<string, Offer>();
  const send = (pid: string, state: RematchState) =>
    io.to(playerChannel(pid)).emit("message", state);
  const remove = (offer: Offer) => {
    clearTimeout(offer.timer);
    offers.delete(offer.id);
    for (const pid of offer.players) if (byPlayer.get(pid) === offer) byPlayer.delete(pid);
  };
  const close = (offer: Offer, reason: CloseReason) => {
    if (offers.get(offer.id) !== offer) return;
    remove(offer);
    for (const pid of offer.players)
      send(pid, { t: "rematchState", matchId: offer.id, status: "closed", reason });
  };
  const publish = (offer: Offer, reason?: CloseReason) => {
    for (const pid of offer.players)
      send(pid, {
        t: "rematchState",
        matchId: offer.id,
        status: offer.starting
          ? "starting"
          : offer.accepted.has(pid)
            ? "waiting"
            : offer.accepted.size
              ? "requested"
              : "available",
        ...(reason ? { reason } : {}),
      });
  };
  const current = (offer: Offer) =>
    offers.get(offer.id) === offer &&
    Date.now() < offer.expiresAt &&
    !options.unavailable() &&
    offer.players.every(
      (pid, i) =>
        !!offer.sockets[i] &&
        playerSockets.get(pid) === offer.sockets[i] &&
        (playerAccounts.get(pid)?.id ?? null) === offer.identities[i] &&
        !playerRoom.has(pid) &&
        !options.isSoloPlaying(pid, offer.identities[i]),
    );
  const service = {
    offer(room: Room) {
      if (options.unavailable() || room.players.some((pid) => !playerSockets.has(pid))) return;
      for (const pid of room.players) service.leave(pid);
      const offer: Offer = {
        id: room.id,
        mode: room.mode,
        players: [...room.players],
        persistResult: room.persistResult,
        identities: room.players.map((pid) => room.accounts[pid]?.id ?? null),
        sockets: room.players.map((pid) => playerSockets.get(pid)),
        accepted: new Set(),
        expiresAt: Date.now() + lifetime,
        starting: false,
        saved: false,
        timer: setTimeout(() => close(offer, "expired"), lifetime),
      };
      offer.timer.unref();
      offers.set(offer.id, offer);
      for (const pid of offer.players) byPlayer.set(pid, offer);
      publish(offer);
    },
    saved(id: string) {
      const offer = offers.get(id);
      if (offer) {
        offer.saved = true;
        publish(offer);
      }
    },
    leave(pid: string) {
      const offer = byPlayer.get(pid);
      if (offer) close(offer, "left");
    },
    async handle(pid: string, command: RematchCommand) {
      const offer = byPlayer.get(pid);
      if (!offer || offer.id !== command.matchId) {
        send(pid, {
          t: "rematchState",
          matchId: command.matchId,
          status: "closed",
          reason: "expired",
        });
        return;
      }
      if (command.action === "decline" || command.action === "cancel") {
        close(offer, command.action === "decline" ? "declined" : "cancelled");
        return;
      }
      if (!current(offer)) {
        close(offer, Date.now() >= offer.expiresAt ? "expired" : "unavailable");
        return;
      }
      if (offer.starting || offer.accepted.has(pid)) return;
      const rankedReady = () =>
        offer.mode !== "ranked" ||
        (offer.saved &&
          !!offer.persistResult &&
          offer.identities.every(Boolean) &&
          new Set(offer.identities).size === 2 &&
          options.rankedReady(offer.identities as string[]));
      if (!rankedReady()) {
        publish(offer, "ranked_result_pending");
        return;
      }
      offer.accepted.add(pid);
      if (offer.accepted.size < 2) {
        publish(offer);
        return;
      }
      offer.starting = true;
      publish(offer);
      try {
        const valid = () => current(offer);
        if ((await options.checkAccess(offer.players, valid)) !== "allowed" || !valid()) {
          close(offer, "unavailable");
          return;
        }
        if (
          offer.mode === "ranked" &&
          (await options.checkAccess(offer.players, valid, "ratings")) !== "allowed"
        ) {
          close(offer, "unavailable");
          return;
        }
        if (!valid() || !rankedReady() || !offer.players.every((player) => canQueue(player, io))) {
          close(offer, "unavailable");
          return;
        }
        // Consume the invitation before creating a room; duplicate accepts cannot start another.
        remove(offer);
        const roomId = createMatch(
          offer.players[0],
          offer.players[1],
          io,
          "matchFound",
          offer.persistResult,
          offer.mode,
        );
        for (const player of offer.players)
          io.to(playerChannel(player)).emit("message", {
            t: "rematchReady",
            matchId: offer.id,
            roomId,
          });
      } catch {
        close(offer, "unavailable");
      }
    },
    close() {
      for (const offer of offers.values()) close(offer, "unavailable");
    },
  };
  services.set(io, service);
  return service;
}
