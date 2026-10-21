"use server";

import { syncAchievementState } from "@/lib/achievement-operations";
import { getUser } from "@/lib/supabase/account";
import { createClient } from "@/lib/supabase/server";

export async function syncAchievementsAction() {
  // Identity, attendance day and unlocks come from the authenticated session/DB.
  // There is deliberately no client-controlled player ID, date or reward input.
  return syncAchievementState({ getUser, rpc: async (name) => (await createClient()).rpc(name) });
}
