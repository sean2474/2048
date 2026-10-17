import type { Server, Socket } from "socket.io";
import type { FriendActivity, FriendPresence } from "schema/social";
import { rooms } from "./state";

export type FriendsReader = (accessToken: string) => Promise<string[]>;

export function attachFriendPresence(socket: Socket, io: Server, readFriends?: FriendsReader, isSoloPlaying: (pid: string, accountId: string) => boolean = () => false) {
  let started = false, busy = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let previous = "";
  const emit = (value: FriendPresence) => {
    if (!socket.connected) return;
    const next = JSON.stringify(value);
    if (next !== previous) { previous = next; socket.emit("friendPresence", value); }
  };
  const refresh = async () => {
    if (busy || !socket.connected) return;
    busy = true;
    try {
      if (!socket.data.account || !readFriends) throw Error("presence_unavailable");
      // Read accepted friends with this viewer's JWT, never with client-supplied IDs.
      const ids = await readFriends(socket.handshake.auth.accessToken);
      // shortcut: presence is local to one game server; share it when adding multiple game instances.
      const online = new Set<string>(), solo = new Set<string>(), playing = new Set<string>();
      for (const client of io.sockets.sockets.values()) {
        const id: string | undefined = client.data.account?.id;
        if (!id) continue;
        online.add(id);
        if (client.handshake.auth.spectator !== true && isSoloPlaying(client.data.playerId, id)) solo.add(id);
      }
      for (const room of rooms.values()) if (room.open) for (const account of Object.values(room.accounts)) if (account) playing.add(account.id);
      const friends: Record<string, FriendActivity> = {};
      for (const id of ids) friends[id] = playing.has(id) ? "playing" : solo.has(id) ? "solo" : online.has(id) ? "online" : "offline";
      emit({ friends });
    } catch { emit({ error: "presence_unavailable" }); }
    finally { busy = false; }
  };
  socket.on("friends", () => {
    if (started) return;
    started = true;
    socket.data.social = true;
    void refresh();
    timer = setInterval(() => void refresh(), 5000);
    timer.unref();
  });
  socket.on("disconnect", () => clearInterval(timer));
}
