import { soloMessages } from "./solo-messages";
import { rankMessages } from "./rank-messages";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { LOCALE_COOKIE, translate, type Values } from "ui/locale";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { GUEST_SETTINGS_COOKIE, parseGuestSettings } from "@/lib/preferences";
import { messages } from "./messages";
import { gameMessages } from "./game-messages";
import { controlsMessages } from "./controls-messages";
import { tutorialMessages } from "./tutorial-messages";
import { settingsMessages } from "./settings-messages";
import { preferencesMessages } from "./preferences-messages";
import { detectRequestLocale } from "./request-locale";
import { feedbackMessages } from "./feedback-messages";
import { authMessages } from "./auth-messages";
import { economyMessages } from "./economy-messages";
import { achievementMessages } from "./achievement-messages";

export const getI18n = cache(async () => {
  const jar = await cookies();
  const requestHeaders = await headers();
  const guest = jar.get(GUEST_SETTINGS_COOKIE)?.value;
  const legacyLocale = jar.get(LOCALE_COOKIE)?.value;
  const detectedLocale = detectRequestLocale(requestHeaders.get("x-vercel-ip-country"), requestHeaders.get("accept-language"));
  const guestLocale = parseGuestSettings(guest, !guest && (legacyLocale === "ko" || legacyLocale === "en") ? legacyLocale : detectedLocale).locale;
  let locale = guestLocale;
  if (isSupabaseConfigured()) {
    try {
      const client = await createClient();
      const { data: { user } } = await client.auth.getUser();
      if (user && !user.is_anonymous) {
        const { data } = await client.from("player_preferences").select("locale").eq("player_id", user.id).maybeSingle();
        if (data?.locale === "ko" || data?.locale === "en") locale = data.locale;
      }
    } catch { /* Render with the guest locale while the client offers a retry. */ }
  }
  const dictionary = { ...messages, ...rankMessages, ...gameMessages, ...controlsMessages, ...tutorialMessages, ...settingsMessages, ...preferencesMessages, ...feedbackMessages, ...economyMessages, ...authMessages, ...achievementMessages, ...soloMessages };
  return { locale, guestLocale, messages: dictionary, t: (key: string, values?: Values) => translate(locale, dictionary, key, values) };
});
