"use client";

import { DEFAULT_ABILITY_ID, type AbilityId, type SkinId } from "schema/loadout";
import { GUEST_PROFILE_ICON, type ProfileIconId } from "schema/profile-icons";
import { useCatalog } from "./catalog-provider";
import { useSettings } from "./settings-provider";

export function useLoadout() {
  const { settings, ready, saving, error, scope, saveSettings } = useSettings();
  const catalog = useCatalog();
  return {
    skin: catalog.skin(settings.skinId),
    abilityId: settings.abilityId ?? DEFAULT_ABILITY_ID,
    icon: scope === "guest" ? GUEST_PROFILE_ICON : catalog.icon(settings.iconId),
    selectIcon: (iconId: ProfileIconId) => saveSettings({ iconId }),
    selectSkin: (skinId: SkinId) => saveSettings({ skinId }),
    selectAbility: (abilityId: AbilityId | null) => saveSettings({ abilityId }),
    storageError: error,
    ready,
    saving,
    scope,
  };
}
