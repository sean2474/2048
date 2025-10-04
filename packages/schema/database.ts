import { z } from "zod";

// ============================================
// Players
// ============================================
export const PlayerSchema = z.object({
  id: z.string().uuid(),
  username: z.string().min(2).max(16).nullable(),
  name: z.string(),
  image_path: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type Player = z.infer<typeof PlayerSchema>;

export const PlayerInsertSchema = PlayerSchema.omit({ 
  created_at: true, 
  updated_at: true 
}).partial({
  id: true,
  username: true,
  name: true,
  image_path: true,
});

export type PlayerInsert = z.infer<typeof PlayerInsertSchema>;

// ============================================
// Player Ratings
// ============================================
export const PlayerRatingSchema = z.object({
  player_id: z.string().uuid(),
  mmr: z.number().int().default(1200),
  wins: z.number().int().nonnegative().default(0),
  losses: z.number().int().nonnegative().default(0),
  draws: z.number().int().nonnegative().default(0),
  highest_tile: z.number().int().nonnegative().default(0),
  highest_score: z.number().int().nonnegative().default(0),
  updated_at: z.string().datetime(),
});

export type PlayerRating = z.infer<typeof PlayerRatingSchema>;

export const PlayerRatingInsertSchema = PlayerRatingSchema.omit({
  updated_at: true,
}).partial({
  mmr: true,
  wins: true,
  losses: true,
  draws: true,
  highest_tile: true,
  highest_score: true,
});

export type PlayerRatingInsert = z.infer<typeof PlayerRatingInsertSchema>;

// ============================================
// Matches
// ============================================
export const MatchModeSchema = z.enum(["1v1", "2v2"]);
export type MatchMode = z.infer<typeof MatchModeSchema>;

export const EndedReasonSchema = z.enum([
  "reach2048",
  "oppStuck",
  "timeout",
  "surrender",
  "disconnect"
]);
export type EndedReason = z.infer<typeof EndedReasonSchema>;

export const MatchSchema = z.object({
  id: z.string().uuid(),
  mode: MatchModeSchema,
  room_code: z.string().nullable(),
  seed: z.instanceof(Buffer), // bytea
  started_at: z.string().datetime(),
  ended_at: z.string().datetime().nullable(),
  winner_team: z.number().int().min(1).max(2).nullable(),
  ended_reason: EndedReasonSchema.nullable(),
  created_by: z.string().uuid().nullable(),
});

export type Match = z.infer<typeof MatchSchema>;

export const MatchInsertSchema = MatchSchema.omit({
  started_at: true,
}).partial({
  id: true,
  room_code: true,
  ended_at: true,
  winner_team: true,
  ended_reason: true,
  created_by: true,
});

export type MatchInsert = z.infer<typeof MatchInsertSchema>;

// ============================================
// Match Participants
// ============================================
export const ParticipantResultSchema = z.enum(["win", "lose", "draw"]);
export type ParticipantResult = z.infer<typeof ParticipantResultSchema>;

export const MatchParticipantSchema = z.object({
  match_id: z.string().uuid(),
  player_id: z.string().uuid(),
  team: z.number().int().min(1).max(2),
  score: z.number().int().nonnegative().default(0),
  max_tile: z.number().int().nonnegative().default(0),
  x_blocks_generated: z.number().int().nonnegative().default(0),
  x_blocks_removed: z.number().int().nonnegative().default(0),
  hard_blocks_generated: z.number().int().nonnegative().default(0),
  result: ParticipantResultSchema,
  duration_ms: z.number().int().nonnegative().default(0),
  inputs_count: z.number().int().nonnegative().default(0),
  avg_input_rps: z.number().nullable(),
  created_at: z.string().datetime(),
});

export type MatchParticipant = z.infer<typeof MatchParticipantSchema>;

export const MatchParticipantInsertSchema = MatchParticipantSchema.omit({
  created_at: true,
}).partial({
  score: true,
  max_tile: true,
  x_blocks_generated: true,
  x_blocks_removed: true,
  hard_blocks_generated: true,
  duration_ms: true,
  inputs_count: true,
  avg_input_rps: true,
});

export type MatchParticipantInsert = z.infer<typeof MatchParticipantInsertSchema>;

// ============================================
// Replays
// ============================================
export const ReplaySchema = z.object({
  match_id: z.string().uuid(),
  storage_path: z.string(),
  sha256: z.string(),
});

export type Replay = z.infer<typeof ReplaySchema>;

export const ReplayInsertSchema = ReplaySchema;
export type ReplayInsert = z.infer<typeof ReplayInsertSchema>;

// ============================================
// Room Sessions
// ============================================
export const RoomActionSchema = z.enum(["create", "join", "leave"]);
export type RoomAction = z.infer<typeof RoomActionSchema>;

export const RoomSessionSchema = z.object({
  id: z.string().uuid(),
  room_code: z.string(),
  player_id: z.string().uuid().nullable(),
  action: RoomActionSchema,
  ip: z.string().nullable(), // inet type
  user_agent: z.string().nullable(),
  created_at: z.string().datetime(),
});

export type RoomSession = z.infer<typeof RoomSessionSchema>;

export const RoomSessionInsertSchema = RoomSessionSchema.omit({
  created_at: true,
}).partial({
  id: true,
  player_id: true,
  ip: true,
  user_agent: true,
});

export type RoomSessionInsert = z.infer<typeof RoomSessionInsertSchema>;

// ============================================
// Utility Types
// ============================================

// Full player info with rating
export const PlayerWithRatingSchema = PlayerSchema.merge(
  z.object({
    rating: PlayerRatingSchema.nullable(),
  })
);

export type PlayerWithRating = z.infer<typeof PlayerWithRatingSchema>;

// Match with participants
export const MatchWithParticipantsSchema = MatchSchema.merge(
  z.object({
    participants: z.array(MatchParticipantSchema),
  })
);

export type MatchWithParticipants = z.infer<typeof MatchWithParticipantsSchema>;

// Leaderboard entry
export const LeaderboardEntrySchema = z.object({
  rank: z.number().int().positive(),
  player: PlayerSchema,
  rating: PlayerRatingSchema,
});

export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;