import { createServer } from "node:http";
import { performance } from "node:perf_hooks";
import { cpus } from "node:os";
import { Server } from "socket.io";
import { createAbilityState } from "game-core";
import { broadcast, snapshot } from "../src/game";
import { playerChannel, spectatorChannel, type Room, type PlayerState } from "../src/types";

// CPU-only diagnostic: no listening port, network clients, database or game moves.
const http = createServer(), io = new Server(http);
const player = (): PlayerState => ({ board: Array.from({ length: 25 }, (_, id) => ({ id, value: 2 ** (1 + id % 5), row: Math.floor(id / 5), col: id % 5 })),
  score: 512, maxTile: 32, ability: createAbilityState(), pending: [], telemetry: { moves: 100, charged: { xblock: 2, hardblock: 1 }, sent: { xblock: 2, hardblock: 1 }, received: { xblock: 1, hardblock: 0 } } });
const room: Room = { id: "benchmark", mode: "friend", players: ["a", "b"], ready: new Set(["a", "b"]), state: { a: player(), b: player() }, rng: () => 0.5, open: true, startedAt: "2026-01-01T00:00:00Z", accounts: { a: null, b: null } };
const iterations = 20_000;
// Exact pre-change broadcast from 8804ca0, measured in the same process to reduce drift.
function baseline() {
  for (const pid of room.players) {
    const state = snapshot(room, pid);
    io.to(playerChannel(pid)).emit("message", state);
    io.to(spectatorChannel(room.id, pid)).emit("spectate", { state });
  }
}
const candidates = { baseline, optimized: () => broadcast(room, io) };
for (let index = 0; index < 2000; index++) { candidates.baseline(); candidates.optimized(); }
const samples: Record<string, number[]> = { baseline: [], optimized: [] };
for (let run = 0; run < 7; run++) {
  const order = Object.entries(candidates);
  if (run % 2) order.reverse();
  for (const [name, candidate] of order) {
    const started = performance.now();
    for (let index = 0; index < iterations; index++) candidate();
    samples[name].push((performance.now() - started) / iterations);
  }
}
const medians = Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, [...values].sort((a, b) => a - b)[3]]));
console.log(JSON.stringify({ node: process.version, cpu: cpus()[0]?.model, iterations, runs: 7, scenario: "paired alternating full 5x5 boards; no spectator subscribers; real Socket.IO JSON encoding and WebSocket framing, no network writes", msPerBroadcast: samples, medianMs: medians, reductionPercent: (1 - medians.optimized / medians.baseline) * 100 }, null, 2));
void io.close();
