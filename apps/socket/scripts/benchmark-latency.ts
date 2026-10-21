import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { io, type Socket } from "socket.io-client";
import { applyMove } from "game-core";
import type { Dir, ServerMessage, ServerState } from "schema/in-game";
import { SoloStateSchema, type SoloCommand, type SoloReply } from "schema/solo";

// Remote runs are deliberately bounded and never enter a public or ranked queue.
const targets = {
  staging: { socket: "https://2048-socket-staging.fly.dev", origin: "https://2048-web-staging.vercel.app" },
  production: { socket: "https://2048-socket.fly.dev", origin: "https://www.2048duo.io" },
} as const;
const target = process.argv[2];
if (target !== "staging" && target !== "production") throw Error("Choose exactly staging or production; an explicit remote target is required.");
const destination = process.argv[3];
if (!destination) throw Error("Supply a new output JSON path to preserve earlier measurements.");
const endpoint = targets[target];
const samples: Record<string, number[]> = {};
const sockets = new Set<Socket>();
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const sample = (name: string, started: number) => (samples[name] ??= []).push(performance.now() - started);
const report = { target, measuredAt: new Date().toISOString(), endpoint, transport: "websocket", client: { node: process.version, platform: process.platform, arch: process.arch },
  limits: { friendRooms: 3, friendMovesPerRoom: 12, soloRuns: 1, soloMoves: 12, minimumInputSpacingMs: 150 },
  methodology: "Sequential guest private friend rooms and one guest solo run. No account tokens, public queues or synthetic load. RTT includes Internet routing and client scheduling; not isolated server CPU. p95 is nearest-rank in a small, correlated sample. Multiplayer has state responses, not input acknowledgements; no application ping protocol exists. HTTP health RTT is recorded separately. Guest records/checkpoints may persist normally; no remote data is deleted.",
  samples, summary: {} as Record<string, { n: number; p50: number; p95: number; max: number }>, failure: null as string | null, cleanupFailures: [] as string[] };

function packet(socket: Socket, predicate: (message: ServerMessage) => boolean): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timeout); socket.off("message", handler); socket.off("disconnect", disconnected); };
    const handler = (message: ServerMessage) => {
      if (message.t === "error" || message.t === "reject" || message.t === "actionRejected") { cleanup(); reject(Error(`Server rejected benchmark: ${message.reason}`)); }
      else if (predicate(message)) { cleanup(); resolve(message); }
    };
    const disconnected = () => { cleanup(); reject(Error("Socket disconnected during response")); };
    const timeout = setTimeout(() => { cleanup(); reject(Error("Response timed out")); }, 8000);
    socket.on("message", handler); socket.once("disconnect", disconnected);
  });
}

async function connect() {
  const socket = io(endpoint.socket, { transports: ["websocket"], reconnection: false, autoConnect: false, timeout: 8000,
    auth: { sessionToken: randomBytes(32).toString("hex"), soloToken: randomBytes(32).toString("hex") }, extraHeaders: { Origin: endpoint.origin } });
  sockets.add(socket);
  const started = performance.now();
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve); socket.once("connect_error", reject); socket.connect();
  });
  sample("connectMs", started);
  return socket;
}

