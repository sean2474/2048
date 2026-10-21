import assert from "node:assert/strict";
import { test } from "node:test";
import { createAbilityState } from "game-core";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { broadcast, snapshot } from "../src/game";
import { spectatorChannel, type PlayerState, type Room } from "../src/types";

test("broadcast encodes spectator state only for subscribed perspectives and keeps player payloads intact", async t => {
  const io = new Server(createServer());
  t.after(() => { void io.close(); });
  const player = (): PlayerState => ({ board: [{ id: 1, value: 2, row: 0, col: 0 }], score: 0, maxTile: 2, ability: createAbilityState(), pending: [],
    telemetry: { moves: 0, charged: { xblock: 0, hardblock: 0 }, sent: { xblock: 0, hardblock: 0 }, received: { xblock: 0, hardblock: 0 } } });
  const room: Room = { id: "test", mode: "friend", players: ["a", "b"], ready: new Set(["a", "b"]), state: { a: player(), b: player() }, rng: () => 0.5, open: true,
    pausedAt: 1234, startedAt: "2026-01-01T00:00:00Z", accounts: { a: null, b: null } };
  room.state.a.pending.push({ type: "addBlock", blockType: "xblock" });
  const adapter = io.sockets.adapter;
  const observed = t.mock.method(adapter, "broadcast");
  broadcast(room, io);
  assert.equal(observed.mock.callCount(), 2, "without spectators only the two player packets are serialized");
  assert.deepEqual(observed.mock.calls.map(call => call.arguments[0].data), [["message", snapshot(room, "a")], ["message", snapshot(room, "b")]]);

  observed.mock.resetCalls();
  const channel = spectatorChannel(room.id, "a");
  adapter.addAll("viewer", new Set([channel]));
  broadcast(room, io);
  assert.equal(observed.mock.callCount(), 3, "only the watched perspective adds a spectator packet");
  const spectate = observed.mock.calls.filter(call => call.arguments[0].data[0] === "spectate");
  assert.equal(spectate.length, 1);
  assert.deepEqual(spectate[0].arguments[0].data, ["spectate", { state: snapshot(room, "a") }]);
  assert.deepEqual(spectate[0].arguments[1].rooms, new Set([channel]));

  observed.mock.resetCalls();
  adapter.delAll("viewer");
  broadcast(room, io);
  assert.equal(observed.mock.callCount(), 2, "the last spectator leaving removes the encoding work");
});
