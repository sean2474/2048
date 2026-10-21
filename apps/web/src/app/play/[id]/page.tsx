import Link from "next/link";
import { notFound } from "next/navigation";
import { C2S } from "schema/in-game";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GameEmblem } from "@/components/widget/game-emblem";
import { getI18n } from "@/lib/i18n/server";
import { GameSession, MatchBoards, MatchControls, MatchStatus, MatchToolbarControls } from "./game-session";
import "@/styles/match-screen.css";

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!C2S.joinRoom.safeParse({ t: "joinRoom", roomId: id }).success) notFound();
  const { t } = await getI18n();
  const joining = <div className="mx-auto max-w-lg px-4 py-12 sm:py-20"><section role="status" aria-label={t("Joining your game…")} className="game-panel bg-card p-8 text-center shadow-sm sm:p-10">
    <GameEmblem kind="duel" className="mx-auto mb-6 size-20" />
    <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">{t("The arena")}</p>
    <h2 className="text-3xl font-bold tracking-tight">{t("Joining your game…")}</h2>
    <p className="mt-4 text-sm leading-6 text-muted-foreground">{t("Getting your board ready. One moment.")}</p>
    <div className="mx-auto mt-6 grid max-w-48 grid-cols-4 gap-2">{Array.from({ length: 16 }, (_, index) => <Skeleton key={index} className="aspect-square" />)}</div>
    <Button asChild variant="outline" className="mt-8"><Link href="/find-match">{t("Back to menu")}</Link></Button>
  </section></div>;
  return <main className="contents">
    <h1 className="sr-only">2048 DUO · {t("The arena")}</h1>
    <GameSession roomId={id} fallback={joining}>
      <div className="match-screen">
        <section className="match-toolbar"><MatchStatus /><MatchToolbarControls /></section>
        <div className="game-stage"><MatchBoards /></div>
        <MatchControls />
      </div>
    </GameSession>
  </main>;
}
