"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useCatalog } from "./catalog-provider";
import { createClient } from "@/lib/supabase/client";

type CosmeticKind = "skin" | "icon";
type CosmeticState = { balance: number; purchases: { kind: CosmeticKind; item_id: string }[] };

function isCosmeticState(value: unknown): value is CosmeticState {
  if (!value || typeof value !== "object" || !("balance" in value) || !("purchases" in value)) return false;
  return typeof value.balance === "number" && Number.isSafeInteger(value.balance) && value.balance >= 0 && Array.isArray(value.purchases)
    && value.purchases.every(item => item && (item.kind === "skin" || item.kind === "icon") && typeof item.item_id === "string" && item.item_id.length > 0);
}

export function useCosmetics(user: User | null | undefined) {
  const catalog = useCatalog();
  const userId = user && !user.is_anonymous ? user.id : undefined;
  const [result, setResult] = useState<{ userId: string; data: CosmeticState } | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [buying, setBuying] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const version = useRef(0);
  const pending = useRef(false);
  const data = result?.userId === userId ? result?.data : undefined;

  const reload = useCallback(async () => {
    if (!userId || pending.current) return;
    const request = ++version.current;
    setLoading(true); setError(false);
    try {
      const response = await createClient().rpc("cosmetic_state", {}, { get: true });
      if (response.error || !isCosmeticState(response.data)) throw new Error("Cosmetics unavailable");
      if (request === version.current) setResult({ userId, data: response.data });
    } catch {
      if (request === version.current) { setResult(null); setError(true); }
    } finally { if (request === version.current) setLoading(false); }
  }, [userId]);

  useEffect(() => {
    const generation = version;
    setResult(null); setError(false); setPurchaseError(null); setBuying(false); setLoading(false); pending.current = false;
    void reload();
    const refresh = () => { if (document.visibilityState === "visible") void reload(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { generation.current++; window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [reload]);

  const owns = (kind: CosmeticKind, id: string) => Boolean(userId && ((kind === "skin" ? catalog.skins : catalog.profileIcons).some(item => item.id === id && item.acquisition === "free" && item.publishedOnce)
    || data?.purchases.some(item => item.kind === kind && item.item_id === id)));

  async function purchase(kind: CosmeticKind, id: string, expectedPrice: number) {
    if (!userId || !data || pending.current || owns(kind, id) || catalog.error || catalog.loading || !Number.isSafeInteger(expectedPrice) || expectedPrice <= 0 || !(kind === "skin" ? catalog.skins : catalog.profileIcons).some(item => item.id === id && item.status === "published" && item.acquisition === "coins")) return;
    pending.current = true;
    const request = ++version.current;
    setBuying(true); setPurchaseError(null);
    try {
      const response = await createClient().rpc("purchase_cosmetic", { p_kind: kind, p_item_id: id, p_expected_price: expectedPrice });
      if (response.error) throw response.error;
      if (!isCosmeticState(response.data) || !("purchased" in response.data) || typeof response.data.purchased !== "boolean") throw new Error("Invalid purchase response");
      if (request === version.current) {
        setResult({ userId, data: response.data });
        return response.data.purchased;
      }
    } catch (cause) {
      if (request === version.current) {
        const message = cause && typeof cause === "object" && "message" in cause ? cause.message : "";
        if (message === "Price changed. Review the updated price before buying.") {
          setPurchaseError(message);
          void catalog.reload();
        } else setPurchaseError(message === "Not enough coins" ? "Not enough coins." : "Could not complete your purchase. Please try again.");
      }
    } finally {
      if (request === version.current) { pending.current = false; setBuying(false); setLoading(false); }
    }
  }

  return { data, loading: user === undefined || Boolean(userId && !data && !error) || loading, error, buying, purchaseError, reload, purchase, owns, clearPurchaseError: () => setPurchaseError(null) };
}
