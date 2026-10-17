import type { Socket } from "socket.io";
import { SpectateRequestSchema, type SpectateUpdate } from "schema/social";
import { rooms } from "./state";
import { snapshot } from "./game";
import { spectatorChannel, type Room } from "./types";

export type SpectateAccess = (viewerId: string, targetId: string, ranked: boolean) => Promise<boolean>;

export function attachSpectator(socket: Socket, canSpectate?: SpectateAccess) {
  let version = 0, lastRequest = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let channel: string | undefined;
  const leave = () => {
    clearTimeout(timer);
    if (channel) void socket.leave(channel);
    channel = undefined;
  };
  const emit = (update: SpectateUpdate) => socket.emit("spectate", update);
  const watch = async (targetId: string, request: number, previous?: Room) => {
    if (previous && !previous.open) { leave(); return; }
    const viewerId: string | undefined = socket.data.account?.id;
    if (!viewerId) { emit({ error: "login_required" }); return; }
    if (!canSpectate) { emit({ error: "spectate_unavailable" }); return; }
    const room = previous ?? [...rooms.values()].find(r => r.open && r.players.some(pid => r.accounts[pid]?.id === targetId));
    const pid = room?.players.find(pid => room.accounts[pid]?.id === targetId);
    if (!room || !pid) { emit({ error: "not_spectatable" }); return; }
    try {
      const allowed = await canSpectate(viewerId, targetId, room.mode === "ranked");
      if (!socket.connected || request !== version) return;
      if (previous && !room.open) { leave(); return; }
      if (!allowed || !room.open) { leave(); emit({ error: "not_spectatable" }); return; }
      channel = spectatorChannel(room.id, pid);
      await socket.join(channel);
      emit({ state: snapshot(room, pid) });
      // Recheck access every five seconds; failed checks close the subscription.
      timer = setTimeout(() => void watch(targetId, request, room), 5000);
      timer.unref();
    } catch {
      if (socket.connected && request === version) { leave(); emit({ error: "spectate_unavailable" }); }
    }
  };
  socket.on("watch", (raw: unknown) => {
    if (Date.now() - lastRequest < 1000) { emit({ error: "rate_limited" }); return; }
    lastRequest = Date.now();
    const request = ++version;
    leave();
    const parsed = SpectateRequestSchema.safeParse(raw);
    if (!parsed.success) { emit({ error: "invalid" }); return; }
    void watch(parsed.data.playerId, request);
  });
  socket.on("disconnect", () => { version++; leave(); });
}
