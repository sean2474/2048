import { z } from "zod";
import { DirSchema, type Board } from "./in-game";

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
export type SoloState = {
  id: string; mode: SoloMode; board: Board; score: number; moves: number; seq: number; elapsedMs: number; maxTile: number;
  status: "playing" | "won" | "lost" | "expired";
  saving: "guest" | "pending" | "saved" | "error";
};
export type SoloReply = { state: SoloState | null; error?: string };
export type SoloRecord = { id: string; playerId: string; mode: SoloMode; elapsedMs: number; moves: number; score: number; maxTile: number };
export type SoloRanking = { player_id: string; name: string; elapsed_ms: number; moves: number };
export function formatSoloTime(ms: number) {
  const centiseconds = Math.floor(Math.max(0, ms) / 10);
  const minutes = String(Math.floor(centiseconds / 6000)).padStart(2, "0");
  const seconds = String(Math.floor(centiseconds / 100) % 60).padStart(2, "0");
  return `${minutes}:${seconds}.${String(centiseconds % 100).padStart(2, "0")}`;
}
