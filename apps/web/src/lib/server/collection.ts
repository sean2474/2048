import "server-only";
import { cache } from "react";
import { CatalogSchema, type ContentCatalog } from "schema/catalog";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/account";
import { getPreferences } from "@/lib/supabase/preferences";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DEFAULT_SETTINGS } from "@/lib/preferences";
import { isCosmeticState, type CosmeticState } from "@/lib/collection";

export type CoinEntry = {
  id: number;
  delta: number;
  balance_after: number;
  reason: string;
  created_at: string;
};

// Request-scoped cache only: private wallet/unlock data must never enter a shared cache.
export const getCatalogSnapshot = cache(
  async (): Promise<{ data: ContentCatalog | null; error: boolean }> => {
    try {
      if (!isSupabaseConfigured()) return { data: null, error: true };
      const client = await createClient();
      const response = await client.rpc("content_catalog", {}, { get: true });
      const parsed = CatalogSchema.safeParse(response.data);
      if (response.error || !parsed.success) return { data: null, error: true };
      return {
        data: {
          skins: parsed.data.skins.filter((item) => item.status !== "draft"),
          profileIcons: parsed.data.profileIcons.filter((item) => item.status !== "draft"),
          achievements: parsed.data.achievements.filter((item) => item.status !== "draft"),
        },
        error: false,
      };
    } catch {
      return { data: null, error: true };
    }
  },
);

export const getCollection = cache(async (mode: "shop" | "loadout" = "loadout") => {
  // Start public data and preferences together, but only identity gates private reads.
  const catalogRequest = getCatalogSnapshot();
  const preferencesRequest = getPreferences();
  const user = await getUser();
  const userId = user && !user.is_anonymous ? user.id : undefined;
  let cosmetics: CosmeticState | null = null,
    cosmeticsError = false,
    unlocksError = false,
    historyError = false;
  let unlockedIds: string[] = [],
    history: CoinEntry[] = [];
  if (userId) {
    try {
      const client = await createClient();
      const [wallet, unlocks, transactions] = await Promise.all([
        client.rpc("cosmetic_state", {}, { get: true }),
        client.from("achievement_unlocks").select("achievement_id").eq("player_id", userId),
        mode === "shop"
          ? client
              .from("coin_transactions")
              .select("id,delta,balance_after,reason,created_at")
              .eq("player_id", userId)
              .order("created_at", { ascending: false })
              .order("id", { ascending: false })
              .limit(8)
          : Promise.resolve({ data: [], error: null }),
      ]);
      cosmeticsError = Boolean(wallet.error) || !isCosmeticState(wallet.data);
      if (!cosmeticsError) cosmetics = wallet.data as CosmeticState;
      unlocksError = Boolean(unlocks.error) || !Array.isArray(unlocks.data);
      if (!unlocksError)
        unlockedIds = unlocks.data!.flatMap((item) =>
          typeof item.achievement_id === "string" ? [item.achievement_id] : [],
        );
      historyError = Boolean(transactions.error) || !Array.isArray(transactions.data);
      if (!historyError)
        history = transactions.data!.filter(
          (row): row is CoinEntry =>
            Number.isSafeInteger(row.id) &&
            Number.isSafeInteger(row.delta) &&
            Number.isSafeInteger(row.balance_after) &&
            typeof row.reason === "string" &&
            typeof row.created_at === "string" &&
            Number.isFinite(Date.parse(row.created_at)),
        );
    } catch {
      cosmeticsError = true;
      unlocksError = true;
      historyError = true;
    }
  }
  const [catalog, preferences] = await Promise.all([catalogRequest, preferencesRequest]);
  return {
    catalog: catalog.data,
    catalogError: catalog.error,
    userId,
    cosmetics,
    cosmeticsError,
    unlockedIds,
    unlocksError,
    history,
    historyError,
    settings: preferences?.settings ?? DEFAULT_SETTINGS,
    settingsError: Boolean(userId && !preferences),
  };
});
