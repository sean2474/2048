import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { io } from "socket.io-client";

export const CURRENT_ROOM_KEY = "duo.currentRoom";
export { matchModeLabel } from "./match-labels";
// A private per-tab capability, independent of a public profile/user ID.
// sessionStorage survives reloads but allows separate tabs to play each other.
export function createGameSocket(spectator = false, soloToken?: string) {
  let sessionToken = sessionStorage.getItem("duo.sessionToken");
  if (!sessionToken || !/^[a-f0-9]{64}$/.test(sessionToken)) {
    sessionToken = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    sessionStorage.setItem("duo.sessionToken", sessionToken);
  }
  return io(process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000", {
    auth: async (done) => {
      try {
        if (!isSupabaseConfigured()) {
          done({ sessionToken, soloToken, spectator });
          return;
        }
        const {
          data: { session },
          error,
        } = await createClient().auth.getSession();
        if (error) throw error;
        done({
          sessionToken,
          soloToken,
          spectator,
          ...(session ? { accessToken: session.access_token } : {}),
        });
      } catch {
        done({ sessionToken, authError: true });
      }
    },
    autoConnect: false,
    timeout: 8000,
    reconnectionAttempts: 5,
  });
}
export function reasonMessage(reason: string) {
  switch (reason) {
    case "server_updating":
      return "An update is waiting for current games to finish. Please try again shortly.";
    case "code_not_found":
      return "That room is no longer available. Check the code with your friend.";
    case "cannot_join_own_room":
      return "Open another browser tab to join your room.";
    case "already_in_game":
      return "Finish your current game before starting another.";
    case "login_required":
      return "Sign in to play ranked matches.";
    case "ranked_unavailable":
      return "Ranked matches are temporarily unavailable. Try a casual match instead.";
    case "ranked_result_pending":
      return "Your previous ranked result is still being saved. Please try again shortly.";
    case "account_suspended":
      return "This account is suspended from starting new matches. Contact the game administrator.";
    case "account_check_failed":
      return "Your account status could not be checked. Please try again shortly.";
    case "ability_not_ready":
      return "Merge tiles to finish charging your ability.";
    case "ability_no_target":
      return "No valid target. Your ability charge was kept.";
    case "ability_active":
      return "This effect is already active. Your ability charge was kept.";
    case "slowed":
      return "Slowed. Wait briefly before your next move.";
    case "paused":
      return "Attacks are paused until both players reconnect.";
    case "not_in_room":
      return "This room belongs to another session. Join with your friend's room code.";
    case "room_not_found":
    case "room_closed":
      return "This game has ended or the server has restarted. Start a new game.";
    default:
      return "The request could not be completed. Please try again.";
  }
}
