"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "ui/i18n";
import type { RankSeason } from "schema/ranking";

export function SeasonSelect({ seasons, selected }: { seasons: RankSeason[]; selected: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm">
      {t("Season")}
      <select
        aria-label={t("Season")}
        aria-busy={pending}
        disabled={pending}
        value={selected}
        onChange={(event) => {
          const season = event.target.value;
          startTransition(() =>
            router.replace(`/leaderboard?season=${encodeURIComponent(season)}`, { scroll: false }),
          );
        }}
        className="min-h-11 rounded-lg border bg-card px-3"
      >
        <option value="current">{t("Current season")}</option>
        {seasons
          .filter((row) => row.ends_at !== null)
          .map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
      </select>
    </label>
  );
}
