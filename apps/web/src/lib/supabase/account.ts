import "server-only";
import { cache } from "react";
import type { Player } from "@/types";
import { createClient } from "./server";
import { isSupabaseConfigured } from "./config";

// React cache is request-scoped: private account data never crosses requests.
export const getUser = cache(async () => {
  if (!isSupabaseConfigured()) return null;
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  return user;
});

export const getAccount = cache(async () => {
  const user = await getUser();
  if (!user || user.is_anonymous) return { user, player: null };
  const client = await createClient();
  const { data } = await client.from("players").select("*").eq("id", user.id).maybeSingle();
  return { user, player: data as Player | null };
});
