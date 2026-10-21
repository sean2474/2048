import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { GameEmblem } from "@/components/widget/game-emblem";
import { Button } from "@/components/ui/button";
import { CreateRoomControls } from "@/components/widget/create-room-controls";
import { getI18n } from "@/lib/i18n/server";
export default async function Page() {
  const { t } = await getI18n();
  return (
    <main className="mx-auto w-full max-w-[520px] px-4 py-8 sm:py-12">
      <section className="game-panel bg-card p-6 sm:p-8">
        <GameEmblem kind="friend" className="mb-6 size-20" />
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {t("Friend match · No Elo changes")}
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight">{t("Play with a friend")}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {t("Share the room code with your friend.")}
        </p>
        <CreateRoomControls />
        <Button asChild variant="outline" className="w-full">
          <Link href="/find-match">
            <ArrowLeft aria-hidden="true" />
            {t("Cancel")}
          </Link>
        </Button>
      </section>
    </main>
  );
}
