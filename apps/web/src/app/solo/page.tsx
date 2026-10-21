import Link from "next/link";
import { Suspense } from "react";
import { Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeading } from "@/components/widget/page-heading";
import { getI18n } from "@/lib/i18n/server";
import { SoloDetails, SoloDetailsSkeleton } from "./solo-details";
import {
  SoloBoardControls,
  SoloModeDetails,
  SoloModePicker,
  SoloRestartDialog,
  SoloSession,
} from "./solo-session";
import "@/styles/solo.css";

export default async function SoloPage() {
  const { t } = await getI18n();
  const details = (
    <SoloModeDetails
      timeAttack={
        <Suspense fallback={<SoloDetailsSkeleton label={t("Loading records…")} />}>
          <SoloDetails mode="time-attack" />
        </Suspense>
      }
      endless={
        <Suspense fallback={<SoloDetailsSkeleton label={t("Loading records…")} />}>
          <SoloDetails mode="endless" />
        </Suspense>
      }
    />
  );
  return (
    <main className="solo-page mx-auto max-w-[1040px] space-y-3 px-4 py-3 md:space-y-6 md:px-6 md:py-10 lg:px-8">
      <PageHeading icon="crown" title={t("Single player")}>
        <Button asChild variant="outline" className="size-11 p-0 sm:w-auto sm:px-4">
          <Link
            href="/leaderboard?mode=solo"
            aria-label={t("Time rankings")}
            title={t("Time rankings")}
          >
            <Trophy aria-hidden="true" />
            <span className="hidden sm:inline">{t("Time rankings")}</span>
          </Link>
        </Button>
      </PageHeading>
      <SoloSession>
        <SoloModePicker />
        <div className="grid items-start gap-3 md:grid-cols-[minmax(0,1fr)_300px] md:gap-8">
          <SoloBoardControls details={details} />
          <aside className="hidden space-y-5 md:block">{details}</aside>
        </div>
        <SoloRestartDialog />
      </SoloSession>
    </main>
  );
}
