import { allowMove } from "./move-limit";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { applyMove, hasMoves, newBoard } from "game-core";
import type { Dir } from "schema/in-game";
import { SOLO_LIMIT_MS, SOLO_SIZE, SoloCommandSchema, SoloCheckpointSchema, type SoloCheckpoint, type SoloMode, type SoloRecord, type SoloReply, type SoloState } from "schema/solo";

export type SoloWriter = (record: SoloRecord) => Promise<void>;
export type SoloProgressStore = {
  read: (key: string) => Promise<SoloCheckpoint | null>;
  write: (key: string, playerId: string | null, checkpoint: SoloCheckpoint) => Promise<void>;
};
type Run = { moveTimes: number[]; state: SoloState; started: number; startedAt: number; lastSeen: number; savedTile: number; playerId: string | null; dirty: boolean };
export function createSoloRun(playerId: string | null, now: number, mode: SoloMode): Run {
  const board = newBoard(Math.random, SOLO_SIZE);
  return { moveTimes: [], started: now, startedAt: Date.now(), lastSeen: now, savedTile: 0, playerId, dirty: true, state: { id: randomUUID(), mode, board, score: 0, moves: 0, seq: 0, elapsedMs: 0, maxTile: Math.max(...board.map(tile => tile.value)), status: "playing", saving: playerId ? "pending" : "guest", progress: "unavailable" } };
}
export function advanceSolo(run: Run, dir: Dir, now: number, rng = Math.random) {
  if (run.state.status !== "playing") return;
  run.state.elapsedMs = Math.max(1, Math.floor(now - run.started));
  if (run.state.mode === "time-attack" && run.state.elapsedMs >= SOLO_LIMIT_MS) { run.state.status = "expired"; return; }
  const result = applyMove(run.state.board, dir, rng, [], true, SOLO_SIZE);
  run.state.seq++;
  if (!result.moved) return;
  run.state.board = result.board;
  run.state.score += result.scoreDelta;
  run.state.moves++;
  run.state.maxTile = Math.max(run.state.maxTile, ...result.board.filter(tile => !tile.ghost).map(tile => tile.value));
  if (run.playerId && Math.min(result.mergedMaxTile, 8192) > run.savedTile && result.mergedMaxTile >= 2048) run.state.saving = "pending";
  if (run.state.mode === "time-attack" && result.mergedMaxTile >= 2048) run.state.status = "won";
  else if (!hasMoves(result.board, SOLO_SIZE)) run.state.status = "lost";
}

const hasRecord = (run: Run) => run.state.mode === "time-attack" ? run.state.status === "won" : run.state.maxTile >= 2048;
export async function saveSoloRun(run: Run, writer?: SoloWriter) {
  if (!run.playerId || !hasRecord(run) || run.state.saving === "saved") return;
  run.state.saving = "pending";
  try {
    if (!writer) throw Error("solo_unavailable");
    const maxTile = Math.min(run.state.maxTile, 8192);
    await writer({ id: run.state.id, playerId: run.playerId, mode: run.state.mode, elapsedMs: run.state.elapsedMs, moves: run.state.moves, score: run.state.score, maxTile });
    run.savedTile = Math.max(run.savedTile, maxTile);
    run.state.saving = Math.min(run.state.maxTile, 8192) > run.savedTile ? "pending" : "saved";
  } catch { run.state.saving = "error"; }
}

