import "server-only";
import { cache } from "react";
import { createClient } from "./server";
import { isSupabaseConfigured } from "./config";

export const getAdminAccess = cache(async () => {
  if (!isSupabaseConfigured()) return { client: null, user: null, allowed: false, error: null };
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user || user.is_anonymous) return { client, user, allowed: false, error: null };
  const { data, error } = await client.rpc("is_game_admin");
  return { client, user, allowed: !error && data === true, error };
});

export async function getAdminClient() {
  const access = await getAdminAccess();
  return access.allowed ? access.client : null;
}
