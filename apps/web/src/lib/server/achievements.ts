import "server-only";
import { cache } from "react";
import { readAchievementState } from "@/lib/achievement-operations";
import { getUser } from "@/lib/supabase/account";
import { createClient } from "@/lib/supabase/server";

export type { AchievementSnapshot } from "@/lib/achievement-operations";

// Request scoped and read only. Awarding rewards and attendance belong to the action.
export const getAchievementSnapshot = cache(() =>
  readAchievementState({
    getUser,
    rpc: async (name) => (await createClient()).rpc(name, {}, { get: true }),
  }),
);
