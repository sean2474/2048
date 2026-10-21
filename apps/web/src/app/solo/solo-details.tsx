import "server-only";
import Link from "next/link";
import { ArrowRight, Check, Trophy } from "lucide-react";
import { SKIN_RARITIES } from "schema/loadout";
import { formatSoloTime, type SoloMode } from "schema/solo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SkinPreview } from "@/components/2048/skin-preview";
import { RefreshButton } from "@/components/widget/refresh-records";
import { CatalogIcon } from "@/components/catalog/catalog-icon";
import { getI18n } from "@/lib/i18n/server";
import { getAchievementSnapshot } from "@/lib/server/achievements";
import { getCatalogSnapshot } from "@/lib/server/collection";

export async function SoloDetails({ mode }: { mode: SoloMode }) {
  const [{ t, locale }, progress, catalog] = await Promise.all([
    getI18n(),
    getAchievementSnapshot(),
    getCatalogSnapshot(),
  ]);
  const endless = mode === "endless";
  const best = progress.data?.soloBestMs;
  const name = (item: { name: string; nameKo?: string }) =>
    locale === "ko" ? (item.nameKo ?? item.name) : item.name;
  return (
    <>
      <section className="space-y-4 rounded-xl border bg-card p-5">
        <p className="text-xs font-semibold text-muted-foreground">
          {t(endless ? "Best milestone" : "Personal best")}
        </p>
        <p className="text-3xl font-extrabold tabular-nums">
          {endless ? progress.data?.soloHighestTile || "—" : best ? formatSoloTime(best) : "—"}
        </p>
        {progress.error && (
          <div role="alert" className="space-y-2">
            <p className="text-xs text-destructive">{t("Could not load achievement progress.")}</p>
            <RefreshButton />
          </div>
        )}
        <p className="break-keep text-sm leading-6 text-muted-foreground">
          {t(
            endless
              ? "4×4 board · No time limit, abilities or undo. Continue beyond 2048. Milestone rewards save as soon as you reach them."
              : "4×4 board · Reach 2048 · No abilities or undo. The clock starts when you press Start and keeps running until you finish, for up to one hour.",
          )}
        </p>
        <p className="text-xs leading-5 text-muted-foreground">
          {t("Swipe your board or use the arrow keys to move.")}
        </p>
        {!progress.userId && (
          <Button asChild variant="outline" className="w-full">
            <Link href="/login">{t("Sign in for records & rewards")}</Link>
          </Button>
        )}
      </section>
      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-4 flex items-center gap-2 font-bold">
          <Trophy aria-hidden="true" className="size-4 text-primary" />
          {t("Achievements")}
        </h2>
        {catalog.error && (
          <div role="alert" className="space-y-2">
            <p className="text-xs text-destructive">
              {t("Could not load the collection. Your purchases are safe.")}
            </p>
            <RefreshButton />
          </div>
        )}
        <ul className="space-y-4">
          {catalog.data?.achievements
            .filter(
              (item) =>
                item.metric === (endless ? "solo_tile" : "solo_time") &&
                (item.status === "published" ||
                  progress.data?.unlocks.some((unlock) => unlock.achievementId === item.id)),
            )
            .map((item) => {
              const skin = catalog.data?.skins.find(
                (skin) => item.reward.kind !== "icon" && skin.id === item.reward.skinId,
              );
              const icon = catalog.data?.profileIcons.find(
                (icon) => item.reward.kind !== "skin" && icon.id === item.reward.iconId,
              );
              const unlocked = progress.data?.unlocks.some(
                (unlock) => unlock.achievementId === item.id,
              );
              return (
                <li key={item.id} className="flex items-center gap-4">
                  <div className="w-[72px] shrink-0 sm:w-20">
                    {skin && <SkinPreview skin={skin} />}
                    {icon && <CatalogIcon icon={icon} className="size-16" />}
                  </div>
                  <div className="min-w-0">
                    <p className="flex items-center gap-1 text-sm font-bold">
                      {unlocked && (
                        <Check
                          aria-label={t("Permanently unlocked")}
                          className="size-4 shrink-0 text-primary"
                        />
                      )}
                      {t(name(skin ?? icon ?? item))}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {item.metric === "solo_tile"
                        ? t("Reach {tile}", { tile: item.target })
                        : t("Target time: {time}", { time: formatSoloTime(item.target) })}
                    </p>
                    {skin && (
                      <p className="mt-0.5 text-[11px] font-semibold text-primary">
                        {t(SKIN_RARITIES[skin.rarity].name)}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
        </ul>
        <Button asChild variant="ghost" className="mt-4 w-full">
          <Link href="/achievements">
            {t("Achievements")}
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </section>
    </>
  );
}

export function SoloDetailsSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-5">
      <div className="space-y-4 rounded-xl border bg-card p-5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-24 w-full" />
      </div>
      <div className="space-y-4 rounded-xl border bg-card p-5">
        <Skeleton className="h-6 w-32" />
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex items-center gap-4">
            <Skeleton className="size-16 shrink-0" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