export function createSoloService(options: { writeSolo?: SoloWriter; soloProgress?: SoloProgressStore; readSuspensions?: (ids: string[]) => Promise<string[]> }) {
  // shortcut: one server owns live runs; add distributed ownership before running multiple game servers.
  const runs = new Map<string, Run>();
  const sessions = new Map<string, string>();
  const connections = new Map<string, symbol>();
  const jobs = new Map<string, Promise<void>>();
  const checkpoints = new Map<string, Promise<void>>();
  const requests = new Map<string, Promise<SoloReply>>();
  const now = () => performance.now();
  const keyFor = (pid: string, playerId: string | null, guestId = pid) => playerId ? `account:${playerId}` : `guest:${guestId}`;
  const touch = (run: Run) => {
    if (run.state.status !== "playing") return;
    run.state.elapsedMs = Math.max(0, Math.floor(now() - run.started));
    if (run.state.mode === "time-attack" && run.state.elapsedMs >= SOLO_LIMIT_MS) {
      run.state.status = "expired";
      run.dirty = true;
    }
  };
  const snapshot = (key: string): SoloState | null => {
    const run = runs.get(key);
    if (!run) return null;
    touch(run);
    return structuredClone(run.state);
  };
  const flush = (key: string): Promise<void> => {
    const existing = checkpoints.get(key);
    if (existing) return existing;
    const run = runs.get(key);
    if (!run?.dirty || !options.soloProgress) return Promise.resolve();
    touch(run);
    const { progress: _, ...state } = structuredClone(run.state);
    state.board = state.board.filter(tile => !tile.ghost).map(({ id, value, row, col }) => ({ id, value, row, col }));
    const checkpoint: SoloCheckpoint = { version: 1, startedAt: run.startedAt, savedTile: run.savedTile, state };
    run.dirty = false;
    const job = Promise.resolve().then(async () => {
      try {
        await options.soloProgress!.write(key, run.playerId, checkpoint);
        run.state.progress = run.dirty ? "pending" : "saved";
      } catch {
        run.dirty = true;
        run.state.progress = "error";
      } finally { checkpoints.delete(key); }
    });
    checkpoints.set(key, job);
    return job;
  };
  const flushLatest = async (key: string) => {
    await checkpoints.get(key);
    await flush(key);
  };
  const save = async (key: string, run: Run) => {
    if (!run.playerId || !hasRecord(run) || run.state.saving === "saved") return;
    const existing = jobs.get(key);
    if (existing) return existing;
    const job = saveSoloRun(run, options.writeSolo).then(() => { run.dirty = true; });
    jobs.set(key, job);
    await job;
    jobs.delete(key);
  };
  const timer = setInterval(() => {
    for (const [key, run] of runs) {
      if (requests.has(key)) continue;
      touch(run);
      void save(key, run).then(() => flush(key)).then(() => {
        if (now() - run.lastSeen > SOLO_LIMIT_MS + 600_000 && !requests.has(key)
          && (!run.dirty || !options.soloProgress) && !jobs.has(key) && !checkpoints.has(key)) {
          runs.delete(key);
          for (const [pid, session] of sessions) if (session === key) sessions.delete(pid);
        }
      });
    }
  }, 10_000);
  timer.unref();

  const handle = async (key: string, pid: string, playerId: string | null, raw: unknown, canStart: () => boolean, connected: () => boolean): Promise<SoloReply> => {
    const reply = (error?: string): SoloReply => ({ state: snapshot(key), ...(error ? { error } : {}) });
    const parsed = SoloCommandSchema.safeParse(raw);
    if (!parsed.success) return reply("invalid");
    const command = parsed.data;
    try {
      if (!runs.has(key) && sessions.get(pid) !== key && options.soloProgress) {
        if (runs.size >= 5000) return reply("solo_unavailable");
        const stored = await options.soloProgress.read(key);
        if (stored) {
          const checkpoint = SoloCheckpointSchema.parse(stored);
          const state = { ...checkpoint.state, progress: "saved" as const };
          // Negative restored IDs cannot collide with the game engine's new positive tile IDs.
          state.board = state.board.filter(tile => !tile.ghost).map(({ value, row, col }, index) => ({ id: -index - 1, value, row, col }));
          runs.set(key, { state, startedAt: checkpoint.startedAt, started: now() - Math.max(0, Date.now() - checkpoint.startedAt),
            lastSeen: now(), savedTile: checkpoint.savedTile, playerId, dirty: false, moveTimes: [] });
        }
      }
      if (!connected()) return reply("connection_closed");
      sessions.set(pid, key);
      const current = runs.get(key);
      if (current) { current.lastSeen = now(); touch(current); }
      if (command.t === "state") {
        if (current) await save(key, current);
        return reply();
      }
      if (command.t === "start") {
        if (current && hasRecord(current) && ["pending", "error"].includes(current.state.saving)) return reply("save_first");
        if (!canStart()) return reply("already_in_game");
        if (playerId) {
          if (!options.writeSolo || !options.readSuspensions) return reply("solo_unavailable");
          if ((await options.readSuspensions([playerId])).length) return reply("account_suspended");
          if (!canStart()) return reply("already_in_game");
        }
        if (!runs.has(key) && runs.size >= 5000) return reply("solo_unavailable");
        await checkpoints.get(key);
        if (!canStart()) return reply("already_in_game");
        const run = createSoloRun(playerId, now(), command.mode);
        if (options.soloProgress) run.state.progress = "pending";
        runs.set(key, run);
        await flush(key);
        return reply();
      }
      const run = runs.get(key);
      if (!run || run.state.id !== command.id) return reply("run_expired");
      if (command.t === "move" && command.seq === run.state.seq + 1 && run.state.status === "playing") {
        if (!allowMove(run.moveTimes, now())) return reply("move_rate_limited");
        advanceSolo(run, command.dir, now());
        run.dirty = true;
        if (options.soloProgress && run.state.progress !== "error") run.state.progress = "pending";
      }
      if (run.state.status !== "playing" || (hasRecord(run) && run.state.saving === "pending")) await flushLatest(key);
      if (command.t === "save" || run.state.saving === "pending") await save(key, run);
      if (command.t === "save" || run.state.status !== "playing") await flushLatest(key);
      return reply();
    } catch { return reply("solo_unavailable"); }
  };
  return {
    hasSession: (pid: string) => sessions.has(pid),
    deploymentStatus: () => {
      for (const run of runs.values()) touch(run);
      const active = new Set([...sessions.values()].filter(key => runs.get(key)?.state.status === "playing")).size;
      const dirty = options.soloProgress ? [...runs.values()].filter(run => run.dirty).length : 0;
      const unsaved = [...runs.values()].filter(run => run.playerId && hasRecord(run) && run.state.saving !== "saved").length;
      return { active, pending: dirty + unsaved + requests.size + jobs.size + checkpoints.size };
    },
    handle(pid: string, playerId: string | null, raw: unknown, canStart: () => boolean, guestId = pid): Promise<SoloReply> {
      const key = keyFor(pid, playerId, guestId);
      if (requests.has(key)) return Promise.resolve({ state: snapshot(key), error: "busy" });
      const connection = connections.get(pid) ?? Symbol();
      connections.set(pid, connection);
      const job = handle(key, pid, playerId, raw, canStart, () => connections.get(pid) === connection);
      requests.set(key, job);
      void job.finally(() => requests.delete(key));
      return job;
    },
    async disconnect(pid: string, playerId: string | null = null, guestId = pid) {
      const key = keyFor(pid, playerId, guestId);
      sessions.delete(pid);
      connections.delete(pid);
      await requests.get(key);
      await jobs.get(key);
      await flushLatest(key);
    },
    hasPending: (id: string) => {
      const key = keyFor("", id), run = runs.get(key);
      return requests.has(key) || checkpoints.has(key) || jobs.has(key) || !!run?.dirty;
    },
    forget: (id: string) => runs.delete(keyFor("", id)),
    isPlaying: (pid: string, accountId: string) => {
      const key = keyFor(pid, accountId), run = runs.get(key);
      return sessions.get(pid) === key && !!run && run.state.status === "playing"
        && (run.state.mode === "endless" || now() - run.started < SOLO_LIMIT_MS);
    },
    async close() {
      clearInterval(timer);
      await Promise.allSettled(requests.values());
      await Promise.allSettled(jobs.values());
      await Promise.all([...runs.keys()].map(flushLatest));
      runs.clear(); sessions.clear(); connections.clear();
    },
  };
}
