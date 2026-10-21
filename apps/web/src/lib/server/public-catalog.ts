import "server-only";
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { CatalogSchema, type ContentCatalog } from "schema/catalog";
import { supabasePublicKey } from "@/lib/supabase/config";

// Only the root provider's public display seed is shared between requests.
// Server-rendered catalog pages and purchase actions still read current data.
export const getPublicCatalogSeed = cache(
  async (): Promise<{ data: ContentCatalog | null; error: boolean }> => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = supabasePublicKey();
    if (!url || !key) return { data: null, error: true };

    const read = unstable_cache(
      async () => {
        // Never use the cookie-bound server client in this shared cache.
        const client = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
          global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
        });
        const response = await client.rpc("content_catalog", {}, { get: true });
        const parsed = CatalogSchema.safeParse(response.data);
        if (response.error || !parsed.success) throw new Error("Public catalog unavailable");
        return {
          skins: parsed.data.skins.filter((item) => item.status !== "draft"),
          profileIcons: parsed.data.profileIcons.filter((item) => item.status !== "draft"),
          achievements: parsed.data.achievements.filter((item) => item.status !== "draft"),
        };
      },
      ["public-catalog-seed-v1", url],
      // Stale-while-revalidate: a failed refresh retains the last valid public seed.
      { revalidate: 30, tags: ["public-catalog-seed"] },
    );
    try {
      return { data: await read(), error: false };
    } catch {
      // Failed cold reads are not cached and can recover on the next request.
      return { data: null, error: true };
    }
  },
);
