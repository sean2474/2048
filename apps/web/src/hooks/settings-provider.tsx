"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "ui/i18n";
import { LOCALE_COOKIE, type Locale } from "ui/locale";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { GUEST_SETTINGS_COOKIE, parseGuestSettings, settingsFromRow, settingsToRow, SettingsStore, type Settings, type SettingsPatch, type SettingsState } from "@/lib/preferences";

type SettingsContext = SettingsState & { saveSettings: (patch: SettingsPatch) => Promise<boolean>; retry: () => void };
const Context = createContext<SettingsContext | null>(null);
const cookieValue = (name: string) => document.cookie.split("; ").find(part => part.startsWith(`${name}=`))?.slice(name.length + 1);
function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  if (cookieValue(name) !== value) throw new Error("Cookies unavailable");
}

export function SettingsProvider({ children, initialGuestLocale }: { children: ReactNode; initialGuestLocale: Locale }) {
  const { locale, setLocale } = useI18n();
  const router = useRouter();
  const i18nRef = useRef({ locale, setLocale });
  useEffect(() => { i18nRef.current = { locale, setLocale }; }, [locale, setLocale]);
  const [state, setState] = useState<SettingsState | null>(null);
  const guestFallback = useRef<Settings | null>(null);
  const guestLocale = useRef(initialGuestLocale);
  const storeRef = useRef<SettingsStore | null>(null);
  if (!storeRef.current) storeRef.current = new SettingsStore({
    readGuest: () => {
      const raw = cookieValue(GUEST_SETTINGS_COOKIE);
      if (raw) return parseGuestSettings(raw, guestLocale.current);
      // Preserve the old guest locale before an account locale replaces its mirror.
      if (!guestFallback.current) {
        guestFallback.current = parseGuestSettings(undefined, guestLocale.current);
        try { writeCookie(GUEST_SETTINGS_COOKIE, encodeURIComponent(JSON.stringify(guestFallback.current))); }
        catch { /* Keep the guest snapshot for this visit; saves still report cookie failures. */ }
      }
      return guestFallback.current;
    },
    writeGuest: settings => writeCookie(GUEST_SETTINGS_COOKIE, encodeURIComponent(JSON.stringify(settings))),
    mirrorLocale: next => {
      writeCookie(LOCALE_COOKIE, next);
      if (i18nRef.current.locale !== next) {
        i18nRef.current.setLocale(next);
        router.refresh();
      }
    },
    readAccount: async id => {
      const { data, error } = await createClient().from("player_preferences").select("locale,keybindings,skin_id,icon_id,ability_id,custom_shortcuts").eq("player_id", id).maybeSingle();
      if (error) throw error;
      return data ? settingsFromRow(data) : null;
    },
    seedAccount: async (id, settings) => {
      const { error } = await createClient().from("player_preferences").upsert({ player_id: id, ...settingsToRow(settings) }, { onConflict: "player_id", ignoreDuplicates: true });
      if (error) throw error;
    },
    updateAccount: async (id, patch) => {
      const { data, error } = await createClient().from("player_preferences").update(settingsToRow(patch)).eq("player_id", id).select("locale,keybindings,skin_id,icon_id,ability_id,custom_shortcuts").single();
      if (error) throw error;
      return settingsFromRow(data);
    },
  }, setState, locale);
  const store = storeRef.current;
  const current = state ?? store.state;

  useEffect(() => {
    if (!isSupabaseConfigured()) { void store.load(null); return () => store.dispose(); }
    let active = true;
    let account: string | null | undefined;
    const { data: { subscription } } = createClient().auth.onAuthStateChange((_event, session) => {
      const next = session?.user && !session.user.is_anonymous ? session.user.id : null;
      if (next === account) return;
      account = next;
      // Leave Supabase's auth callback before issuing database requests.
      queueMicrotask(() => { if (active && account === next) void store.load(next); });
    });
    return () => { active = false; store.dispose(); subscription.unsubscribe(); };
  }, [store]);

  return <Context.Provider value={{ ...current, saveSettings: patch => store.save(patch), retry: () => { void store.retry(); } }}>{children}</Context.Provider>;
}

export function useSettings() {
  const value = useContext(Context);
  if (!value) throw new Error("SettingsProvider is required");
  return value;
}
