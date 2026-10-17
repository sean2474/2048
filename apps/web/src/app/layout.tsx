import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/widget/header";
import { I18nProvider } from "ui/i18n";
import { getI18n } from "@/lib/i18n/server";
import { SettingsProvider } from "@/hooks/settings-provider";
import { AudioProvider } from "@/hooks/audio-provider";
import { CatalogProvider, CatalogNotice } from "@/hooks/catalog-provider";
import { AchievementsProvider } from "@/hooks/use-achievements";
import { FriendPresenceProvider } from "@/hooks/friend-presence-provider";
import { GameAnalytics } from "@/components/widget/analytics";
import { PlayerProvider } from "@/hooks/use-player";
import { getPreferences } from "@/lib/supabase/preferences";
import { getAccount } from "@/lib/supabase/account";

export const metadata: Metadata = {
  title: "2048 Duo",
  referrer: "origin",
  description: "Race your friends to 1024 in real-time multiplayer. Merge tiles to send obstacles, create a private room, or find a quick match.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [{ locale, guestLocale, messages }, account, preferences] = await Promise.all([getI18n(), getAccount(), getPreferences()]);
  return (
    <html lang={locale}>
      <body className={`antialiased`}>
        <I18nProvider initialLocale={locale} messages={messages}>
          <PlayerProvider initialAccount={account}>
          <CatalogProvider>
          <SettingsProvider initialGuestLocale={guestLocale} initialAccount={preferences}>
          <AudioProvider>
          <AchievementsProvider>
          <FriendPresenceProvider>
          <Header />
          <div className="mx-auto max-w-[1040px] px-4"><CatalogNotice /></div>
          {children}
          <GameAnalytics />
          </FriendPresenceProvider>
          </AchievementsProvider>
          </AudioProvider>
          </SettingsProvider>
          </CatalogProvider>
          </PlayerProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
