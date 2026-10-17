import Link from "next/link";
import { Eye } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { getUser } from "@/lib/supabase/account";
import { Spectator } from "@/components/widget/spectator";
import { Button } from "@/components/ui/button";
import "@/styles/match-screen.css";
export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ t }, user, { id }] = await Promise.all([getI18n(), getUser(), params]);
  return <main className="match-screen">
    <div className="match-toolbar"><h1 className="flex items-center gap-2 text-2xl font-extrabold"><Eye aria-hidden="true" />{t("Spectating")}</h1><div className="flex gap-2"><Button asChild variant="outline"><Link href="/friends">{t("Friends")}</Link></Button><Button asChild variant="outline"><Link href="/leaderboard">{t("Ranks")}</Link></Button></div></div>
    {user && !user.is_anonymous ? <Spectator id={id} /> : <section className="game-stage"><div className="space-y-4 rounded-2xl border bg-card p-6"><p>{t("Sign in to add friends, send messages, and spectate.")}</p><Button asChild><Link href="/login">{t("Login")}</Link></Button></div></section>}
  </main>;
}
