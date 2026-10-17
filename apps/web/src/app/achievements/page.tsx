"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarCheck, Check, LockKeyhole } from "lucide-react";
import { useCatalog } from "@/hooks/catalog-provider";
import { achievementProgress, formatAchievementTime } from "schema/achievements";
import { TIERS } from "schema/ranking";
import { SKIN_RARITIES } from "schema/loadout";
import { useI18n } from "ui/i18n";
import { Button } from "@/components/ui/button";
import { PageHeading } from "@/components/widget/page-heading";
import { ProfileIcon } from "@/components/widget/profile-icon";
import { SkinPreview } from "@/components/2048/skin-preview";
import { usePlayer } from "@/hooks/use-player";
import { useAchievements } from "@/hooks/use-achievements";
import { trackGameEvent } from "@/lib/analytics";

export default function AchievementsPage() {
  const { t } = useI18n();
  const { skins, profileIcons, achievements } = useCatalog();
  const { user } = usePlayer();
  const { data, loading, error, checkingIn, checkInError, reload, checkIn } = useAchievements(user);
  const [notice, setNotice] = useState<{ userId: string; names: string[] } | null>(null);
  const guest = user === null || user?.is_anonymous;
  const attendance = data?.attendance;
  const attendanceReward = achievements.find(item => item.status === "published" && item.metric === "attendance_streak" && item.reward.kind === "icon");
  const attendanceIconId = attendanceReward?.reward.kind === "icon" ? attendanceReward.reward.iconId : undefined;
  const attendanceIcon = profileIcons.find(icon => icon.id === attendanceIconId);
  async function attend() {
    const unlocked = await checkIn();
    if (unlocked) trackGameEvent("attendance_checked_in", { unlocked: unlocked.length });
    if (unlocked?.length && user) setNotice({ userId: user.id, names: unlocked.map(item => achievements.find(reward => reward.id === item.achievementId)?.name ?? item.achievementId) });
  }

  return <main className="mx-auto max-w-[1040px] space-y-6 px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
    <PageHeading icon="crown" eyebrow={t("Collection journal")} title={t("Achievements")} description={t("Build your record. Earn something only you can wear.")}><Button asChild variant="outline"><Link href="/loadout" data-analytics-link="/loadout">{t("My loadout")}</Link></Button></PageHeading>

    <section aria-labelledby="attendance-title" className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b px-5 py-4 sm:px-6">
        <div><h2 id="attendance-title" className="flex items-center gap-2 font-bold"><CalendarCheck aria-hidden="true" className="size-5 text-primary" />{t("Daily attendance")}</h2><p className="mt-1 text-xs text-muted-foreground">{t("One check-in a day · Resets at midnight KST")}</p></div>
        {guest ? <Button asChild><Link href="/login" data-analytics-link="/login">{t("Log in")}</Link></Button> : <Button disabled={!data || loading || error || checkingIn || attendance?.checkedInToday} onClick={() => void attend()}>{attendance?.checkedInToday && <Check aria-hidden="true" className="size-4" />}{t(checkingIn ? "Checking in…" : attendance?.checkedInToday ? "Checked in today" : "Check in today")}</Button>}
      </div>
      <div className="grid gap-5 px-5 py-5 sm:grid-cols-[1fr_auto] sm:items-center sm:px-6">
        <div>{guest ? <p className="text-sm text-muted-foreground">{t("Sign in to record attendance and achievements.")}</p> : !data && loading ? <p role="status" className="text-sm text-muted-foreground">{t("Loading achievements…")}</p> : attendance ? <>
          <p className="flex items-baseline gap-2"><span className="text-4xl font-extrabold tabular-nums tracking-tight">{attendance.streak}</span><span className="text-sm text-muted-foreground">{t("consecutive days")}</span></p>
          <p className="mt-2 text-xs text-muted-foreground">{t("Best streak: {days} days", { days: attendance.bestStreak })}</p>
        </> : null}<p className="mt-3 max-w-md text-xs leading-5 text-muted-foreground">{t("Missing a day resets your streak. Unlocked rewards are yours to keep.")}</p></div>
        {attendanceReward && attendanceIcon && <div className="flex items-center gap-3 rounded-xl bg-secondary/40 px-4 py-3"><ProfileIcon iconId={attendanceIcon.id} className="size-16" /><div><p className="text-[11px] font-semibold text-primary">{t("{days}-day reward", { days: attendanceReward.target })}</p><p className="mt-1 font-bold">{t(attendanceIcon.name)}</p><p className="mt-1 text-xs text-muted-foreground">{t("Exclusive profile")}</p></div></div>}
      </div>
    </section>
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm"><p>{t("Could not load achievement progress.")}</p><Button variant="outline" onClick={() => void reload()}>{t("Reload unlock information")}</Button></div>}
    {checkInError && <p role="alert" className="text-sm text-destructive">{t("Could not save attendance. Please try again.")}</p>}
    {notice?.userId === user?.id && notice && <p role="status" className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm font-semibold">{t("New rewards unlocked: {names}", { names: notice.names.map(name => t(name)).join(", ") })}</p>}

    <section aria-labelledby="rewards-title" className="space-y-4">
      <div><h2 id="rewards-title" className="font-bold">{t("Achievement exclusives")}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("Play casual or ranked against another account. Friend matches and guest play do not count.")}</p></div>
      <ul id="achievement-rewards" className="grid gap-3 sm:grid-cols-2">{achievements.filter(item => item.status === "published" || data?.unlocks.some(unlock => unlock.achievementId === item.id)).map(item => {
        const state = data ? achievementProgress(item, data) : undefined;
        const unlocked = state?.unlocked ?? false;
        const value = state?.current;
        const progress = unlocked ? item.target : Math.min(value ?? 0, item.target);
        const reward = item.reward;
        const rewardSkin = reward.kind !== "icon" ? skins.find(skin => skin.id === reward.skinId) : undefined;
        const rewardIcon = reward.kind !== "skin" ? profileIcons.find(icon => icon.id === reward.iconId) : undefined;
        return <li key={item.id} id={item.id} className={`flex scroll-mt-6 flex-col rounded-xl border bg-card p-5 ${unlocked ? "border-primary/30" : ""}`}>
          <div className="flex items-center gap-4"><div className="relative flex size-20 shrink-0 items-center justify-center">{rewardSkin && <SkinPreview skin={rewardSkin} />}{rewardIcon && <ProfileIcon iconId={rewardIcon.id} className={rewardSkin ? "absolute -bottom-1 -right-2 size-10 rounded-xl bg-card ring-2 ring-card" : "size-20"} />}</div><div className="min-w-0"><p className="text-[11px] text-muted-foreground">{t(reward.kind === "set" ? "Rank board + profile" : rewardSkin ? "Exclusive board" : "Exclusive profile")}</p><h3 className="mt-1 text-lg font-bold">{t(rewardSkin?.name ?? rewardIcon?.name ?? item.name)}</h3>{reward.kind === "set" && rewardSkin && <p className="mt-1 text-xs font-semibold text-primary">{t(SKIN_RARITIES[rewardSkin.rarity].name)}</p>}{t(item.name) !== t(rewardSkin?.name ?? rewardIcon?.name ?? item.name) && <p className="mt-1 text-xs text-muted-foreground">{t(item.name)}</p>}</div></div>
          <p className="mb-4 mt-5 text-sm">{t(item.description)}</p>
          <div className="mt-auto">{data && !error && <><div className="mb-2 flex items-center justify-between gap-2 text-xs"><span className={`flex items-center gap-1.5 ${unlocked ? "font-semibold text-primary" : "text-muted-foreground"}`}>{unlocked ? <Check aria-hidden="true" className="size-3.5" /> : <LockKeyhole aria-hidden="true" className="size-3.5" />}{t(unlocked ? "Permanently unlocked" : "In progress")}</span><span className="tabular-nums text-muted-foreground">{item.metric === "solo_time" ? value ? t("Best time: {time}", { time: formatAchievementTime(value) }) : t("No solo finish yet") : item.metric === "rank_tier" ? t(value ? TIERS[Math.min(value, TIERS.length) - 1] : "Placement") : `${progress} / ${item.target}`}</span></div><progress aria-label={t(item.name)} max={item.metric === "solo_time" ? 100 : item.target} value={item.metric === "solo_time" ? state?.percent ?? 0 : progress} className="block h-1.5 w-full overflow-hidden rounded-full appearance-none [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary" />{item.metric === "solo_time" && <p className="mt-2 text-xs text-muted-foreground">{t("Target time: {time}", { time: formatAchievementTime(item.target) })}</p>}</>}
          <Button asChild variant="ghost" className="mt-3 w-full text-xs"><Link href={guest ? "/login" : "/loadout"}>{t(guest ? "Log in" : unlocked ? "My loadout" : "Preview in loadout")}</Link></Button></div>
        </li>;
      })}</ul>
    </section>

  </main>;
}
