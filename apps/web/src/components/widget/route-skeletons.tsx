import "server-only";
import { getLoadingAccountHint } from "@/lib/server/loading-context";
import { SettingsAccountSkeleton } from "./settings-account-skeleton";
import { Globe, Keyboard } from "lucide-react";
import { GuestProfile } from "./guest-profile";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeading } from "@/components/widget/page-heading";
import { CollectionPageSkeleton } from "@/components/widget/collection-page-skeleton";
import { AchievementSkeleton } from "@/components/achievements/achievement-skeleton";
import {
  FriendDirectorySkeleton,
  ProfileSkeleton,
  StandingsSkeleton,
} from "@/components/widget/records-skeleton";
import { getRequestI18n } from "@/lib/i18n/server";
import "@/styles/solo.css";
import "@/styles/leaderboard.css";

const widePage = "mx-auto max-w-[1040px] space-y-6 px-4 py-6 sm:px-6 sm:py-10 lg:px-8";
const narrowPage = "mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6 sm:py-10";
const panel = "game-panel bg-card p-5 sm:p-6";

export function LoadingFrame({
  route,
  label,
  className,
  children,
}: {
  route: string;
  label: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <main
      data-route-loading={route}
      role="status"
      aria-label={label}
      aria-busy="true"
      className={className}
    >
      <span className="sr-only">{label}</span>
      {children}
    </main>
  );
}

export function LoadingAction({ className = "w-32" }: { className?: string }) {
  return <Skeleton className={`h-11 max-w-full ${className}`} />;
}

export function LoadingBoard({ className = "", size = 5 }: { className?: string; size?: 4 | 5 }) {
  return (
    <div
      aria-hidden="true"
      className={`grid aspect-square ${size === 4 ? "grid-cols-4" : "grid-cols-5"} gap-2 rounded-2xl border bg-card p-3 ${className}`}
    >
      {Array.from({ length: size * size }, (_, index) => (
        <Skeleton key={index} className="aspect-square" />
      ))}
    </div>
  );
}

function PreviewSkeleton() {
  return (
    <>
      <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
      <Skeleton className="ml-auto mt-2 h-11 w-20" />
    </>
  );
}

export async function SettingsLoading() {
  const [{ t }, member] = await Promise.all([getRequestI18n(), getLoadingAccountHint()]);
  return (
    <LoadingFrame route="settings" label={t("Loading settings…")} className={narrowPage}>
      <PageHeading icon="settings" title={t("Settings")}>
        <LoadingAction />
      </PageHeading>
      <section
        data-loading-panel="audio"
        className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-7 w-36" />
          <LoadingAction className="w-28" />
        </div>
        <Skeleton className="mt-2 h-12 w-full sm:h-6" />
        <div className="mt-5 flex justify-between">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-5 w-9" />
        </div>
        <div className="flex h-[50px] items-center">
          <Skeleton className="h-2 w-full" />
        </div>
        <LoadingAction className="w-28" />
      </section>
      <section data-loading-panel="preferences" className={panel}>
        <Skeleton className="h-7 w-44" />
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {t(
            member
              ? "These preferences are saved to your account."
              : "Guest preferences are saved in this browser.",
          )}
        </p>
        <div className="mt-5 divide-y">
          <div className="space-y-4 pb-5">
            <div className="flex items-center gap-3">
              <Globe aria-hidden="true" className="size-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-semibold">{t("Language")}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {t("Your first language is based on your location. You can change it anytime.")}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          </div>
          <div className="space-y-4 py-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">{t("Custom keyboard shortcuts")}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {t(
                    "Use your chosen letter and number keys. Arrow keys and touch controls always work.",
                  )}
                </p>
              </div>
              <Skeleton className="h-11 w-16 shrink-0" />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/50 p-3">
              <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Keyboard aria-hidden="true" className="size-4" />
                {t("Movement and attack keys")}
              </span>
              <LoadingAction className="w-36" />
            </div>
          </div>
        </div>
      </section>
      {member ? (
        <SettingsAccountSkeleton t={t} />
      ) : (
        <section data-loading-panel="guest-account" className={panel}>
          <Skeleton className="h-9 w-40" />
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t("Sign in to edit your nickname and save preferences across devices.")}
          </p>
          <LoadingAction className="mt-4" />
        </section>
      )}
      <section className={panel}>
        <Skeleton className="h-7 w-44" />
        <div className="mt-3 divide-y">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="flex h-[61px] items-center gap-3">
              <Skeleton className="size-9" />
              <Skeleton className="h-5 w-52 max-w-[75%]" />
            </div>
          ))}
        </div>
      </section>
      <div className="flex gap-5">
        <Skeleton className="h-11 w-28" />
        <Skeleton className="h-11 w-24" />
      </div>
    </LoadingFrame>
  );
}

