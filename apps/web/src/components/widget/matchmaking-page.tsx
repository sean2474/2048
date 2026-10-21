import "server-only";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GameEmblem } from "@/components/widget/game-emblem";
import { CatalogIcon } from "@/components/catalog/catalog-icon";
import { LobbyContenders } from "./lobby-contenders";
import { MatchLobby } from "@/components/widget/match-lobby";
import { getI18n } from "@/lib/i18n/server";
import { getUser } from "@/lib/supabase/account";
import "@/styles/match-lobby.css";

export async function MatchmakingPage({ mode }: { mode: "casual" | "ranked" }) {
  const [{ t }, user] = await Promise.all([getI18n(), getUser()]);
  const ranked = mode === "ranked";
  const canSearch = !ranked || !!user && !user.is_anonymous;
  const rules = <p className="lobby-help">{t(ranked ? "Ranked matches affect Elo. Your first 10 matches establish your tier; after that, tiers change automatically with Elo. Elo and your established tier carry over between seasons. Complete 10 ranked matches each season to enter its standings." : "Casual matches do not affect Elo.")}</p>;
  return <main className="match-lobby mx-auto w-full max-w-[800px] px-4 py-6 sm:py-10">
    <section className="lobby-arena" aria-labelledby="lobby-title">
      <header className="lobby-heading">
        <p className="lobby-eyebrow"><GameEmblem kind="duel" className="size-4" />2048 DUO<span />{t("Matchmaking")}</p>
        <h1 id="lobby-title">{t(ranked ? "Ranked match" : "Casual match")}</h1>
      </header>
      {canSearch ? <MatchLobby mode={mode} rules={rules} /> : <>
        <LobbyContenders playerName={t("Guest")} icon={<CatalogIcon icon={{ id: "guest" }} className="lobby-icon" />} t={t} />
        <div className="lobby-status"><div className="lobby-status-line"><ShieldAlert size={18} aria-hidden="true" /><p>{t("Sign in to play ranked matches.")}</p></div>{rules}</div>
        <nav className="lobby-actions">
          <Button asChild className="lobby-primary"><Link href="/login">{t("Sign in for ranked")}<ArrowRight aria-hidden="true" /></Link></Button>
          <Button asChild variant="outline" className="lobby-cancel"><Link href="/find-match"><ArrowLeft aria-hidden="true" />{t("Back to menu")}</Link></Button>
        </nav>
      </>}
    </section>
  </main>;
}