async function friendRoom() {
  const a = await connect(), b = await connect();
  let active = false;
  try {
    let started = performance.now();
    const waiting = packet(a, message => message.t === "waitingForPlayer");
    a.emit("message", { t: "createRoomWithCode" });
    const code = await waiting;
    assert.equal(code.t, "waitingForPlayer");
    if (code.t !== "waitingForPlayer") throw Error("Missing private room code");
    sample("createRoomMs", started);
    const readyA = packet(a, message => message.t === "roomReady"), readyB = packet(b, message => message.t === "roomReady");
    started = performance.now();
    b.emit("message", { t: "joinRoomWithCode", joinCode: code.joinCode });
    const [ready] = await Promise.all([readyA, readyB]);
    if (ready.t !== "roomReady") throw Error("Missing room readiness");
    active = true;
    sample("joinRoomMs", started);
    const stateA = packet(a, message => message.t === "state" && !message.paused), stateB = packet(b, message => message.t === "state" && !message.paused);
    started = performance.now();
    a.emit("message", { t: "joinRoom", roomId: ready.roomId });
    b.emit("message", { t: "joinRoom", roomId: ready.roomId });
    const first = await Promise.all([stateA, stateB]);
    sample("joinToPlayableStateMs", started);
    let states = first as ServerState[];
    for (let index = 0; index < report.limits.friendMovesPerRoom; index++) {
      await wait(report.limits.minimumInputSpacingMs);
      const mover = index % 2, other = 1 - mover;
      const direction = (["left", "down", "right", "up"] as Dir[]).find(dir => applyMove(states[mover].you.board, dir, () => 0.5, [], false).moved);
      if (!direction) break;
      started = performance.now();
      const responses = [a, b].map((socket, slot) => packet(socket, message => message.t === "state" || message.t === "end").then(message => {
        sample(slot === mover ? "moveSelfStateMs" : "moveOpponentStateMs", started);
        return message;
      }));
      [a, b][mover].emit("message", { t: "input", dir: direction });
      const next = await Promise.all(responses);
      if (next.some(message => message.t === "end")) { active = false; break; }
      states = next as ServerState[];
      assert.deepEqual(states[mover].you, states[other].opp, "opponent receives the same authoritative player state");
    }
    if (active) {
      const ended = [a, b].map(socket => packet(socket, message => message.t === "end"));
      started = performance.now(); a.emit("message", { t: "surrender" });
      await Promise.all(ended); active = false; sample("surrenderMs", started);
    }
  } finally {
    if (active) {
      const connected = [a, b].find(socket => socket.connected);
      if (connected) {
        const ended = packet(connected, message => message.t === "end");
        connected.emit("message", { t: "surrender" });
        try { await ended; }
        catch { report.cleanupFailures.push("Could not confirm the test match ended; normal reconnect grace may remain."); }
      } else report.cleanupFailures.push("Both test sockets disconnected before a result; normal reconnect grace may remain.");
    }
    a.disconnect(); b.disconnect(); sockets.delete(a); sockets.delete(b);
  }
}

async function solo() {
  const socket = await connect();
  const command = async (message: SoloCommand, name: string) => {
    const started = performance.now();
    const reply = await socket.timeout(8000).emitWithAck("solo", message) as SoloReply;
    sample(name, started);
    if (reply.error || !reply.state) throw Error(`Solo response: ${reply.error ?? "missing state"}`);
    return SoloStateSchema.parse(reply.state);
  };
  try {
    let state = await command({ t: "start", mode: "time-attack" }, "soloStartMs");
    for (let index = 0; index < report.limits.soloMoves && state.status === "playing"; index++) {
      await wait(report.limits.minimumInputSpacingMs);
      const direction = (["left", "down", "right", "up"] as Dir[]).find(dir => applyMove(state.board, dir, () => 0.5, [], false, 4).moved);
      if (!direction) break;
      state = await command({ t: "move", id: state.id, seq: state.seq + 1, dir: direction }, "soloMoveAckMs");
    }
  } finally { socket.disconnect(); sockets.delete(socket); }
}

async function main() {
  const output = resolve(destination!);
  await mkdir(dirname(output), { recursive: true });
  // Reserve the artifact before touching a remote service; reruns cannot overwrite evidence.
  const artifact = await open(output, "wx");
  try {
    for (let index = 0; index < 5; index++) {
      const started = performance.now();
      const response = await fetch(`${endpoint.socket}/health`, { headers: { Origin: endpoint.origin }, signal: AbortSignal.timeout(8000) });
      assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true });
      sample("healthHttpMs", started); await wait(150);
    }
    for (let index = 0; index < report.limits.friendRooms; index++) await friendRoom();
    await solo();
  } catch (error) { report.failure = error instanceof Error ? error.message : "Unknown measurement failure"; process.exitCode = 1; }
  finally {
    for (const socket of sockets) socket.disconnect();
    for (const [name, values] of Object.entries(samples)) {
      const sorted = [...values].sort((a, b) => a - b);
      report.summary[name] = { n: sorted.length, p50: sorted[Math.ceil(sorted.length * 0.5) - 1], p95: sorted[Math.ceil(sorted.length * 0.95) - 1], max: sorted.at(-1)! };
    }
    try { await artifact.writeFile(JSON.stringify(report, null, 2) + "\n"); }
    finally { await artifact.close(); }
    console.log(JSON.stringify({ target, summary: report.summary, failure: report.failure, cleanupFailures: report.cleanupFailures, output }, null, 2));
  }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "Benchmark failed"); process.exitCode = 1; });
