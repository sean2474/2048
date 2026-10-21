import "server-only";
import { headers } from "next/headers";
import { C2S } from "schema/in-game";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingAction, LoadingBoard, LoadingFrame } from "./route-skeletons";
import { getRequestI18n } from "@/lib/i18n/server";
import "@/styles/match-screen.css";
import "@/styles/tutorial.css";
import "@/styles/match-lobby.css";

async function RoomLoading({ join = false }: { join?: boolean }) {
  const { t } = await getRequestI18n();
  return (
    <LoadingFrame
      route={join ? "play/join" : "play/create"}
      label={t("Loading selection…")}
      className="mx-auto w-full max-w-[520px] px-4 py-8 sm:py-12"
    >
      <section className="game-panel bg-card p-6 sm:p-8">
        <Skeleton className="mb-6 size-20" />
        <Skeleton className="mb-2 h-4 w-56 max-w-full" />
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="mt-3 h-6 w-full" />
        {join ? (
          <div className="my-6 space-y-5">
            <div className="space-y-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-20 w-full" />
            </div>
            <LoadingAction className="w-full" />
          </div>
        ) : (
          <Skeleton className="my-6 h-11 w-full" />
        )}
        <LoadingAction className="w-full" />
      </section>
    </LoadingFrame>
  );
}
export function CreateRoomLoading() {
  return <RoomLoading />;
}
export function JoinRoomLoading() {
  return <RoomLoading join />;
}

async function MatchmakingLoading({ ranked = false }: { ranked?: boolean }) {
  const { t } = await getRequestI18n();
  return (
    <LoadingFrame
      route={ranked ? "play/ranked" : "play/online"}
      label={t("Loading selection…")}
      className="match-lobby mx-auto w-full max-w-[800px] px-4 py-6 sm:py-10"
    >
      <section className="lobby-arena">
        <header className="lobby-heading">
          <Skeleton className="mx-auto h-4 w-48" />
          <h1>{t(ranked ? "Ranked match" : "Casual match")}</h1>
        </header>
        <div className="lobby-duel">
          {[0, 1].map((index) => (
            <div
              key={index}
              className={index ? "lobby-player lobby-opponent col-start-3" : "lobby-player"}
            >
              <Skeleton className="h-4 w-full" />
              <div className="lobby-portrait">
                <Skeleton className="size-full rounded-full" />
              </div>
              <Skeleton className="mx-auto h-7 w-3/4" />
              <Skeleton className="mx-auto mt-1.5 h-4 w-2/3" />
            </div>
          ))}
        </div>
        <Skeleton className="mx-auto h-6 w-64 max-w-full" />
        <Skeleton className={`mx-auto mt-2 w-full ${ranked ? "h-16" : "h-5"}`} />
        <div className="lobby-actions">
          <LoadingAction className="w-44" />
        </div>
      </section>
    </LoadingFrame>
  );
}
export function OnlineLoading() {
  return <MatchmakingLoading />;
}
export function RankedLoading() {
  return <MatchmakingLoading ranked />;
}

export async function GameLoading() {
  const path = new URL((await headers()).get("x-2048-route") ?? "/", "http://loading.local")
    .pathname;
  const roomId = /^\/play\/([^/]+)\/?$/.exec(path)?.[1];
  if (!C2S.joinRoom.safeParse({ t: "joinRoom", roomId }).success) return null;
  const { t } = await getRequestI18n();
  return (
    <LoadingFrame
      route="play/game"
      label={t("Joining your game…")}
      className="mx-auto max-w-lg px-4 py-12 sm:py-20"
    >
      <section className="game-panel bg-card p-8 text-center shadow-sm sm:p-10">
        <Skeleton className="mx-auto mb-6 size-20" />
        <Skeleton className="mx-auto mb-2 h-4 w-28" />
        <Skeleton className="mx-auto h-9 w-full" />
        <Skeleton className="mt-4 h-12 w-full sm:h-6" />
        <div className="mx-auto mt-6 grid max-w-48 grid-cols-4 gap-2">
          {Array.from({ length: 16 }, (_, index) => (
            <Skeleton key={index} className="aspect-square" />
          ))}
        </div>
        <LoadingAction className="mx-auto mt-8 w-36" />
      </section>
    </LoadingFrame>
  );
}

export async function TutorialLoading() {
  const { t } = await getRequestI18n();
  return (
    <LoadingFrame
      route="tutorial"
      label={t("Loading selection…")}
      className="match-screen tutorial-screen"
    >
      <header className="match-toolbar">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10" />
          <div>
            <Skeleton className="h-4 w-24" />
            <h1 className="text-lg font-extrabold tracking-tight">{t("Interactive tutorial")}</h1>
          </div>
        </div>
        <div className="flex gap-2">
          <LoadingAction className="w-24" />
          <LoadingAction className="w-28" />
        </div>
      </header>
      <div className="tutorial-session" data-focus="board">
        <div className="game-stage">
          <section className="tutorial-coach">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-7 w-full" />
            <Skeleton className="mt-3 h-20 w-full" />
            <LoadingAction className="mt-4 w-full" />
          </section>
          <div className="game-stage-grid">
            <section className="game-player game-you">
              <div className="game-player-heading">
                <Skeleton className="h-7 w-full" />
              </div>
              <LoadingBoard />
              <Skeleton className="mt-2 h-[60px] w-full" />
            </section>
            <section className="game-player game-opponent">
              <div className="game-player-heading">
                <Skeleton className="h-7 w-full" />
              </div>
              <LoadingBoard className="opponent-board" />
              <Skeleton className="opponent-ability mt-2 h-[60px] w-full" />
            </section>
          </div>
        </div>
        <div className="match-controls">
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    </LoadingFrame>
  );
}

export async function WatchLoading() {
  const { t } = await getRequestI18n();
  return (
    <LoadingFrame route="watch" label={t("Connecting to the match…")} className="match-screen">
      <div className="match-toolbar">
        <h1 className="text-2xl font-extrabold">{t("Spectating")}</h1>
        <div className="flex gap-2">
          <LoadingAction className="w-24" />
          <LoadingAction className="w-24" />
        </div>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <Skeleton className="aspect-square w-full max-w-[500px] rounded-2xl" />
        <Skeleton className="aspect-square w-full max-w-[500px] rounded-2xl" />
      </div>
    </LoadingFrame>
  );
}
