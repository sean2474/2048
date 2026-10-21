import type { Account, MatchTelemetry } from "schema/results";
import type { MatchWriter } from "./result-store";
import type { Effect, MatchMode, PublicPlayerState } from "schema/in-game";
export type PlayerId = string;
export type RoomId = string;
export type JoinCode = string;
export type PlayerState = Omit<PublicPlayerState, "skinId" | "attacksSent" | "iconId"> & {
  skinId?: PublicPlayerState["skinId"];
  pending: Effect[];
  telemetry: MatchTelemetry;
  moveTimes?: number[];
};
export type QueueEntry = {
  pid: PlayerId;
  mode: "casual" | "ranked";
  rating: number;
  joinedAt: number;
};
export type Room = {
  id: RoomId;
  mode: MatchMode;
  players: PlayerId[];
  ready: Set<PlayerId>;
  state: Record<PlayerId, PlayerState>;
  rng: () => number;
  open: boolean;
  pausedAt?: number;
  startedAt: string;
  accounts: Record<PlayerId, Account | null>;
  persistResult?: MatchWriter;
};
export const RECONNECT_TIMEOUT = 30_000;
export const playerChannel = (pid: PlayerId) => `player:${pid}`;
export const spectatorChannel = (roomId: RoomId, pid: PlayerId) => `spectate:${roomId}:${pid}`;
