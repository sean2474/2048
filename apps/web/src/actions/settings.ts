"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  isSettings,
  isSettingsPatch,
  settingsFromRow,
  settingsToRow,
  type Settings,
} from "@/lib/preferences";

const columns = "locale,keybindings,skin_id,icon_id,ability_id,custom_shortcuts";
type Result<T> = { ok: true; data: T } | { ok: false; error: string };

// The expected ID is only a stale-tab guard. Authorization always comes from
// the verified cookie session and row-level policies, never from the input ID.
async function accountClient(expectedUserId: string) {
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user || user.is_anonymous || user.id !== expectedUserId)
    throw new Error("Authentication required");
  return { client, user };
}

export async function readSettingsAction(expectedUserId: string): Promise<Result<Settings | null>> {
  try {
    const { client, user } = await accountClient(expectedUserId);
    const { data, error } = await client
      .from("player_preferences")
      .select(columns)
      .eq("player_id", user.id)
      .maybeSingle();
    if (error) throw error;
    return { ok: true, data: data ? settingsFromRow(data) : null };
  } catch {
    return { ok: false, error: "Could not load your settings. Retry before making changes." };
  }
}

export async function seedSettingsAction(
  expectedUserId: string,
  input: unknown,
): Promise<Result<null>> {
  if (!isSettings(input))
    return { ok: false, error: "These settings are not valid. Check your selections." };
  try {
    const { client, user } = await accountClient(expectedUserId);
    const { error } = await client
      .from("player_preferences")
      .upsert(
        { player_id: user.id, ...settingsToRow(input) },
        { onConflict: "player_id", ignoreDuplicates: true },
      );
    if (error) throw error;
    revalidatePath("/", "layout");
    return { ok: true, data: null };
  } catch {
    return { ok: false, error: "Could not save your settings. Please try again." };
  }
}

export async function saveSettingsAction(
  expectedUserId: string,
  input: unknown,
): Promise<Result<Settings>> {
  if (!isSettingsPatch(input) || Object.keys(input).length === 0)
    return { ok: false, error: "These settings are not valid. Check your selections." };
  try {
    const { client, user } = await accountClient(expectedUserId);
    const { data, error } = await client
      .from("player_preferences")
      .update(settingsToRow(input))
      .eq("player_id", user.id)
      .select(columns)
      .single();
    if (error) throw error;
    const settings = settingsFromRow(data);
    revalidatePath("/", "layout");
    return { ok: true, data: settings };
  } catch {
    return { ok: false, error: "Could not save your settings. Please try again." };
  }
}

export async function saveNicknameAction(
  expectedUserId: string,
  input: unknown,
): Promise<Result<string>> {
  if (
    typeof input !== "string" ||
    Array.from(input.trim()).length < 1 ||
    Array.from(input.trim()).length > 32
  )
    return { ok: false, error: "Use 1–32 characters for your nickname." };
  try {
    const { client, user } = await accountClient(expectedUserId);
    const { data, error } = await client
      .from("players")
      .update({ name: input.trim() })
      .eq("id", user.id)
      .select("name")
      .single();
    if (error || typeof data?.name !== "string") throw new Error("Profile update failed");
    revalidatePath("/", "layout");
    return { ok: true, data: data.name };
  } catch {
    return { ok: false, error: "Could not save your nickname. Please try again." };
  }
}
