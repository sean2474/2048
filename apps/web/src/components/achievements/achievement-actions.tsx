"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useI18n } from "ui/i18n";
import { Button } from "@/components/ui/button";
import { useAchievements } from "@/hooks/use-achievements";

export function AttendanceStatus({ checkedInToday }: { checkedInToday: boolean }) {
  const { t } = useI18n();
  const { checkingIn } = useAchievements();
  return <span role="status" className="inline-flex items-center gap-2 text-sm font-semibold text-primary">{checkedInToday && <Check aria-hidden="true" className="size-4" />}{t(checkingIn ? "Checking in…" : checkedInToday ? "Checked in today" : "Automatic attendance")}</span>;
}

export function AchievementNotices({ names, showSyncError }: { names: Record<string, string>; showSyncError: boolean }) {
  const { t } = useI18n();
  const { error, checkInError, newRewards, reload, loading } = useAchievements();
  return <>
    {error && showSyncError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm"><p>{t("Could not load achievement progress.")}</p><Button variant="outline" disabled={loading} onClick={() => void reload()}>{t("Reload unlock information")}</Button></div>}
    {checkInError && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive"><p>{t("Could not save attendance. Please try again.")}</p><Button variant="outline" disabled={loading} onClick={() => void reload()}>{t("Retry attendance")}</Button></div>}
    {newRewards.length > 0 && <p role="status" className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm font-semibold">{t("New rewards unlocked: {names}", { names: newRewards.map(id => names[id] ?? id).join(", ") })}</p>}
  </>;
}

export function AchievementRetry({ label }: { label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <Button variant="outline" disabled={pending} onClick={() => startTransition(() => router.refresh())}>{label}</Button>;
}
