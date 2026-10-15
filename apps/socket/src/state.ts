import type { Account } from "schema/results";
import type { PlayerId, RoomId, JoinCode, Room, QueueEntry } from "./types";
export const rooms = new Map<RoomId, Room>();
export const playerRoom = new Map<PlayerId, RoomId>();
export const playerSockets = new Map<PlayerId, string>();
export const matchmakingQueue: QueueEntry[] = [];
export const waitingByCode = new Map<JoinCode, PlayerId>();
export const disconnectTimers = new Map<PlayerId, ReturnType<typeof setTimeout>>();
export const disconnectDeadlines = new Map<PlayerId, number>();

export const playerAccounts = new Map<PlayerId, Account | null>();
