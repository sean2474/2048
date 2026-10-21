"use server";

import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/supabase/account";
import { createClient } from "@/lib/supabase/server";
import { getCatalogSnapshot } from "@/lib/server/collection";
import { isCosmeticState, purchaseInput } from "@/lib/collection";

export async function purchaseCosmetic(
  input: unknown,
  expectedUserId: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = purchaseInput(input);
  if (!parsed) return { ok: false, error: "Could not complete your purchase. Please try again." };
  try {
    const user = await getUser();
    if (!user || user.is_anonymous) return { ok: false, error: "Log in to unlock this item." };
    if (typeof expectedUserId !== "string" || expectedUserId !== user.id)
      return { ok: false, error: "Could not complete your purchase. Please try again." };
    const catalog = await getCatalogSnapshot();
    const item = (parsed.kind === "skin" ? catalog.data?.skins : catalog.data?.profileIcons)?.find(
      (item) =>
        item.id === parsed.id && item.status === "published" && item.acquisition === "coins",
    );
    if (!item) return { ok: false, error: "Currently unavailable" };
    if (item.price !== parsed.expectedPrice)
      return { ok: false, error: "Price changed. Review the updated price before buying." };
    const client = await createClient();
    // The RPC rechecks catalog price/ownership under its wallet lock, covering concurrent requests.
    const response = await client.rpc("purchase_cosmetic", {
      p_kind: parsed.kind,
      p_item_id: parsed.id,
      p_expected_price: parsed.expectedPrice,
    });
    if (response.error) {
      const message = response.error.message;
      return {
        ok: false,
        error:
          message === "Not enough coins"
            ? "Not enough coins."
            : message === "Price changed. Review the updated price before buying."
              ? message
              : "Could not complete your purchase. Please try again.",
      };
    }
    if (
      !isCosmeticState(response.data) ||
      !("purchased" in response.data) ||
      typeof response.data.purchased !== "boolean"
    )
      return { ok: false, error: "Could not complete your purchase. Please try again." };
    revalidatePath("/shop");
    revalidatePath("/loadout");
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not complete your purchase. Please try again." };
  }
}
