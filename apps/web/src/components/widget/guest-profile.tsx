import "server-only";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GameEmblem } from "./game-emblem";
import type { getI18n } from "@/lib/i18n/server";

export function GuestProfile({ t }: { t: Awaited<ReturnType<typeof getI18n>>["t"] }) {
  return <section aria-labelledby="profile-title" className="game-panel min-w-0 bg-card p-6 sm:p-8">
          <div className="mb-5 flex items-center gap-3"><GameEmblem kind="profile" className="size-12" /><h2 id="profile-title" className="text-xl font-bold">{t("Guest")}</h2></div>
          <p className="text-sm leading-7 text-muted-foreground">{t("Guests can play casual and friend matches.")}</p>
          <p className="mt-4 border-t pt-4 text-sm leading-7 text-muted-foreground">{t("Sign in to keep your match history and track your Elo, tier, and ranked results.")}</p>
          <div className="mt-5 flex flex-wrap gap-3"><Button asChild variant="outline"><Link href="/login" data-analytics-link="/login">{t("Log in")}</Link></Button><Button asChild variant="ghost"><Link href="/signup" data-analytics-link="/signup">{t("Create account")}</Link></Button></div>
  </section>;
}
