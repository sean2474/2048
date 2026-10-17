import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { GameEmblem } from "@/components/widget/game-emblem";
import { SoundToggle } from "@/components/widget/audio-controls";
import { Button } from "@/components/ui/button";
import { TutorialPractice } from "@/components/widget/tutorial-practice";
import "@/styles/match-screen.css";
import "@/styles/tutorial.css";
export default async function TutorialPage() {
  const { t } = await getI18n();
  return <main className="match-screen tutorial-screen">
    <header className="match-toolbar">
      <div className="flex min-w-0 items-center gap-3"><GameEmblem kind="guide" className="size-10" /><div><p className="text-xs font-semibold text-muted-foreground">{t("Local practice")}</p><h1 className="text-lg font-extrabold tracking-tight">{t("Interactive tutorial")}</h1></div></div>
      <div className="flex max-w-full flex-wrap items-center gap-2"><SoundToggle /><Button asChild size="sm" variant="ghost"><Link href="/find-match">{t("Exit tutorial")}<ArrowRight aria-hidden="true" /></Link></Button></div>
    </header>
    <TutorialPractice />
  </main>;
}
