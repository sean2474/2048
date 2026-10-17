import { z } from "zod";
import { DirSchema } from "./in-game";

export const SOLO_LIMIT_MS = 60 * 60 * 1000;
export const SOLO_SIZE = 4;
export const SoloModeSchema = z.enum(["time-attack", "endless"]);
export type SoloMode = z.infer<typeof SoloModeSchema>;
export const SoloCommandSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("state") }).strict(),
  z.object({ t: z.literal("start"), mode: SoloModeSchema }).strict(),
  z.object({ t: z.literal("save"), id: z.string().uuid() }).strict(),
  z.object({ t: z.literal("move"), id: z.string().uuid(), seq: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), dir: DirSchema }).strict(),
]);
export type SoloCommand = z.infer<typeof SoloCommandSchema>;
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const SoloStateSchema = z.object({
  id: z.string().uuid(), mode: SoloModeSchema,
  board: z.array(z.object({
    id: z.number().int().safe(), value: z.number().int().min(2).safe().refine(value => Number.isInteger(Math.log2(value))),
    row: z.number().int().min(0).max(3), col: z.number().int().min(0).max(3),
    spawned: z.boolean().optional(), merged: z.boolean().optional(), ghost: z.boolean().optional(),
  })).min(1).max(32),
  score: count, moves: count, seq: count, elapsedMs: count, maxTile: count,
  status: z.enum(["playing", "won", "lost", "expired"]),
  saving: z.enum(["guest", "pending", "saved", "error"]),
  progress: z.enum(["pending", "saved", "error", "unavailable"]),
});
export type SoloState = z.infer<typeof SoloStateSchema>;
export const SoloCheckpointSchema = z.object({
  version: z.literal(1), startedAt: count, savedTile: count,
  state: SoloStateSchema.omit({ progress: true }),
}).refine(({ state }) => {
  const board = state.board.filter(tile => !tile.ghost);
  return board.length > 0 && board.length <= 16 && new Set(board.map(tile => tile.row * 4 + tile.col)).size === board.length
    && state.seq >= state.moves && board.every(tile => tile.value <= state.maxTile);
});
export type SoloCheckpoint = z.infer<typeof SoloCheckpointSchema>;
export type SoloReply = { state: SoloState | null; error?: string };
export type SoloRecord = { id: string; playerId: string; mode: SoloMode; elapsedMs: number; moves: number; score: number; maxTile: number };
export type SoloRanking = { player_id: string; name: string; elapsed_ms: number; moves: number };
export function formatSoloTime(ms: number) {
  const centiseconds = Math.floor(Math.max(0, ms) / 10);
  const minutes = String(Math.floor(centiseconds / 6000)).padStart(2, "0");
  const seconds = String(Math.floor(centiseconds / 100) % 60).padStart(2, "0");
  return `${minutes}:${seconds}.${String(centiseconds % 100).padStart(2, "0")}`;
}
