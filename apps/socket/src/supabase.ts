import { SoloCheckpointSchema } from "schema/solo";
import type { SoloWriter, SoloProgressStore } from "./solo";
import type { SpectateAccess } from "./spectate";
import type { FriendsReader } from "./friend-presence";
import type { SocialPlayer } from "schema/social";
import { createClient } from "@supabase/supabase-js";
import type { Account, MatchRecord } from "schema/results";
import { INITIAL_RATING, type RankProgress, type RankSnapshot } from "schema/ranking";
import { DEFAULT_PROFILE_ICON } from "schema/profile-icons";
import { CatalogIdSchema } from "schema/catalog";
import type { MatchWriter } from "./result-store";
import type { DeleteAccount } from "./account-deletion";
import type { FeedbackWriter } from "./feedback";
export type AccountResolver = (accessToken: string) => Promise<Account>;
export type SuspensionReader = (userIds: string[]) => Promise<string[]>;
export function createSupabaseServices(env: NodeJS.ProcessEnv = process.env): { readFriends?: FriendsReader; canSpectate?: SpectateAccess; checkAdmin?: (token: string) => Promise<boolean>; resolveAccount?: AccountResolver; writeMatch?: MatchWriter; writeFeedback?: FeedbackWriter; writeSolo?: SoloWriter; soloProgress?: SoloProgressStore; readRating?: (userId: string) => Promise<number | RankSnapshot>; readSuspensions?: SuspensionReader; deleteAccount?: DeleteAccount } {
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = env.SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publicKey) return {};
  const options = { auth: { persistSession: false, autoRefreshToken: false }, global: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, signal: AbortSignal.timeout(8_000) }),
  } };
  const authClient = createClient(url, publicKey, options);
  const readFriends: FriendsReader = async accessToken => {
    const client = createClient(url, publicKey, { ...options, global: { ...options.global, headers: { Authorization: `Bearer ${accessToken}` } } });
    const { data, error } = await client.rpc("social_players");
    if (error) throw Error("presence_unavailable");
    return (data as SocialPlayer[]).filter(person => person.relationship === "friend").map(person => person.id);
  };
  const resolveAccount: AccountResolver = async accessToken => {
    const { data, error } = await authClient.auth.getUser(accessToken);
    if (error || !data.user || data.user.is_anonymous) throw new Error("invalid_account");
    const profileClient = createClient(url, publicKey, { ...options, global: { ...options.global, headers: { Authorization: `Bearer ${accessToken}` } } });
    // One round trip for all three reads; the socket runs far from the database and this runs on every connect.
    const [{ data: profile, error: profileError }, preferences, ranking] = await Promise.all([
      profileClient.from("players").select("name").eq("id", data.user.id).single(),
      profileClient.from("player_preferences").select("icon_id,skin_id").eq("player_id", data.user.id).maybeSingle(),
      profileClient.from("player_ratings").select("rating,tier,placement_games").eq("player_id", data.user.id).maybeSingle(),
    ]);
    if (profileError || !profile) throw new Error("invalid_account");
    // Database equipment triggers authorize catalog ownership; only validate ID syntax here.
    const icon = CatalogIdSchema.safeParse(!preferences.error ? preferences.data?.icon_id : undefined);
    const skin = CatalogIdSchema.safeParse(!preferences.error ? preferences.data?.skin_id : undefined);
    return { id: data.user.id, name: profile.name,
      iconId: icon.success ? icon.data : DEFAULT_PROFILE_ICON,
      skinId: skin.success ? skin.data : "classic",
      rating: ranking.error ? null : !ranking.data ? INITIAL_RATING : Number.isSafeInteger(ranking.data.rating) ? ranking.data.rating : null,
      ...(!ranking.error ? { rank: rankProgress(ranking.data) } : {}),
    };
  };
  const checkAdmin = async (accessToken: string) => {
    const { data, error } = await authClient.auth.getUser(accessToken);
    if (error || !data.user || data.user.is_anonymous) return false;
    const client = createClient(url, publicKey, { ...options, global: { ...options.global, headers: { Authorization: `Bearer ${accessToken}` } } });
    const role = await client.rpc("is_game_admin");
    if (role.error) throw new Error("admin_verification_failed");
    return role.data === true;
  };
  if (!secret) return { resolveAccount, readFriends, checkAdmin };
  const admin = createClient(url, secret, options);
  const canSpectate: SpectateAccess = async (viewerId, targetId, ranked) => {
    const { data, error } = await admin.rpc("can_spectate", { p_viewer: viewerId, p_target: targetId, p_ranked: ranked });
    if (error) throw new Error("spectate_unavailable");
    return data === true;
  };
  const soloProgress: SoloProgressStore = {
    async read(key) {
      const { data, error } = await admin.from("solo_progress").select("checkpoint").eq("owner_key", key).maybeSingle();
      if (error) throw new Error(`Solo progress lookup failed (${error.code || "network"})`);
      return data ? SoloCheckpointSchema.parse(data.checkpoint) : null;
    },
    async write(key, playerId, checkpoint) {
      const { error } = await admin.from("solo_progress").upsert({ owner_key: key, player_id: playerId,
        checkpoint: SoloCheckpointSchema.parse(checkpoint), updated_at: new Date().toISOString() }, { onConflict: "owner_key" });
      if (error) throw new Error(`Solo progress storage failed (${error.code || "network"})`);
    },
  };
  const writeSolo: SoloWriter = async record => {
    const { error } = record.mode === "endless"
      ? await admin.rpc("record_solo_endless", { p_run: record.id, p_player: record.playerId, p_tile: record.maxTile })
      : await admin.rpc("record_solo", { p_run: record.id, p_player: record.playerId, p_elapsed: record.elapsedMs, p_moves: record.moves, p_score: record.score });
    if (error) throw new Error(`Solo storage failed (${error.code || "network"})`);
  };
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
    const { data, error } = await admin.from("player_ratings").select("rating,tier,placement_games").eq("player_id", userId).maybeSingle();
    if (error) throw new Error(`Rating lookup failed (${error.code || "network"})`);
    return { rating: data?.rating ?? INITIAL_RATING, rank: rankProgress(data) };
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
  return { resolveAccount, readFriends, canSpectate, checkAdmin, writeMatch, writeFeedback, writeSolo, soloProgress, readRating, readSuspensions, deleteAccount };
}

function rankProgress(row: Partial<RankProgress> | null): RankProgress {
  return { tier: row?.tier ?? null, placement_games: row?.placement_games ?? 0 };
}
