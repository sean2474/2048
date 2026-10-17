import "server-only";
import { cache } from "react";
import { settingsFromRow, type Settings } from "@/lib/preferences";
import { getUser } from "./account";
import { createClient } from "./server";

export type PreferencesSnapshot = { userId: string; settings: Settings | null };

export const getPreferences = cache(async (): Promise<PreferencesSnapshot | null> => {
  try {
    const user = await getUser();
    if (!user || user.is_anonymous) return null;
    const client = await createClient();
    const { data, error } = await client.from("player_preferences").select("locale,keybindings,skin_id,icon_id,ability_id,custom_shortcuts").eq("player_id", user.id).maybeSingle();
    if (error) return null;
    return { userId: user.id, settings: data ? settingsFromRow(data) : null };
  } catch { return null; } // Client loading retains its retry and missing-row recovery.
});
