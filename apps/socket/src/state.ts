import type { PlayerId, UserId, RoomId, JoinCode, Room } from "./types";

// 게임 방 관리
export const rooms = new Map<RoomId, Room>();
export const playerRoom = new Map<PlayerId, RoomId>();

// userId 매핑 (재연결용)
export const userIdToPlayerId = new Map<UserId, PlayerId>();
export const playerIdToUserId = new Map<PlayerId, UserId>();

// 매칭 큐
export const matchmakingQueue: PlayerId[] = [];

// Join code 관련
export const waitingByCode = new Map<JoinCode, PlayerId>();
export const codeToRoom = new Map<JoinCode, RoomId>();

// 재연결 타이머
export const disconnectTimers = new Map<PlayerId, NodeJS.Timeout>();