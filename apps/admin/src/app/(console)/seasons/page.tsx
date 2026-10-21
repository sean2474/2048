import type { RankSeason } from "schema/ranking";
import { getI18n } from "@/lib/i18n/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { RefreshButton } from "@/components/refresh-button";
import { SeasonTransition } from "@/components/season-transition";
export default async function SeasonsPage() {
  const [{ t, locale }, client] = await Promise.all([getI18n(), getAdminClient()]);
  if (!client) return null;
  let seasons: (RankSeason & { created_by: string | null; transition_reason: string | null })[] =
      [],
    error = "";
  try {
    const result = await client.rpc("admin_rank_seasons");
    if (result.error) throw result.error;
    seasons = result.data;
  } catch {
    error = "Seasons could not be loaded. Check your connection and try again.";
  }
  const current = seasons.find((season) => season.ends_at === null);
  return (
    <section className="space-y-6" aria-labelledby="seasons-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="admin-eyebrow mb-2">{t("Ranked competition")}</p>
          <h1 id="seasons-title" className="admin-title">
            {t("Ranked seasons")}
          </h1>
        </div>
        <RefreshButton />
      </div>
      {error ? (
        <p role="alert" className="admin-error">
          {t(error)}
        </p>
      ) : (
        <>
          <div className="admin-panel p-6 space-y-3">
            <h2 className="admin-section-title">
              {t("Current season")}: {current?.name ?? t("Unavailable")}
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              {t(
                "The first 10 ranked matches establish a player’s tier. Tiers then follow Elo automatically, without promotion series. Elo and established tiers carry over between seasons.",
              )}
            </p>
          </div>
          {current && <SeasonTransition current={current} />}
          <section className="space-y-3">
            <h2 className="admin-section-title">{t("Season history")}</h2>
            <ol className="admin-panel divide-y">
              {seasons.map((season) => (
                <li
                  key={season.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-5"
                >
                  <div className="min-w-0">
                    <strong className="break-words">{season.name}</strong>
                    {season.transition_reason && (
                      <p className="mt-2 break-words text-sm text-muted-foreground">
                        {season.transition_reason}
                      </p>
                    )}
                    {season.created_by && (
                      <p className="mt-1 break-all text-xs text-muted-foreground">
                        {t("Administrator: {id}", { id: season.created_by })}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {season.ends_at
                      ? t("Ended {date}", {
                          date: new Date(season.ends_at).toLocaleString(locale, {
                            timeZone: "Asia/Seoul",
                          }),
                        })
                      : t("Current season")}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </section>
  );
}
