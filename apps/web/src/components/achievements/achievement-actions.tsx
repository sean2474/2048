"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { useI18n } from "ui/i18n";
import { Button } from "@/components/ui/button";
import { useAchievements } from "@/hooks/use-achievements";

export function AttendanceStatus({ checkedInToday }: { checkedInToday: boolean }) {
  const { t } = useI18n();
  const { checkingIn } = useAchievements();
  return <span role="status" className="inline-flex items-center gap-2 text-sm font-semibold text-primary">{checkedInToday && <Check aria-hidden="true" className="size-4" />}{t(checkingIn ? "Checking in…" : checkedInToday ? "Checked in today" : "Automatic attendance")}</span>;
}

export function AchievementNotices({ names, readError }: { names: Record<string, string>; readError: boolean }) {
  const { t } = useI18n();
  const { data, error, checkInError, newRewards, reload, loading } = useAchievements();
  const router = useRouter();
  useEffect(() => {
    // An unchanged successful action can recover a failed initial RSC read.
    // A refresh with the same data/error state must not retry itself.
    if (readError && data && !loading && !error) router.refresh();
  }, [readError, data, loading, error, router]);
  return <>
    {error && !readError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm"><p>{t("Could not load achievement progress.")}</p><Button variant="outline" disabled={loading} onClick={() => void reload()}>{t("Reload unlock information")}</Button></div>}
    {checkInError && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive"><p>{t("Could not save attendance. Please try again.")}</p><Button variant="outline" disabled={loading} onClick={() => void reload()}>{t("Retry attendance")}</Button></div>}
    {newRewards.length > 0 && <p role="status" className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm font-semibold">{t("New rewards unlocked: {names}", { names: newRewards.map(id => names[id] ?? id).join(", ") })}</p>}
  </>;
}

export function AchievementRetry({ label }: { label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <Button variant="outline" disabled={pending} onClick={() => startTransition(() => router.refresh())}>{label}</Button>;
}
