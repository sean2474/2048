import { createClient } from "@supabase/supabase-js";
import type { Account, MatchRecord } from "schema/results";
import { INITIAL_RATING } from "schema/ranking";
import { DEFAULT_PROFILE_ICON, isProfileIconId } from "schema/profile-icons";
import type { MatchWriter } from "./result-store";
import type { DeleteAccount } from "./account-deletion";
import type { FeedbackWriter } from "./feedback";
export type AccountResolver = (accessToken: string) => Promise<Account>;
export type SuspensionReader = (userIds: string[]) => Promise<string[]>;
export function createSupabaseServices(env: NodeJS.ProcessEnv = process.env): { resolveAccount?: AccountResolver; writeMatch?: MatchWriter; writeFeedback?: FeedbackWriter; readRating?: (userId: string) => Promise<number>; readSuspensions?: SuspensionReader; deleteAccount?: DeleteAccount } {
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = env.SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publicKey) return {};
  const options = { auth: { persistSession: false, autoRefreshToken: false }, global: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, signal: AbortSignal.timeout(8_000) }),
  } };
  const authClient = createClient(url, publicKey, options);
  const resolveAccount: AccountResolver = async accessToken => {
    const { data, error } = await authClient.auth.getUser(accessToken);
    if (error || !data.user || data.user.is_anonymous) throw new Error("invalid_account");
    const profileClient = createClient(url, publicKey, { ...options, global: { ...options.global, headers: { Authorization: `Bearer ${accessToken}` } } });
    const { data: profile, error: profileError } = await profileClient.from("players").select("name").eq("id", data.user.id).single();
    if (profileError || !profile) throw new Error("invalid_account");
    const [preferences, ranking] = await Promise.all([
      profileClient.from("player_preferences").select("icon_id").eq("player_id", data.user.id).maybeSingle(),
      profileClient.from("player_ratings").select("rating").eq("player_id", data.user.id).maybeSingle(),
    ]);
    return { id: data.user.id, name: profile.name,
      iconId: !preferences.error && isProfileIconId(preferences.data?.icon_id) ? preferences.data.icon_id : DEFAULT_PROFILE_ICON,
      rating: ranking.error ? null : !ranking.data ? INITIAL_RATING : Number.isSafeInteger(ranking.data.rating) ? ranking.data.rating : null,
    };
  };
  if (!secret) return { resolveAccount };
  const admin = createClient(url, secret, options);
  const writeFeedback: FeedbackWriter = async (input, reporterId) => {
    const { error } = await admin.from("feedback").upsert({ ...input, reporter_id: reporterId }, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw new Error(`Feedback storage failed (${error.code || "network"})`);
  };
  const writeMatch = async (record: MatchRecord) => {
    const { error } = await admin.rpc("record_match", {
      p_id: record.id, p_started_at: record.startedAt, p_ended_at: record.endedAt,
      p_reason: record.reason, p_winner_slot: record.winnerSlot, p_participants: record.participants,
      p_mode: record.mode ?? "casual",
    });
    if (error) throw new Error(`Match storage failed (${error.code || "network"})`);
  };
  const readRating = async (userId: string) => {
    const { data, error } = await admin.from("player_ratings").select("rating").eq("player_id", userId).maybeSingle();
    if (error) throw new Error(`Rating lookup failed (${error.code || "network"})`);
    return data?.rating ?? INITIAL_RATING;
  };
  const readSuspensions: SuspensionReader = async userIds => {
    if (!userIds.length) return [];
    const { data, error } = await admin.from("players").select("id,suspended_at").in("id", userIds);
    if (error) throw new Error(`Suspension lookup failed (${error.code || "network"})`);
    return userIds.filter(id => !data.some(player => player.id === id && player.suspended_at === null));
  };
  const deleteAccount: DeleteAccount = async (userId, confirmationEmail, accessToken) => {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data.user || data.user.is_anonymous) throw new Error("invalid_account");
    if (!data.user.email || confirmationEmail.trim().toLowerCase() !== data.user.email.toLowerCase()) throw new Error("confirmation_mismatch");
    const { data: role, error: roleError } = await admin.from("admin_roles").select("user_id").eq("user_id", userId).maybeSingle();
    if (roleError) throw new Error("deletion_failed");
    if (role) throw new Error("admin_account");
    const { error: signOutError } = await admin.auth.admin.signOut(accessToken, "global");
    if (signOutError) throw new Error("deletion_failed");
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) throw new Error("deletion_failed");
  };
  return { resolveAccount, writeMatch, writeFeedback, readRating, readSuspensions, deleteAccount };
}