export async function FindMatchLoading() {
  const { t } = await getRequestI18n();
  return (
    <LoadingFrame
      route="find-match"
      label={t("Loading selection…")}
      className="match-selection mx-auto max-w-[960px] px-4 py-4 sm:px-6 sm:py-10 lg:px-8"
    >
      <PageHeading icon="duel" title={t("Find match")} eyebrow={t("1 vs 1")} />
      <div className="mt-4 grid items-center gap-4 sm:mt-6 sm:gap-6 md:grid-cols-[minmax(0,1fr)_280px] md:gap-8 lg:gap-10">
        <section
          data-loading-panel="preview"
          className="mx-auto hidden w-full max-w-[440px] min-w-0 md:block"
        >
          <PreviewSkeleton />
        </section>
        <section
          data-loading-panel="menu"
          className="mx-auto w-full max-w-[440px] game-panel bg-card p-4 sm:p-6"
        >
          <Skeleton className="mb-5 hidden h-7 w-40 sm:block" />
          <div className="space-y-2 sm:space-y-3">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-14 w-full rounded-xl sm:h-16" />
            ))}
          </div>
          <div className="mt-4 space-y-2 sm:mt-5 sm:space-y-3">
            <Skeleton className="h-[105px] w-full rounded-xl" />
            <div className="border-t pt-4">
              <Skeleton className="h-11 w-full" />
            </div>
          </div>
          <Skeleton className="mt-2 h-11 w-full sm:mt-3" />
        </section>
      </div>
    </LoadingFrame>
  );
}

export async function FeedbackLoading() {
  const { t } = await getRequestI18n();
  return (
    <LoadingFrame route="feedback" label={t("Loading selection…")} className={narrowPage}>
      <PageHeading
        icon="feedback"
        title={t("Bugs & feedback")}
        description={t("Tell us what went wrong or what could be better.")}
      >
        <LoadingAction className="w-28" />
      </PageHeading>
      <section
        data-loading-panel="form"
        className="space-y-6 game-panel bg-card p-5 shadow-sm sm:p-8"
      >
        <div className="space-y-3">
          <Skeleton className="h-5 w-24" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-11 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-10 w-full sm:h-5" />
          <Skeleton className="h-[194px] w-full rounded-xl" />
          <Skeleton className="ml-auto h-4 w-20" />
        </div>
        <div className="flex flex-col gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <Skeleton className="h-[60px] w-full sm:h-10 sm:max-w-sm" />
          <LoadingAction className="w-full sm:w-36" />
        </div>
      </section>
    </LoadingFrame>
  );
}

export async function HomeLoading() {
  const [{ t }, member] = await Promise.all([getRequestI18n(), getLoadingAccountHint()]);
  return (
    <LoadingFrame route="home" label={t("Loading ranked record…")} className={widePage}>
      <PageHeading icon="profile" title={t("Dashboard")}>
        <LoadingAction />
        <LoadingAction />
      </PageHeading>
      <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
        {member ? <ProfileSkeleton label={t("Loading ranked record…")} /> : <GuestProfile t={t} />}
        <section className="mx-auto w-full max-w-[380px] min-w-0">
          <PreviewSkeleton />
        </section>
      </div>
    </LoadingFrame>
  );
}

export async function FriendsLoading() {
  const { t } = await getRequestI18n();
  return (
    <LoadingFrame
      route="friends"
      label={t("Loading friends…")}
      className="mx-auto max-w-[1120px] space-y-6 px-4 py-8 sm:px-6"
    >
      <div>
        <Skeleton className="h-9 w-72 max-w-full" />
        <Skeleton className="mt-2 h-6 w-[420px] max-w-full" />
      </div>
      <FriendDirectorySkeleton label={t("Loading friends…")} />
    </LoadingFrame>
  );
}

export async function AchievementsLoading() {
  const { t } = await getRequestI18n();
  return (
    <LoadingFrame route="achievements" label={t("Loading achievements…")} className={widePage}>
      <PageHeading icon="crown" eyebrow={t("Collection journal")} title={t("Achievements")}>
        <LoadingAction />
      </PageHeading>
      <AchievementSkeleton label={t("Loading achievements…")} />
    </LoadingFrame>
  );
}

