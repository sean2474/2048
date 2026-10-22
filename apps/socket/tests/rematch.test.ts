import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { Server } from "socket.io";
import { C2S, type RematchState } from "schema/in-game";
import { createRematchService } from "../src/rematch";
import { playerSockets, playerAccounts } from "../src/state";
import type { Room } from "../src/types";

test("rematch commands reject malformed IDs, unsupported actions and extra identity fields", () => {
  const command = { t: "rematch", matchId: randomUUID(), action: "accept" };
  assert.equal(C2S.rematch.safeParse(command).success, true);
  for (const extra of [{ matchId: "bad" }, { action: "start" }, { opponentId: "someone-else" }])
    assert.equal(C2S.rematch.safeParse({ ...command, ...extra }).success, false);
});

test("rematch expiry notifies both players and rejects a late acceptance", async (t) => {
  const messages: { channel: string; value: RematchState }[] = [];
  const io = {
    to: (channel: string) => ({
      emit: (_event: string, value: RematchState) => messages.push({ channel, value }),
    }),
  } as unknown as Server;
  const service = createRematchService(
    io,
    {
      checkAccess: async () => {
        throw Error("Expired requests must not check account access");
      },
      rankedReady: () => true,
      isSoloPlaying: () => false,
      unavailable: () => false,
    },
    15,
  );
  for (const pid of ["a", "b"]) {
    playerSockets.set(pid, `socket-${pid}`);
    playerAccounts.set(pid, null);
  }
  t.after(() => {
    service.close();
    for (const pid of ["a", "b"]) {
      playerSockets.delete(pid);
      playerAccounts.delete(pid);
    }
  });
  const id = randomUUID();
  service.offer({
    id,
    mode: "casual",
    players: ["a", "b"],
    accounts: { a: null, b: null },
  } as unknown as Room);
  await service.handle("a", { t: "rematch", matchId: id, action: "accept" });
  await delay(30);
  const expired = messages.filter(({ value }) => value.status === "closed");
  assert.deepEqual(expired.map(({ channel }) => channel).sort(), ["player:a", "player:b"]);
  assert.ok(expired.every(({ value }) => value.reason === "expired"));
  await service.handle("b", { t: "rematch", matchId: id, action: "accept" });
  assert.equal(messages.at(-1)?.value.status, "closed");
});
