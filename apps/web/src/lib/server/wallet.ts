import "server-only";
import { cache } from "react";
import { getUser } from "@/lib/supabase/account";
import { createClient } from "@/lib/supabase/server";

// This is request-scoped, just like the account. Never share private balances
// between users or cache them across a purchase/reward action.
export const getWalletBalance = cache(async (): Promise<number | null> => {
  try {
    const user = await getUser();
    if (!user || user.is_anonymous) return null;
    const client = await createClient();
    const { data, error } = await client
      .from("player_wallets")
      .select("balance")
      .eq("player_id", user.id)
      .maybeSingle();
    return !error && data && Number.isSafeInteger(data.balance) && data.balance >= 0
      ? data.balance
      : null;
  } catch {
    return null;
  }
});
