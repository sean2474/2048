import { z } from "zod";

export const SIZE = 5 as const;

export const DirSchema = z.enum(["up", "down", "left", "right"]);
export type Dir = z.infer<typeof DirSchema>;

export const C2S = {
  joinRoom: z.object({ t: z.literal("joinRoom"), roomId: z.string() }),
  input: z.object({ t: z.literal("input"), dir: DirSchema }),
};
export type JoinRoom = z.infer<typeof C2S.joinRoom>;
export type InputMsg = z.infer<typeof C2S.input>;
export type ClientMsg = JoinRoom | InputMsg;

export type Effect =
  | { type: "none" }
  | { type: "addBlock"; count: number }       // 128 합치고 X블록 없으면 상대 1개
  | { type: "removeBlock"; rows: number };    // 128 합치고 X블록 있으면 지우기 

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
};

export type Board = Cell[];

export type ServerState = {
  t: "state";
  you: { board: Board; score: number; maxTile: number };
  opp?:  { board: Board; score: number; maxTile: number };
  effects?: Effect[];
};

export type Reject = { t: "reject"; reason: "stale_turn" | "room_closed" | "invalid" };
export type End = { t: "end"; winner: "you" | "opp" | "draw" };

export type S2C = ServerState | Reject | End;
