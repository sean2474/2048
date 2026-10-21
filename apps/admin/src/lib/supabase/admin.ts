import "server-only";
import { cache } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "./server";
import { isSupabaseConfigured } from "./config";

// "enroll": no verified authenticator yet. "verify": a factor exists but this session is still aal1.
type MfaStep = "enroll" | "verify";
type AdminAccess = {
  client: SupabaseClient | null;
  user: User | null;
  allowed: boolean;
  error: unknown;
  mfa: MfaStep | null;
};

export const getAdminAccess = cache(async (): Promise<AdminAccess> => {
  if (!isSupabaseConfigured())
    return { client: null, user: null, allowed: false, error: null, mfa: null };
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user || user.is_anonymous) return { client, user, allowed: false, error: null, mfa: null };
  // The assurance level is read from the session token; the database repeats this check in is_game_admin().
  const { data: assurance } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance?.currentLevel !== "aal2")
    return {
      client,
      user,
      allowed: false,
      error: null,
      mfa: assurance?.nextLevel === "aal2" ? "verify" : "enroll",
    };
  const { data, error } = await client.rpc("is_game_admin");
  return { client, user, allowed: !error && data === true, error, mfa: null };
});

export async function getAdminClient() {
  const access = await getAdminAccess();
  return access.allowed ? access.client : null;
}
