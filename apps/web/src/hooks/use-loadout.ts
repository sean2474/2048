"use client";

import { DEFAULT_ABILITY_ID, SKINS, type AbilityId, type SkinId } from "schema/loadout";
import { GUEST_PROFILE_ICON, PROFILE_ICONS, type ProfileIconId } from "schema/profile-icons";
import { useSettings } from "./settings-provider";

export function useLoadout() {
  const { settings, ready, saving, error, scope, saveSettings } = useSettings();
  return {
    skin: SKINS.find(skin => skin.id === settings.skinId) ?? SKINS[0],
    abilityId: settings.abilityId ?? DEFAULT_ABILITY_ID,
    icon: scope === "guest" ? GUEST_PROFILE_ICON : PROFILE_ICONS.find(icon => icon.id === settings.iconId) ?? PROFILE_ICONS[0],
    selectIcon: (iconId: ProfileIconId) => saveSettings({ iconId }),
    selectSkin: (skinId: SkinId) => saveSettings({ skinId }),
    selectAbility: (abilityId: AbilityId | null) => saveSettings({ abilityId }),
    storageError: error,
    ready, saving, scope,
  };
}