async function CollectionLoading({ shop = false }: { shop?: boolean }) {
  const [{ t }, member] = await Promise.all([getRequestI18n(), getLoadingAccountHint()]);
  return (
    <LoadingFrame
      route={shop ? "shop" : "loadout"}
      label={t("Loading collection…")}
      className={
        shop
          ? "mx-auto max-w-[1040px] space-y-5 px-4 py-6 sm:px-6 sm:py-10 lg:px-8"
          : "mx-auto max-w-[1040px] space-y-4 px-4 py-6 sm:px-6 sm:py-8 lg:px-8"
      }
    >
      <PageHeading icon={shop ? "coin" : "loadout"} title={t(shop ? "Coin shop" : "My loadout")}>
        <LoadingAction />
      </PageHeading>
      <CollectionPageSkeleton shop={shop} history={member} label={t("Loading collection…")} />
    </LoadingFrame>
  );
}

export function LoadoutLoading() {
  return <CollectionLoading />;
}
export function ShopLoading() {
  return <CollectionLoading shop />;
}

export async function SoloLoading() {
  const { t } = await getRequestI18n();
  return (
    <LoadingFrame
      route="solo"
      label={t("Loading records…")}
      className="solo-page mx-auto max-w-[1040px] space-y-3 px-4 py-3 md:space-y-6 md:px-6 md:py-10 lg:px-8"
    >
      <PageHeading icon="crown" title={t("Single player")}>
        <LoadingAction className="w-11 sm:w-36" />
      </PageHeading>
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <Skeleton className="h-11 w-full sm:h-20" />
        <Skeleton className="h-11 w-full sm:h-20" />
      </div>
      <div className="grid items-start gap-3 md:grid-cols-[minmax(0,1fr)_300px] md:gap-8">
        <section>
          <Skeleton className="mb-3 h-[65px] w-full sm:mb-5 sm:h-[89px]" />
          <LoadingBoard size={4} className="mx-auto max-w-[500px]" />
          <p className="mt-3 text-center text-xs text-muted-foreground" aria-hidden="true">
            {t("Swipe your board or use the arrow keys to move.")}
          </p>
          <LoadingAction className="mt-3 w-44 sm:mt-6" />
        </section>
        <aside className="hidden space-y-5 md:block">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </aside>
      </div>
    </LoadingFrame>
  );
}

export async function RulebookLoading() {
  const { t } = await getRequestI18n();
  return (
    <LoadingFrame
      route="how-to-play"
      label={t("Loading selection…")}
      className="mx-auto max-w-[960px] space-y-6 px-4 py-8 sm:px-6 sm:py-12 lg:px-8"
    >
      <PageHeading icon="guide" title={t("How to play")} eyebrow={t("The rulebook")}>
        <LoadingAction />
        <LoadingAction />
      </PageHeading>
      <div className="game-panel divide-y overflow-hidden bg-card">
        {[0, 1, 2].map((index) => (
          <section key={index} className="grid gap-4 p-6 sm:grid-cols-[56px_1fr] sm:gap-6 sm:p-8">
            <Skeleton className="size-14" />
            <div className="space-y-4">
              <Skeleton className="h-7 w-40" />
              <Skeleton className="h-16 w-56 max-w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          </section>
        ))}
      </div>
    </LoadingFrame>
  );
}

export async function LeaderboardLoading({ solo = false }: { solo?: boolean } = {}) {
  const { t } = await getRequestI18n();
  return (
    <LoadingFrame
      route="leaderboard"
      label={t(solo ? "Loading rankings…" : "Loading leaderboard…")}
      className="mx-auto max-w-[1120px] space-y-7 px-4 py-6 sm:px-6 sm:py-10 lg:px-8"
    >
      <section className="rank-arena relative isolate overflow-hidden rounded-xl px-6 py-7 sm:px-9 sm:py-8">
        <div className="relative z-10 max-w-2xl">
          <Skeleton className="mb-3 h-4 w-48" />
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            {t(solo ? "Time rankings" : "Ranked leaderboard")}
          </h1>
          <LoadingAction className="mt-5 w-40" />
        </div>
      </section>
      <div className="flex flex-wrap gap-2">
        <LoadingAction className="w-36" />
        <LoadingAction className="w-40" />
      </div>
      {!solo && (
        <section className="rounded-xl border bg-card px-3 py-4 sm:px-6">
          <Skeleton className="mb-2 h-4 w-32" />
          <div className="grid grid-cols-3 gap-y-3 sm:grid-cols-6">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <div key={index} className="space-y-1 text-center">
                <Skeleton className="mx-auto size-16" />
                <Skeleton className="mx-auto h-5 w-16" />
                <Skeleton className="mx-auto h-4 w-12" />
              </div>
            ))}
          </div>
        </section>
      )}
      <StandingsSkeleton
        solo={solo}
        label={t(solo ? "Loading rankings…" : "Loading leaderboard…")}
      />
    </LoadingFrame>
  );
}
