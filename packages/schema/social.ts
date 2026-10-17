import { z } from "zod";
import type { End, ServerState } from "./in-game";
import type { ProfileIconId } from "./profile-icons";

export type SocialPlayer = { id: string; name: string; icon_id: ProfileIconId; relationship: "friend" | "incoming" | "outgoing" | null; unread: number };
export type DirectMessage = { id: number; sender_id: string; body: string; created_at: string };
export type FriendActivity = "offline" | "online" | "playing" | "solo";
export type FriendPresence = { friends: Record<string, FriendActivity> } | { error: "presence_unavailable" };
export const FriendChallengeCommandSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("send"), playerId: z.string().uuid() }).strict(),
  z.object({ t: z.enum(["accept", "decline", "cancel"]), id: z.string().uuid() }).strict(),
]);
export type FriendChallengeCommand = z.infer<typeof FriendChallengeCommandSchema>;
export type FriendChallenge = { id: string; from: { id: string; name: string }; to: { id: string; name: string }; expiresAt: number };
export type ChallengeReply = { error?: "invalid" | "unavailable" | "not_friends" | "busy" | "offline" | "rate_limited" | "expired" };
export type ChallengeEvent = { t: "pending"; invitation: FriendChallenge }
  | { t: "closed"; id: string; reason: "declined" | "cancelled" | "expired" | "unavailable" | "accepted" }
  | { t: "start"; id: string; roomId: string };
export const SpectateRequestSchema = z.object({ playerId: z.string().uuid() }).strict();
export type SpectateUpdate = { state: ServerState | End } | { error: "login_required" | "spectate_unavailable" | "not_spectatable" | "invalid" | "rate_limited" };
