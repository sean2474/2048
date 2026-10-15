import { z } from "zod";
import type { ProfileIconId } from "./profile-icons";
import { MatchModeSchema, type MatchMode } from "./in-game";
const AttackCountsSchema = z.object({ xblock: z.number().int().min(0).max(1_000_000_000), hardblock: z.number().int().min(0).max(1_000_000_000) }).strict();
export const MatchTelemetrySchema = z.object({
  moves: z.number().int().min(0).max(1_000_000_000),
  charged: AttackCountsSchema, sent: AttackCountsSchema, received: AttackCountsSchema,
}).strict();
export type MatchTelemetry = z.infer<typeof MatchTelemetrySchema>;
export const MatchRecordSchema = z.object({
  id: z.string().uuid(), startedAt: z.string().datetime(), endedAt: z.string().datetime(),
  mode: MatchModeSchema.default("casual"),
  reason: z.enum(["reached_2048", "opponent_locked", "surrender", "opponent_disconnected", "draw"]),
  winnerSlot: z.union([z.literal(1), z.literal(2)]).nullable(),
  participants: z.array(z.object({ userId: z.string().uuid().nullable(), score: z.number().int().min(0).max(1_000_000_000), maxTile: z.number().int().min(2).max(2048).refine(value => (value & (value - 1)) === 0), telemetry: MatchTelemetrySchema.optional() })).length(2),
}).refine(record => (record.reason === "draw") === (record.winnerSlot === null))
  .refine(record => Date.parse(record.endedAt) >= Date.parse(record.startedAt));
export type MatchRecord = z.input<typeof MatchRecordSchema>;
export type Account = { id: string; name: string; iconId?: ProfileIconId; rating?: number | null };
export type ResultStatus = "guest" | "saving" | "saved" | "delayed" | "unavailable";
export type LeaderboardRow = { player_id: string; display_name: string; rating: number; wins: number; losses: number; draws: number; games_played: number; highest_score: number; highest_tile: number };
export type HistoryMatch = {
  id: string; started_at: string; ended_at: string; reason: MatchRecord["reason"]; ranked: boolean; mode: MatchMode | "legacy";
  match_participants: { slot: number; player_id: string | null; display_name: string; score: number; max_tile: number; result: "win" | "loss" | "draw"; rating_before: number | null; rating_after: number | null; rating_delta: number | null }[];
};
