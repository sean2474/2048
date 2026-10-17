import { allowMove } from "./move-limit";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { applyMove, hasMoves, newBoard } from "game-core";
import type { Dir } from "schema/in-game";
import { SOLO_LIMIT_MS, SOLO_SIZE, SoloCommandSchema, type SoloMode, type SoloRecord, type SoloReply, type SoloState } from "schema/solo";

export type SoloWriter = (record: SoloRecord) => Promise<void>;
type Run = { moveTimes: number[]; state: SoloState; started: number; lastSeen: number; savedTile: number; playerId: string | null };
export function createSoloRun(playerId: string | null, now: number, mode: SoloMode): Run {
  const board = newBoard(Math.random, SOLO_SIZE);
  return { moveTimes: [], started: now, lastSeen: now, savedTile: 0, playerId, state: { id: randomUUID(), mode, board, score: 0, moves: 0, seq: 0, elapsedMs: 0, maxTile: Math.max(...board.map(tile => tile.value)), status: "playing", saving: playerId ? "pending" : "guest" } };
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
  run.state.maxTile = Math.max(run.state.maxTile, result.mergedMaxTile);
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
    run.savedTile = maxTile;
    run.state.saving = "saved";
  } catch { run.state.saving = "error"; }
}

export function createSoloService(options: { writeSolo?: SoloWriter; readSuspensions?: (ids: string[]) => Promise<string[]> }) {
  const runs = new Map<string, Run>();
  const jobs = new Map<string, Promise<void>>();
  const busy = new Set<string>();
  const now = () => performance.now();
  const cleanup = setInterval(() => {
    for (const [pid, run] of runs) if (now() - run.lastSeen > SOLO_LIMIT_MS + 600_000 && !jobs.has(pid)) runs.delete(pid);
  }, 60_000);
  cleanup.unref();
  const snapshot = (pid: string, playerId: string | null): SoloState | null => {
    const run = runs.get(pid);
    if (!run || run.playerId !== playerId) return null;
    run.lastSeen = now();
    if (run.state.status === "playing") {
      run.state.elapsedMs = Math.max(0, Math.floor(now() - run.started));
      if (run.state.mode === "time-attack" && run.state.elapsedMs >= SOLO_LIMIT_MS) run.state.status = "expired";
    }
    return structuredClone(run.state);
  };
  const save = async (pid: string, run: Run) => {
    if (!run.playerId || !hasRecord(run) || run.state.saving === "saved") return;
    const existing = jobs.get(pid);
    if (existing) return existing;
    // shortcut: boards and unsaved milestones survive only in memory for 70 idle minutes; add a durable outbox for restart recovery.
    const job = saveSoloRun(run, options.writeSolo);
    jobs.set(pid, job);
    await job;
    jobs.delete(pid);
  };
  return {
    async handle(pid: string, playerId: string | null, raw: unknown, canStart: () => boolean): Promise<SoloReply> {
      const reply = (error?: string): SoloReply => ({ state: snapshot(pid, playerId), ...(error ? { error } : {}) });
      const parsed = SoloCommandSchema.safeParse(raw);
      if (!parsed.success) return reply("invalid");
      const command = parsed.data;
      if (command.t === "state") return reply();
      if (busy.has(pid)) return reply("busy");
      busy.add(pid);
      try {
        if (command.t === "start") {
          const previous = runs.get(pid);
          if (previous?.playerId === playerId && hasRecord(previous) && ["pending", "error"].includes(previous.state.saving)) return reply("save_first");
          if (!canStart()) return reply("already_in_game");
          if (playerId) {
            if (!options.writeSolo || !options.readSuspensions) return reply("solo_unavailable");
            if ((await options.readSuspensions([playerId])).length) return reply("account_suspended");
            if (!canStart()) return reply("already_in_game");
          }
          if (!runs.has(pid) && runs.size >= 5000) return reply("solo_unavailable");
          runs.set(pid, createSoloRun(playerId, now(), command.mode));
          return reply();
        }
        const run = runs.get(pid);
        if (!run || run.playerId !== playerId || run.state.id !== command.id) return reply("run_expired");
        if (command.t === "move" && command.seq === run.state.seq + 1 && run.state.status === "playing") {
          if (!allowMove(run.moveTimes, now())) return reply("move_rate_limited");
          advanceSolo(run, command.dir, now());
        }
        if (command.t === "save" || run.state.saving === "pending") await save(pid, run);
        return reply();
      } catch { return reply("solo_unavailable"); }
      finally { busy.delete(pid); }
    },
    hasPending: (id: string) => [...runs.entries()].some(([pid, run]) => run.playerId === id && jobs.has(pid)),
    async close() { clearInterval(cleanup); await Promise.allSettled(jobs.values()); runs.clear(); },
  };
}
