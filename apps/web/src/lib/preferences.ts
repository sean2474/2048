import { ABILITIES, RETIRED_ABILITY_IDS, SKINS, type AbilityId, type SkinId } from "schema/loadout";
import { DEFAULT_PROFILE_ICON, isProfileIconId, type ProfileIconId } from "schema/profile-icons";
import type { Locale } from "ui/locale";
import { DEFAULT_KEYBINDINGS, isKeybindings, type Keybindings } from "./keybindings";

export type Settings = { locale: Locale; keybindings: Keybindings; skinId: SkinId; iconId: ProfileIconId; abilityId: AbilityId | null; customShortcuts: boolean };
export type SettingsPatch = Partial<Settings>;
export const GUEST_SETTINGS_COOKIE = "duo.guest-settings";
export const DEFAULT_SETTINGS: Settings = { locale: "ko", keybindings: { ...DEFAULT_KEYBINDINGS }, skinId: "classic", iconId: DEFAULT_PROFILE_ICON, abilityId: null, customShortcuts: true };
const FIELDS = ["locale", "keybindings", "skinId", "iconId", "abilityId", "customShortcuts"] as const;

export function isSettingsPatch(value: unknown): value is SettingsPatch {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, item]) => {
    switch (key) {
      case "locale": return item === "ko" || item === "en";
      case "keybindings": return isKeybindings(item);
      case "skinId": return SKINS.some(skin => skin.id === item);
      case "iconId": return isProfileIconId(item);
      case "abilityId": return item === null || ABILITIES.some(ability => ability.id === item);
      case "customShortcuts": return typeof item === "boolean";
      default: return false;
    }
  });
}

export function isSettings(value: unknown): value is Settings {
  return isSettingsPatch(value) && FIELDS.every(field => Object.hasOwn(value, field));
}

function upgradeSettings(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const settings = value as Record<string, unknown>;
  // Retiring a preview must not reset language, controls or the equipped skin.
  return { iconId: DEFAULT_PROFILE_ICON, ...settings,
    ...(typeof settings.abilityId === "string" && RETIRED_ABILITY_IDS.includes(settings.abilityId) ? { abilityId: null } : {}) };
}

function guestDefaults(settings: Settings): Settings {
  return { ...settings, skinId: "classic", iconId: DEFAULT_PROFILE_ICON, abilityId: null };
}

export function parseGuestSettings(value?: string, fallbackLocale: Locale = "ko"): Settings {
  try {
    const parsed = upgradeSettings(value ? JSON.parse(decodeURIComponent(value)) : null);
    if (isSettings(parsed)) return guestDefaults(parsed);
  } catch { /* Damaged cookies must not disable game controls. */ }
  return { ...DEFAULT_SETTINGS, locale: fallbackLocale, keybindings: { ...DEFAULT_KEYBINDINGS } };
}

export function settingsFromRow(value: unknown): Settings {
  const row = value as Record<string, unknown> | null;
  const settings = upgradeSettings(row && { locale: row.locale, keybindings: row.keybindings, skinId: row.skin_id, iconId: row.icon_id ?? DEFAULT_PROFILE_ICON, abilityId: row.ability_id, customShortcuts: row.custom_shortcuts });
  if (!isSettings(settings)) throw new Error("Invalid saved settings");
  return settings;
}

export function settingsToRow(patch: SettingsPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (Object.hasOwn(patch, "locale")) row.locale = patch.locale;
  if (Object.hasOwn(patch, "keybindings")) row.keybindings = patch.keybindings;
  if (Object.hasOwn(patch, "skinId")) row.skin_id = patch.skinId;
  if (Object.hasOwn(patch, "iconId")) row.icon_id = patch.iconId;
  if (Object.hasOwn(patch, "abilityId")) row.ability_id = patch.abilityId;
  if (Object.hasOwn(patch, "customShortcuts")) row.custom_shortcuts = patch.customShortcuts;
  return row;
}

export type SettingsState = { settings: Settings; ready: boolean; saving: boolean; error: string | null; scope: "account" | "guest" };
type SettingsStorage = {
  readGuest: () => Settings;
  writeGuest: (settings: Settings) => void;
  readAccount: (id: string) => Promise<Settings | null>;
  seedAccount: (id: string, settings: Settings) => Promise<void>;
  updateAccount: (id: string, patch: SettingsPatch) => Promise<Settings>;
  mirrorLocale: (locale: Locale) => void;
};

// Keep late account requests from applying after logout or an account switch.
export class SettingsStore {
  state: SettingsState;
  private account: string | null = null;
  private generation = 0;
  constructor(private storage: SettingsStorage, private changed: (state: SettingsState) => void, initialLocale: Locale) {
    this.state = { settings: { ...DEFAULT_SETTINGS, locale: initialLocale }, ready: false, saving: false, error: null, scope: "guest" };
  }
  private emit(patch: Partial<SettingsState>) {
    this.state = { ...this.state, ...patch };
    this.changed(this.state);
  }
  private apply(settings: Settings): boolean {
    this.emit({ settings, ready: true, saving: false, error: null });
    try { this.storage.mirrorLocale(settings.locale); return true; }
    catch { this.emit({ error: "Settings loaded, but language cookies are blocked. Allow cookies and retry." }); return false; }
  }
  async load(account: string | null): Promise<void> {
    this.account = account;
    const generation = ++this.generation;
    this.emit({ ready: false, saving: false, error: null, scope: account ? "account" : "guest", settings: { ...DEFAULT_SETTINGS } });
    try {
      const guest = guestDefaults(this.storage.readGuest());
      if (!account) { this.apply(guest); return; }
      let settings = await this.storage.readAccount(account);
      if (generation !== this.generation) return;
      if (!settings) {
        await this.storage.seedAccount(account, guest);
        if (generation !== this.generation) return;
        // Another tab may have created the row first; its account settings win.
        settings = await this.storage.readAccount(account);
      }
      if (generation !== this.generation) return;
      if (!settings) throw new Error("Missing settings");
      this.apply(settings);
    } catch {
      if (generation === this.generation) this.emit({ ready: false, error: "Could not load your settings. Retry before making changes." });
    }
  }
  async save(patch: SettingsPatch): Promise<boolean> {
    if (!this.state.ready || this.state.saving) return false;
    if (!isSettingsPatch(patch)) { this.emit({ error: "These settings are not valid. Check your selections." }); return false; }
    if (!this.account && ["skinId", "iconId", "abilityId"].some(field => Object.hasOwn(patch, field))) {
      this.emit({ error: "Log in to customize your loadout." }); return false;
    }
    const generation = this.generation;
    const account = this.account;
    this.emit({ saving: true, error: null });
    try {
      let settings: Settings;
      if (account) settings = await this.storage.updateAccount(account, patch);
      else {
        // Read the cookie again so another tab's unrelated changes are preserved.
        settings = guestDefaults({ ...this.storage.readGuest(), ...patch });
        this.storage.writeGuest(settings);
      }
      if (generation !== this.generation) return false;
      return this.apply(settings);
    } catch {
      if (generation === this.generation) this.emit({ saving: false, error: "Could not save your settings. Please try again." });
      return false;
    }
  }
  retry() { return this.load(this.account); }
  dispose() { ++this.generation; }
}
