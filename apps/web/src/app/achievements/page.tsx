"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarCheck, Check, LockKeyhole, ArrowRight } from "lucide-react";
import { achievementProgress } from "schema/achievements";
import { formatSoloTime } from "schema/solo";
import { TIERS } from "schema/ranking";
import { SKIN_RARITIES } from "schema/loadout";
import { useCatalog } from "@/hooks/catalog-provider";
import { useI18n } from "ui/i18n";
import { Button } from "@/components/ui/button";
import { PageHeading } from "@/components/widget/page-heading";
import { ProfileIcon } from "@/components/widget/profile-icon";
import { SkinPreview } from "@/components/2048/skin-preview";
import { usePlayer } from "@/hooks/use-player";
import { useAchievements } from "@/hooks/use-achievements";

export default function AchievementsPage() {
  const { t } = useI18n();
  const { user } = usePlayer();
  const { skins, profileIcons, achievements } = useCatalog();
  const { data, loading, error, checkingIn, checkInError, reload, newRewards } = useAchievements();
  const guest = user === null || user?.is_anonymous;
  const attendance = data?.attendance;
  const attendanceReward = achievements.find(item => item.status === "published" && item.metric === "attendance_streak" && item.reward.kind === "icon");
  const attendanceIconId = attendanceReward?.reward.kind === "icon" ? attendanceReward.reward.iconId : undefined;
  const attendanceIcon = profileIcons.find(icon => icon.id === attendanceIconId);
  const [filter, setFilter] = useState<"all" | "progress" | "completed">("all");
  const progressData = !error ? data : undefined;
  const entries = useMemo(() => achievements.filter(item => item.status === "published" || data?.unlocks.some(unlock => unlock.achievementId === item.id)).map(item => ({ item, progress: progressData ? achievementProgress(item, progressData) : undefined }))
    .sort((a, b) => Number(a.progress?.unlocked ?? false) - Number(b.progress?.unlocked ?? false)
      || (a.progress?.unlocked ? 0 : (b.progress?.percent ?? 0) - (a.progress?.percent ?? 0))), [achievements, data, progressData]);
  const unlockedCount = entries.filter(entry => entry.progress?.unlocked).length;
  const next = entries.find(entry => !entry.progress?.unlocked);
  const nextReward = next?.item.reward;
  const nextSkin = nextReward && "skinId" in nextReward ? skins.find(skin => skin.id === nextReward.skinId) : undefined;
  const activeFilter = progressData ? filter : "all";
  const visible = entries.filter(entry => activeFilter === "all" || (activeFilter === "completed" ? entry.progress?.unlocked : !entry.progress?.unlocked));

  return <main className="mx-auto max-w-[1040px] space-y-6 px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
    <PageHeading icon="crown" eyebrow={t("Collection journal")} title={t("Achievements")}><Button asChild variant="outline"><Link href="/loadout" data-analytics-link="/loadout">{t("My loadout")}</Link></Button></PageHeading>

    <section aria-label={t("Your achievement progress")} className="grid gap-5 rounded-2xl border bg-card p-5 sm:grid-cols-2 sm:p-6">
      <div><p className="text-xs font-semibold text-muted-foreground">{t("Unlocked achievements")}</p><p className="mt-2 text-3xl font-extrabold tabular-nums">{progressData ? unlockedCount : "—"}<span className="ml-2 text-base font-medium text-muted-foreground">/ {entries.length}</span></p>{progressData && <progress aria-label={t("Unlocked achievements")} value={unlockedCount} max={entries.length} className="mt-3 block h-2 w-full overflow-hidden rounded-full appearance-none [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary" />}</div>
      <div className="flex items-center gap-4 rounded-xl bg-secondary/30 p-4"><div className="size-14 shrink-0">{nextSkin ? <SkinPreview skin={nextSkin} /> : <ProfileIcon iconId={nextReward?.kind === "icon" ? nextReward.iconId : "achievement-king"} className="size-14" />}</div><div className="min-w-0"><p className="text-xs font-semibold text-muted-foreground">{t("Next milestone")}</p><p className="mt-1 font-bold">{t(progressData && !next ? "All achievements unlocked!" : next?.item.name ?? "Achievement king")}</p>{next && <><p className="mt-1 text-xs leading-5 text-muted-foreground">{t(next.item.description)}</p><a href={`#${next.item.id}`} onClick={() => setFilter("all")} className="mt-1 inline-flex min-h-11 items-center gap-1 rounded-md text-xs font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2">{t("View next milestone")}<ArrowRight aria-hidden="true" className="size-3.5" /></a></>}</div></div>
    </section>

    <section aria-labelledby="attendance-title" className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b px-5 py-4 sm:px-6">
        <div><h2 id="attendance-title" className="flex items-center gap-2 font-bold"><CalendarCheck aria-hidden="true" className="size-5 text-primary" />{t("Daily attendance")}</h2><p className="mt-1 text-xs text-muted-foreground">{t("Attendance is automatic when you visit · Resets at midnight KST")}</p></div>
        {guest ? <Button asChild><Link href="/login" data-analytics-link="/login">{t("Log in")}</Link></Button> : <span role="status" className="inline-flex items-center gap-2 text-sm font-semibold text-primary">{attendance?.checkedInToday && <Check aria-hidden="true" className="size-4" />}{t(checkingIn ? "Checking in…" : attendance?.checkedInToday ? "Checked in today" : "Automatic attendance")}</span>}
      </div>
      <div className="grid gap-5 px-5 py-5 sm:grid-cols-[1fr_auto] sm:items-center sm:px-6">
        <div>{guest ? <p className="text-sm text-muted-foreground">{t("Sign in to record attendance and achievements.")}</p> : !data && loading ? <div role="status" aria-label={t("Loading achievements…")} className="space-y-3"><Skeleton className="h-10 w-28" /><Skeleton className="h-4 w-40" /></div> : attendance ? <>
          <p className="flex items-baseline gap-2"><span className="text-4xl font-extrabold tabular-nums tracking-tight">{attendance.streak}</span><span className="text-sm text-muted-foreground">{t("consecutive days")}</span></p>
          <p className="mt-2 text-xs text-muted-foreground">{t("Best streak: {days} days", { days: attendance.bestStreak })}</p>
        </> : null}<p className="mt-3 max-w-md text-xs leading-5 text-muted-foreground">{t("Missing a day resets your streak. Unlocked rewards are yours to keep.")}</p></div>
        {attendanceReward && attendanceIcon && <div className="flex items-center gap-3 rounded-xl bg-secondary/40 px-4 py-3"><ProfileIcon iconId={attendanceIcon.id} className="size-16" /><div><p className="text-[11px] font-semibold text-primary">{t("{days}-day reward", { days: attendanceReward.target })}</p><p className="mt-1 font-bold">{t(attendanceIcon.name)}</p><p className="mt-1 text-xs text-muted-foreground">{t("Exclusive profile")}</p></div></div>}
      </div>
    </section>
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm"><p>{t("Could not load achievement progress.")}</p><Button variant="outline" onClick={() => void reload()}>{t("Reload unlock information")}</Button></div>}
    {checkInError && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive"><p>{t("Could not save attendance. Please try again.")}</p><Button variant="outline" onClick={() => void reload()}>{t("Retry attendance")}</Button></div>}
    {newRewards.length > 0 && <p role="status" className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm font-semibold">{t("New rewards unlocked: {names}", { names: newRewards.map(id => t(achievements.find(item => item.id === id)?.name ?? id)).join(", ") })}</p>}

    <section aria-labelledby="rewards-title" className="space-y-4">
      <div><h2 id="rewards-title" className="font-bold">{t("Achievement exclusives")}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("Solo rewards use your time attack and endless records. Match rewards require casual or ranked against another account.")}</p></div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("Achievement filter")}>{([
        { id: "all", label: "All achievements", count: entries.length },
        { id: "progress", label: "In-progress achievements", count: entries.length - unlockedCount },
        { id: "completed", label: "Completed achievements", count: unlockedCount },
      ] as const).map(option => <Button key={option.id} variant={activeFilter === option.id ? "default" : "outline"} size="sm" aria-pressed={activeFilter === option.id} disabled={option.id !== "all" && !progressData} onClick={() => setFilter(option.id)}>{t(option.label)}{(progressData || option.id === "all") && <span className="tabular-nums">{option.count}</span>}</Button>)}</div>
      {visible.length === 0 && <p role="status" className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">{t("No achievements in this view.")}</p>}
      <ul id="achievement-rewards" className="grid gap-3 sm:grid-cols-2">{visible.map(({ item, progress }) => {
        const unlocked = progress?.unlocked ?? false;
        const reward = item.reward;
        const rewardSkin = reward.kind !== "icon" ? skins.find(skin => skin.id === reward.skinId) : undefined;
        const rewardIcon = reward.kind !== "skin" ? profileIcons.find(icon => icon.id === reward.iconId) : undefined;
        const category = item.metric === "rank_tier" ? "Rank board + profile" : item.metric === "achievements" ? "Achievement collection" : item.metric === "solo_time" ? "Time attack" : item.metric === "solo_tile" ? "Endless mode" : item.metric === "attendance_streak" ? "Daily attendance" : "Match achievements";
        const current = unlocked && item.metric !== "solo_time" ? item.target : Math.min(progress?.current ?? 0, item.target);
        return <li key={item.id} id={item.id} className={`flex scroll-mt-6 flex-col rounded-xl border bg-card p-3 sm:p-5 ${unlocked ? "border-primary/30" : ""}`}>
          <div className="flex items-center gap-3 sm:gap-4"><div className="relative flex size-14 shrink-0 items-center justify-center sm:size-20">{rewardSkin && <SkinPreview skin={rewardSkin} />}{rewardIcon && <ProfileIcon iconId={rewardIcon.id} className={rewardSkin ? "absolute -bottom-1 -right-2 size-8 rounded-xl bg-card ring-2 ring-card sm:size-10" : "size-14 sm:size-20"} />}</div><div className="min-w-0"><p className="text-[11px] font-semibold text-primary">{t(category)}</p><h3 className="mt-1 text-lg font-bold">{t(item.name)}</h3><p className="mt-1 text-xs text-muted-foreground">{t("Reward: {name}", { name: t(rewardSkin?.name ?? rewardIcon?.name ?? item.name) })}</p>{reward.kind === "set" && rewardSkin && <p className="mt-1 text-xs font-semibold text-primary">{t(SKIN_RARITIES[rewardSkin.rarity].name)}</p>}</div></div>
          <p className="mb-2 mt-3 text-sm sm:mb-4 sm:mt-5">{t(item.description)}</p>
          <div className="mt-auto">{progress && <><div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs"><span className={`flex items-center gap-1.5 ${unlocked ? "font-semibold text-primary" : "text-muted-foreground"}`}>{unlocked ? <Check aria-hidden="true" className="size-3.5" /> : <LockKeyhole aria-hidden="true" className="size-3.5" />}{t(unlocked ? "Permanently unlocked" : "In progress")}</span><span className="tabular-nums text-muted-foreground">{item.metric === "solo_time" ? progress.current ? t("Best time: {time}", { time: formatSoloTime(progress.current) }) : t("No solo finish yet") : item.metric === "rank_tier" ? t(progress.current ? TIERS[Math.min(progress.current, TIERS.length) - 1] : "Placement") : `${current} / ${item.target}`}</span></div><progress aria-label={t(item.name)} max={100} value={progress.percent} className="block h-2 w-full overflow-hidden rounded-full appearance-none [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary" />{item.metric === "solo_time" && item.id !== "solo-first" && <p className="mt-2 text-xs text-muted-foreground">{t("Target time: {time}", { time: formatSoloTime(item.target) })}</p>}{item.metric === "achievements" && !unlocked && <p className="mt-2 text-xs text-primary">{t("{count} more to go", { count: Math.max(0, item.target - current) })}</p>}</>}
          <Button asChild variant="ghost" className="mt-3 w-full text-xs"><Link href={guest ? "/login" : (item.metric === "solo_time" || item.metric === "solo_tile") && !unlocked ? "/solo" : "/loadout"}>{t(guest ? "Log in" : unlocked ? "My loadout" : item.metric === "solo_time" ? "Start time attack" : item.metric === "solo_tile" ? "Start endless mode" : "Preview in loadout")}</Link></Button></div>
        </li>;
      })}</ul>
    </section>

  </main>;
}
