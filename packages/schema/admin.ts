import type { MatchMode } from "./in-game";
import type { MatchRecord, MatchTelemetry } from "./results";
import type { CoinTransactionReason } from "./economy";

export type AdminMode = "all" | MatchMode;
export type AdminTelemetry = MatchTelemetry;
export type AdminOverview = {
  periodDays: number;
  periodStart: string; periodEnd: string;
  totals: { matches: number; rankedMatches: number; players: number; avgDurationSeconds: number | null; avgScore: number | null; telemetryParticipants: number; unmeasuredParticipants: number; avgMoves: number | null };
  modes: { mode: MatchMode | "legacy"; matches: number }[];
  reasons: { reason: MatchRecord["reason"]; matches: number }[];
  daily: { date: string; matches: number }[];
  tiers: { tier: string; players: number }[];
  attacks: { type: "xblock" | "hardblock"; charged: number; sent: number; received: number; participantsWhoSent: number; winsWhenSent: number }[];
  // Absent on databases that have not applied the ability statistics migration.
  abilities?: { ability: string; participants: number; wins: number; uses: number }[];
};
export type AdminPlayer = {
  id: string; name: string; username: string | null; email: string | null; createdAt: string;
  suspendedAt: string | null; suspensionReason: string | null;
  tier?: string | null; placementGames?: number; peakRating?: number | null;
  rating: number; gamesPlayed: number; wins: number; losses: number; draws: number; isAdmin: boolean;
};
export type AdminPlayersResult = { total: number; players: AdminPlayer[] };
export type AdminPlayerDetail = {
  player: AdminPlayer;
  matches: { id: string; endedAt: string; mode: MatchMode | "legacy"; reason: MatchRecord["reason"]; durationSeconds: number; score: number; maxTile: number; result: "win" | "loss" | "draw"; ratingBefore: number | null; ratingAfter: number | null; ratingDelta: number | null; telemetry: AdminTelemetry | null }[];
  audit: { id: string; createdAt: string; actorId: string; action: "suspend" | "unsuspend"; reason: string }[];
};

export type AdminCoinTransaction = {
  id: number; delta: number; balanceAfter: number; reason: CoinTransactionReason;
  reference: Record<string, unknown>; actorId: string | null; note: string | null; createdAt: string;
};
export type AdminCoinHistory = { balance: number; transactions: AdminCoinTransaction[] };

export type AdminCursor = { time: string; id: string };
export type AdminMatch = {
  id: string; startedAt: string; endedAt: string; mode: MatchMode | 'legacy'; reason: MatchRecord['reason']; durationSeconds: number;
  participants: { slot: number; playerId: string | null; name: string; score: number; maxTile: number; result: 'win' | 'loss' | 'draw'; ratingBefore: number | null; ratingAfter: number | null; ratingDelta: number | null; telemetry: AdminTelemetry | null }[];
};
export type AdminMatchesResult = { matches: AdminMatch[]; hasMore: boolean; nextCursor: AdminCursor | null };
export type AdminAuditResult = { entries: { id: string; createdAt: string; actorId: string; playerId: string; actorExists: boolean; playerExists: boolean; action: 'suspend' | 'unsuspend'; reason: string }[]; hasMore: boolean; nextCursor: AdminCursor | null };
export type ResultStoreDiagnostics = {
  pending: { id: string; endedAt: string }[]; pendingCount: number; blockedRankedAccounts: number;
  lastRemoteSuccessAt: string | null; readErrorAt: string | null; writeErrorAt: string | null;
};
export type AdminOperations = {
  startedAt: string; collectedAt: string; sessions: number;
  rooms: { ready: number; playing: number; reconnecting: number };
  queues: { casual: { count: number; oldestWaitMs: number }; ranked: { count: number; oldestWaitMs: number }; friend: number };
  storage: ResultStoreDiagnostics | null;
};
