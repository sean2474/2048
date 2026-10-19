import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { PageHeading } from "@/components/widget/page-heading";
import { GameEmblem } from "@/components/widget/game-emblem";
import { Button } from "@/components/ui/button";
import { AudioSettingsPanel } from "@/components/widget/audio-controls";
import { AccountSettings } from "@/components/widget/account-settings";
import { PreferencesSettings } from "@/components/widget/preferences-settings";
import { getI18n } from "@/lib/i18n/server";
import { getAccount } from "@/lib/supabase/account";
const panelClass = "game-panel bg-card p-5 sm:p-6";
export default async function SettingsPage() {
  const [{ t }, { user, player }] = await Promise.all([getI18n(), getAccount()]);
  const accountUser = user && !user.is_anonymous ? user : null;
  return <main className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
    <PageHeading icon="settings" title={t("Settings")}><Button asChild variant="outline"><Link href="/"><ArrowLeft aria-hidden="true" />{t("Back to home")}</Link></Button></PageHeading>
    <AudioSettingsPanel />
    <section aria-labelledby="preferences-title" className={panelClass}><h2 id="preferences-title" className="text-lg font-bold">{t("Game preferences")}</h2><PreferencesSettings /></section>
    {accountUser ? <AccountSettings key={accountUser.id} user={accountUser} initialName={player?.name ?? null} /> : <section aria-labelledby="guest-account-title" className={panelClass}><h2 id="guest-account-title" className="flex items-center gap-2 text-lg font-bold"><GameEmblem kind="profile" className="size-9" />{t("Your account")}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{t("Sign in to edit your nickname and save preferences across devices.")}</p><Button asChild className="mt-4"><Link href="/login">{t("Sign in")}</Link></Button></section>}
    <section aria-labelledby="more-settings-title" className={panelClass}><h2 id="more-settings-title" className="text-lg font-bold">{t("Help and customization")}</h2><div className="mt-3 divide-y"><Link href="/loadout" className="flex min-h-14 items-center gap-3 rounded-lg py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><GameEmblem kind="loadout" className="size-9" />{t("Board skins and ability previews")}<ArrowRight aria-hidden="true" className="ml-auto size-4 shrink-0" /></Link><Link href="/tutorial" className="flex min-h-14 items-center gap-3 rounded-lg py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><GameEmblem kind="guide" className="size-9" />{t("Interactive tutorial")}<ArrowRight aria-hidden="true" className="ml-auto size-4 shrink-0" /></Link><Link href="/how-to-play" className="flex min-h-14 items-center gap-3 rounded-lg py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><GameEmblem kind="guide" className="size-9" />{t("Game rules and controls")}<ArrowRight aria-hidden="true" className="ml-auto size-4 shrink-0" /></Link><Link href="/feedback" className="flex min-h-14 items-center gap-3 rounded-lg py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><GameEmblem kind="feedback" className="size-9" />{t("Bugs & feedback")}<ArrowRight aria-hidden="true" className="ml-auto size-4 shrink-0" /></Link></div></section>
    <nav aria-label={t("Terms of use")} className="flex flex-wrap gap-x-5 text-sm underline underline-offset-4"><Link className="inline-flex min-h-11 items-center" href="/privacy">{t("Privacy policy")}</Link><Link className="inline-flex min-h-11 items-center" href="/terms">{t("Terms of use")}</Link></nav>
  </main>;
}
