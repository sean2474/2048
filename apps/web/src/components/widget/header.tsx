import { getI18n } from "@/lib/i18n/server";
import Link from "next/link";
import { GameEmblem } from "@/components/widget/game-emblem";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { UserAvatar } from "./user-avatar";
export const Header = async () => {
  const { t, locale } = await getI18n();
  let player = null;
  let balance: number | null = null;
  const configured = isSupabaseConfigured();
  if (configured) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user && !user.is_anonymous) {
      const [profile, walletResult] = await Promise.allSettled([
        supabase.from("players").select("name").eq("id", user.id).maybeSingle(),
        supabase.from("player_wallets").select("balance").eq("player_id", user.id).maybeSingle(),
      ]);
      player = profile.status === "fulfilled" ? profile.value.data : null;
      player ??= { name: t("Player") };
      if (walletResult.status === "fulfilled") {
        const { data: wallet, error } = walletResult.value;
        if (!error && wallet && Number.isSafeInteger(wallet.balance) && wallet.balance >= 0) balance = wallet.balance;
      }
    }
  }
  const coinLabel = balance === null ? t("Could not load your coin balance.") : t("{count} coins", { count: balance.toLocaleString(locale === "ko" ? "ko-KR" : "en-US") });
  const navClass = "inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:px-3 sm:text-sm";
  return <header className="border-b border-border/70">
    <div className="mx-auto flex max-w-[1040px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6 lg:px-8 lg:py-4">
      <Link href="/" data-analytics-link="/" aria-label={t("2048 Duo home")} className="inline-flex min-h-11 items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
        <GameEmblem kind="duel" className="hidden size-10 rounded-xl bg-accent p-2 sm:block" />
        <span className="text-lg font-extrabold tracking-tight">2048<span className="font-medium">{t("Duo")}</span></span>
      </Link>
      <nav aria-label={t("Main navigation")} className="order-3 -ml-2 flex w-full min-w-0 flex-wrap items-center gap-x-1 pt-1 lg:order-none lg:ml-0 lg:w-auto lg:flex-1 lg:flex-nowrap lg:pt-0">
        <Link href="/" data-analytics-link="/" className={navClass}>{t("Dashboard")}</Link>
        <Link href="/find-match" data-analytics-link="/find-match" className={navClass}>{t("Find match")}</Link>
        <Link href="/leaderboard" data-analytics-link="/leaderboard" className={navClass}>{t("Ranks")}</Link>
        <Link href="/how-to-play" data-analytics-link="/how-to-play" className={navClass}>{t("How to play")}</Link>
        <Link href="/settings" data-analytics-link="/settings" className={navClass}>{t("Settings")}</Link>
        <Link href="/feedback" data-analytics-link="/feedback" className={navClass}>{t("Feedback")}</Link>
      </nav>
      <div className="flex items-center gap-2">
        {player ? <><span className="hidden max-w-24 truncate text-sm font-medium lg:block">{player.name}</span><Link href="/loadout" data-analytics-link="/loadout" aria-label={`${t("My loadout")} · ${coinLabel}`} title={balance === null ? t("Could not load your coin balance.") : t("My coins")} className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-semibold hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><GameEmblem kind="coin" className="size-7" /><span className="tabular-nums">{balance === null ? "—" : balance.toLocaleString(locale === "ko" ? "ko-KR" : "en-US")}</span></Link><UserAvatar /></> : configured ? <>
          <Button asChild variant="ghost" className="px-3"><Link href="/login" data-analytics-link="/login">{t("Login")}</Link></Button>
          <Button asChild variant="outline" className="px-3"><Link href="/signup" data-analytics-link="/signup">{t("Sign Up")}</Link></Button><UserAvatar guest />
        </> : <><span className="text-sm text-muted-foreground">{t("Guest play")}</span><UserAvatar guest /></>}
      </div>
    </div>
  </header>;
};
