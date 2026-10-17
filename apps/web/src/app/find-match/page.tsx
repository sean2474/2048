import { getI18n } from "@/lib/i18n/server";
import { RankedMatchButton } from "@/components/widget/ranked-match-button";
import Link from "next/link";
import { PageHeading } from "@/components/widget/page-heading";
import { GameEmblem } from "@/components/widget/game-emblem";
import { ArrowRight, KeyRound, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LoadoutSummary } from "@/components/widget/loadout-summary";
import { AbilityPicker } from "@/components/widget/ability-picker";
import { DemoBoard } from "@/components/widget/demo-board";

export default async function Page() {
  const { t } = await getI18n();
  return <main className="match-selection mx-auto max-w-[960px] px-4 py-4 sm:px-6 sm:py-10 lg:px-8">
    <PageHeading icon="duel" title={t("Find match")} eyebrow={t("1 vs 1")} />
    <div className="mt-4 grid items-center gap-4 sm:mt-6 sm:gap-6 md:grid-cols-[minmax(0,1fr)_280px] md:gap-8 lg:gap-10">
      <section aria-label={t("Duel preview")} className="mx-auto hidden w-full max-w-[440px] min-w-0 md:block"><DemoBoard /></section>
      <section aria-labelledby="game-menu-title" className="mx-auto w-full max-w-[440px] game-panel bg-card p-4 sm:p-6">
        <h2 id="game-menu-title" className="sr-only text-lg font-bold tracking-tight sm:not-sr-only sm:mb-5">{t("Choose a match")}</h2>
        <div className="space-y-2 sm:space-y-3">
          <Button asChild className="game-menu-link w-full justify-start px-4"><Link href="/play/online" data-analytics-link="/play/online"><GameEmblem kind="duel" className="size-10" />{t("Casual match")}<ArrowRight aria-hidden="true" className="ml-auto" /></Link></Button>
          <RankedMatchButton />
          <Dialog>
            <DialogTrigger asChild><Button variant="outline" className="game-menu-link w-full justify-start px-4"><GameEmblem kind="friend" className="size-10" />{t("Friendly match")}<ArrowRight aria-hidden="true" className="ml-auto" /></Button></DialogTrigger>
            <DialogContent className="rounded-2xl p-6 sm:max-w-sm">
              <DialogTitle className="pr-6">{t("Friendly match")}</DialogTitle>
              <DialogDescription>{t("Create a room or join a friend with a room code.")}</DialogDescription>
              <div className="grid gap-3 pt-2"><Button asChild className="justify-start"><Link href="/play/create"><Plus aria-hidden="true" />{t("Create room")}<ArrowRight aria-hidden="true" className="ml-auto" /></Link></Button><Button asChild variant="outline" className="justify-start"><Link href="/play/join"><KeyRound aria-hidden="true" />{t("Join room")}<ArrowRight aria-hidden="true" className="ml-auto" /></Link></Button></div>
            </DialogContent>
          </Dialog>
        </div>
        <div className="mt-4 space-y-2 sm:mt-5 sm:space-y-3"><AbilityPicker /><LoadoutSummary /></div>
        <Link href="/history" data-analytics-link="/history" className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:mt-3">{t("Match history")}</Link>
      </section>
    </div>
  </main>;
}
