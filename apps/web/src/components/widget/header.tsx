import { getI18n } from "@/lib/i18n/server";
import Link from "next/link";
import { GameEmblem } from "@/components/widget/game-emblem";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { UserAvatar } from "./user-avatar";
import { getAccount } from "@/lib/supabase/account";
import { MobileNavigation } from "./mobile-navigation";
export const Header = async () => {
  const { t, locale } = await getI18n();
  let player = null;
  let balance: number | null = null;
  const configured = isSupabaseConfigured();
  if (configured) {
    const supabase = await createClient();
    const { user, player: profile } = await getAccount();
    if (user && !user.is_anonymous) {
      const [walletResult] = await Promise.allSettled([
        supabase.from("player_wallets").select("balance").eq("player_id", user.id).maybeSingle(),
      ]);
      player = profile;
      player ??= { name: t("Player") };
      if (walletResult.status === "fulfilled") {
        const { data: wallet, error } = walletResult.value;
        if (!error && wallet && Number.isSafeInteger(wallet.balance) && wallet.balance >= 0) balance = wallet.balance;
      }
    }
  }
  const coinLabel = balance === null ? t("Could not load your coin balance.") : t("{count} coins", { count: balance.toLocaleString(locale === "ko" ? "ko-KR" : "en-US") });
  const navLinks = [
    { href: "/find-match", label: t("Find match") },
    { href: "/solo", label: t("Single player") },
    { href: "/leaderboard", label: t("Ranks") },
    { href: "/how-to-play", label: t("How to play") },
    { href: "/settings", label: t("Settings") },
    { href: "/feedback", label: t("Feedback") },
  ];
  const navClass = "inline-flex min-h-11 shrink-0 whitespace-nowrap items-center justify-center rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:justify-start sm:px-2 sm:text-sm";
  return <header className="border-b border-border/70">
    <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6 lg:px-8 lg:py-4">
      <Link href="/" data-analytics-link="/" aria-label={t("2048 Duo home")} className="inline-flex min-h-11 items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
        <GameEmblem kind="duel" className="hidden size-10 rounded-xl bg-accent p-2 sm:block" />
        <span className="text-lg font-extrabold tracking-tight">2048<span className="font-medium">{t("Duo")}</span></span>
      </Link>
      <nav aria-label={t("Main navigation")} className="hidden min-w-0 flex-1 items-center gap-x-1 lg:flex">
        {navLinks.map(({ href, label }) => <Link key={href} href={href} data-analytics-link={href} className={navClass}>{label}</Link>)}
      </nav>
      <div className="flex items-center gap-2">
        {player ? <><span className="hidden max-w-24 truncate text-sm font-medium xl:block">{player.name}</span><Link href="/loadout" data-analytics-link="/loadout" aria-label={`${t("My loadout")} · ${coinLabel}`} title={balance === null ? t("Could not load your coin balance.") : `${t("My coins")} · ${coinLabel}`} className="inline-flex min-h-11 min-w-11 max-w-20 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-semibold sm:max-w-none hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><GameEmblem kind="coin" className="size-7 shrink-0" /><span className="truncate tabular-nums">{balance === null ? "—" : balance.toLocaleString(locale === "ko" ? "ko-KR" : "en-US")}</span></Link><UserAvatar /></> : configured ? <>
          <Button asChild variant="ghost" className="hidden px-3 lg:inline-flex"><Link href="/login" data-analytics-link="/login">{t("Login")}</Link></Button>
          <Button asChild variant="outline" className="hidden px-3 lg:inline-flex"><Link href="/signup" data-analytics-link="/signup">{t("Sign Up")}</Link></Button><UserAvatar guest />
        </> : <><span className="hidden text-sm text-muted-foreground lg:inline">{t("Guest play")}</span><UserAvatar guest /></>}
        <MobileNavigation label={t("Main navigation")} links={navLinks} authLinks={configured && !player ? [{ href: "/login", label: t("Login") }, { href: "/signup", label: t("Sign Up") }] : []} />
      </div>
    </div>
  </header>;
};
