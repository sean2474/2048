import type { MatchMode } from "./in-game";
import type { MatchRecord, MatchTelemetry } from "./results";

export type AdminMode = "all" | MatchMode;
export type AdminTelemetry = MatchTelemetry;
export type AdminOverview = {
  periodDays: number;
  totals: { matches: number; rankedMatches: number; players: number; avgDurationSeconds: number | null; avgScore: number | null; telemetryParticipants: number; unmeasuredParticipants: number; avgMoves: number | null };
  modes: { mode: MatchMode | "legacy"; matches: number }[];
  reasons: { reason: MatchRecord["reason"]; matches: number }[];
  daily: { date: string; matches: number }[];
  tiers: { tier: string; players: number }[];
  attacks: { type: "xblock" | "hardblock"; charged: number; sent: number; received: number; participantsWhoSent: number; winsWhenSent: number }[];
};
export type AdminPlayer = {
  id: string; name: string; username: string | null; email: string | null; createdAt: string;
  suspendedAt: string | null; suspensionReason: string | null;
  rating: number; gamesPlayed: number; wins: number; losses: number; draws: number; isAdmin: boolean;
};
export type AdminPlayersResult = { total: number; players: AdminPlayer[] };
export type AdminPlayerDetail = {
  player: AdminPlayer;
  matches: { id: string; endedAt: string; mode: MatchMode | "legacy"; reason: MatchRecord["reason"]; durationSeconds: number; score: number; maxTile: number; result: "win" | "loss" | "draw"; ratingBefore: number | null; ratingAfter: number | null; ratingDelta: number | null; telemetry: AdminTelemetry | null }[];
  audit: { id: string; createdAt: string; actorId: string; action: "suspend" | "unsuspend"; reason: string }[];
};
