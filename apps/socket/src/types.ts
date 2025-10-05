import type { Board } from "schema/in-game";

export type PlayerId = string; // 소켓 ID
export type UserId = string;   // Supabase user ID
export type RoomId = string;
export type JoinCode = string;

export type PlayerState = {
  board: Board;
  score: number;
  maxTile: number;
  userId: UserId; // 추가!
};

export type Room = {
  id: RoomId;
  players: PlayerId[];
  userIds: UserId[]; // 추가!
  state: Record<PlayerId, PlayerState>;
  turnId: number;
  rng: () => number;
  open: boolean;
};

export const RECONNECT_TIMEOUT = 30000;