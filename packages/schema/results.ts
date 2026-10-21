import { z } from "zod";
import type { ProfileIconId } from "./profile-icons";
import { ABILITIES, type SkinId } from "./loadout";
import type { RankProgress, Tier } from "./ranking";
import { MatchModeSchema, type MatchMode } from "./in-game";
const AttackCountsSchema = z
  .object({
    xblock: z.number().int().min(0).max(1_000_000_000),
    hardblock: z.number().int().min(0).max(1_000_000_000),
  })
  .strict();
export const MatchTelemetrySchema = z
  .object({
    moves: z.number().int().min(0).max(1_000_000_000),
    charged: AttackCountsSchema,
    sent: AttackCountsSchema,
    received: AttackCountsSchema,
    // The ability chosen before the match and how often it fired; absent on records before ability statistics.
    ability: z
      .string()
      .refine((value) => ABILITIES.some((ability) => ability.id === value))
      .optional(),
    abilityUses: z.number().int().min(0).max(1_000_000_000).optional(),
  })
  .strict();
export type MatchTelemetry = z.infer<typeof MatchTelemetrySchema>;
export const MatchRecordSchema = z
  .object({
    id: z.string().uuid(),
    startedAt: z.string().datetime(),
    endedAt: z.string().datetime(),
    mode: MatchModeSchema.default("casual"),
    reason: z.enum([
      "reached_1024",
      "opponent_locked",
      "surrender",
      "opponent_disconnected",
      "draw",
    ]),
    winnerSlot: z.union([z.literal(1), z.literal(2)]).nullable(),
    participants: z
      .array(
        z.object({
          userId: z.string().uuid().nullable(),
          score: z.number().int().min(0).max(1_000_000_000),
          maxTile: z
            .number()
            .int()
            .min(2)
            .max(2048)
            .refine((value) => (value & (value - 1)) === 0),
          telemetry: MatchTelemetrySchema.optional(),
        }),
      )
      .length(2),
  })
  .refine((record) => (record.reason === "draw") === (record.winnerSlot === null))
  .refine((record) => Date.parse(record.endedAt) >= Date.parse(record.startedAt));
export type MatchRecord = z.input<typeof MatchRecordSchema>;
export type Account = {
  id: string;
  name: string;
  iconId?: ProfileIconId;
  skinId?: SkinId;
  rating?: number | null;
  rank?: RankProgress;
};
export type ResultStatus = "guest" | "saving" | "saved" | "delayed" | "unavailable";
export type LeaderboardRow = RankProgress & {
  player_id: string;
  display_name: string;
  rating: number;
  peak_rating: number | null;
  wins: number;
  losses: number;
  draws: number;
  games_played: number;
  highest_score: number;
  highest_tile: number;
  season_id: string;
  rank_seasons?: { name: string };
};
export type HistoryMatch = {
  id: string;
  started_at: string;
  ended_at: string;
  reason: MatchRecord["reason"];
  ranked: boolean;
  mode: MatchMode | "legacy";
  rank_seasons?: { name: string } | null;
  match_participants: {
    slot: number;
    player_id: string | null;
    display_name: string;
    score: number;
    max_tile: number;
    result: "win" | "loss" | "draw";
    rating_before: number | null;
    rating_after: number | null;
    rating_delta: number | null;
    tier_after?: Tier | null;
    placement_games?: number | null;
  }[];
};
