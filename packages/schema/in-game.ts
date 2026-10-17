import type { ResultStatus } from "./results";
import type { PlayerIconId } from "./profile-icons";
import { z } from "zod";
import { ABILITIES, DEFAULT_ABILITY_ID, SKINS, type AbilityId, type SkinId } from "./loadout";

export const SIZE = 5 as const;
export const MAX_ATTACK_STOCK = 3;
export const MAX_PENDING_ATTACKS = 6;
export const ABILITY_CHARGE = 1024;
export const SLOW_WARNING_MS = 1000;
export const SLOW_DURATION_MS = 3000;
export const SLOW_MOVE_MS = 400;
export type AbilityState = { id: AbilityId; charge: number; spawnPauseMoves: number; anchorMoves: number; slowStartsAt: number; slowEndsAt: number; nextMoveAt: number };
export const MatchModeSchema = z.enum(["casual", "ranked", "friend"]);
export type MatchMode = z.infer<typeof MatchModeSchema>;
export const AttackTypeSchema = z.enum(["xblock", "hardblock"]);
export type AttackType = z.infer<typeof AttackTypeSchema>;
export type AttackInventory = Record<AttackType, number>;

export const DirSchema = z.enum(["up", "down", "left", "right"]);
export type Dir = z.infer<typeof DirSchema>;
const SkinIdSchema = z.string().refine((value): value is SkinId => SKINS.some(skin => skin.id === value));
const AbilityIdSchema = z.string().refine((value): value is AbilityId => ABILITIES.some(ability => ability.id === value));

export const C2S = {
  findMatch: z.object({ t: z.literal("findMatch"), mode: z.enum(["casual", "ranked"]).default("casual") }),
  cancelMatch: z.object({ t: z.literal("cancelMatch") }),
  createRoomWithCode: z.object({ t: z.literal("createRoomWithCode") }),
  joinRoomWithCode: z.object({ t: z.literal("joinRoomWithCode"), joinCode: z.string().regex(/^[A-Z0-9]{6}$/) }),
  joinRoom: z.object({ t: z.literal("joinRoom"), roomId: z.string().uuid(), skinId: SkinIdSchema.default("classic"), abilityId: AbilityIdSchema.default(DEFAULT_ABILITY_ID) }),
  input: z.object({ t: z.literal("input"), dir: DirSchema }),
  attack: z.object({ t: z.literal("attack"), blockType: AttackTypeSchema }),
  ability: z.object({ t: z.literal("ability") }).strict(),
  surrender: z.object({ t: z.literal("surrender") }),
};
export const ClientMessageSchema = z.discriminatedUnion("t", [
  C2S.findMatch, C2S.cancelMatch, C2S.createRoomWithCode, C2S.joinRoomWithCode,
  C2S.joinRoom, C2S.input, C2S.attack, C2S.ability, C2S.surrender,
]);
export type ClientMsg = z.infer<typeof ClientMessageSchema>;
export type JoinRoom = z.infer<typeof C2S.joinRoom>;
export type InputMsg = z.infer<typeof C2S.input>;
export type SurrenderMsg = z.infer<typeof C2S.surrender>;

export type Effect =
  | { type: "none" }
  | { type: "addBlock"; blockType: AttackType }
  | { type: "removeBlock"; blockType: AttackType };

// 블록 타입 정의
export type BlockType = "normal" | "xblock" | "hardblock";

export type Cell = {
  id: number;
  value: number;
  row: number;
  col: number;
  blockType?: BlockType;  // undefined는 "normal"로 간주
  spawned?: boolean;
  merged?: boolean;
  ghost?: boolean;
  anchored?: boolean;
};

export type Board = Cell[];
export type PublicPlayerState = {
  skinId: SkinId;
  board: Board;
  score: number;
  maxTile: number;
  attacks: AttackInventory;
  ability: AbilityState;
};

export type ServerState = {
  t: "state";
  mode: MatchMode;
  you: PublicPlayerState;
  opp?: PublicPlayerState;
  effects?: Effect[];
  paused: boolean;
  serverTime: number;
  reconnectDeadline?: number;
  pendingAttacks: number;
  incomingAttacks: AttackInventory;
  names: { you: string; opp: string };
};

export type Reject = { t: "reject"; reason: "stale_turn" | "room_closed" | "invalid" | "not_in_room" | "room_not_found" };

export type EndReason = 
  | "reached_1024"           // 1024 타일 달성
  | "reached_2048"           // 기존 경기 기록
  | "opponent_locked"        // 상대방 못 움직임
  | "surrender"              // 항복
  | "opponent_disconnected"  // 상대방 연결 끊김 (30초 타임아웃)
  | "draw";                  // 무승부 (예외 상황)

export type End = { 
  t: "end";
  matchId: string;
  mode: MatchMode;
  recording: ResultStatus;
  winner: "you" | "opp" | "draw"; 
  reason: EndReason;
  you: PublicPlayerState;
  opp?: PublicPlayerState;
};

export type RecordingUpdate = { t: "recordStatus"; matchId: string; status: "saved" | "delayed" };
export type ActionRejected = { t: "actionRejected"; reason: "no_charge" | "incoming_full" | "paused" | "ability_not_ready" | "ability_no_target" | "ability_active" | "slowed" };
export type S2C = ServerState | Reject | End | RecordingUpdate | ActionRejected;

export type MatchProfile = { name: string; iconId: PlayerIconId; rating: number | null; rank?: import("./ranking").RankProgress };
export type MatchFound = { t: "matchFound" | "roomReady"; roomId: string; mode: MatchMode; players: { you: MatchProfile; opp: MatchProfile } };
export type LobbyMessage =
  | MatchFound
  | { t: "waitingForPlayer"; joinCode: string }
  | { t: "error"; reason: "code_not_found" | "cannot_join_own_room" | "already_in_game" | "login_required" | "ranked_unavailable" | "ranked_result_pending" | "account_suspended" | "account_check_failed" };
export type ServerMessage = S2C | LobbyMessage;
